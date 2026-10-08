---
phase: "02"
slug: "live-market-terminal"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-08"
---

# Phase 02 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser to FastAPI | Same-origin REST and SSE on port 8000 | Prices, watchlist, portfolio (no secrets) |
| FastAPI to SQLite | Local file at `DB_PATH` | User cash, watchlist, positions |
| Backend to api.massive.com | Optional REST polling over TLS | Massive API key (outbound header), price snapshots (untrusted input) |
| Build to PyPI / npm / Docker Hub | Package and image installs under TLS interception | Third-party code |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-02-01 | Denial of service | uvicorn shutdown with open SSE streams | medium | mitigate | `--timeout-graceful-shutdown` in `test/playwright.config.ts:18` and `Dockerfile:40`; `backend/tests/market/test_shutdown.py` | closed |
| T-02-02 | Denial of service | Unbounded concurrent SSE connections | low | accept | AR-01 | closed |
| T-02-03 | Information disclosure | SSE payload | low | mitigate | `backend/app/market/stream.py:20` yields only `PriceUpdate.to_dict()` values | closed |
| T-02-04 | Tampering | TLS during `uv add` / `uv sync` | high | mitigate | Only `UV_SYSTEM_CERTS=1` used; no insecure-host option or env var anywhere in the repo (grep) | closed |
| T-02-05 | Tampering | SQL in `db.py`, `watchlist.py`, `portfolio.py` | medium | mitigate | All values are `?` parameters; no f-string, `%` or `.format` SQL (grep) | closed |
| T-02-06 | Information disclosure | Database errors surfacing to clients | medium | mitigate | `backend/app/errors.py:23` returns fixed `{"error": "Internal server error"}` | closed |
| T-02-07 | Tampering | User data on restart | medium | mitigate | `backend/app/db.py:80-84` seeds inside `BEGIN IMMEDIATE` only when no `users_profile` row exists; restart test in `test_db.py` | closed |
| T-02-08 | Elevation of privilege | `DB_PATH` from env selects any writable file | low | accept | AR-02 | closed |
| T-02-09 | Tampering | `SIM_SEED` / `SIM_EVENT_PROBABILITY` values | low | accept | AR-03 | closed |
| T-02-10 | Information disclosure | Massive API key in logs or responses | high | mitigate | No code logs the key or settings; `test_massive.py:233-244` asserts the key is absent from log output; no endpoint returns it | closed |
| T-02-11 | Spoofing | TLS to api.massive.com | high | mitigate | Client defaults keep certifi verification on; no `verify=False` or `cert_reqs` (grep). The WR-05 truststore change was reverted (32a4eef) because certifi verifies successfully on this machine | closed |
| T-02-12 | Denial of service | Free plan 5 calls/min budget | medium | mitigate | `massive_client.py`: `MAX_EOD_LOOKBACK = 5`, weekday-only walk-back, `eod_interval = 900.0`; covered by `test_massive.py` (review IN-04 notes a worst-case 6-call startup, below block threshold) | closed |
| T-02-13 | Tampering | Untrusted price values in Massive responses | low | mitigate | `massive_client.py:123` skips missing or zero prices; `PriceCache.update` ignores prices that round to zero (WR-06 fix) | closed |
| T-02-14 | Tampering | Ticker strings rendered in rows (XSS) | medium | mitigate | React text rendering only; no `dangerouslySetInnerHTML` or `innerHTML` in `frontend/src` (grep) | closed |
| T-02-15 | Information disclosure | Error state copy | low | mitigate | Only fixed UI-SPEC strings render; server error bodies never reach the DOM | closed |
| T-02-16 | Tampering | TLS during `npm install` | high | mitigate | Only `NODE_EXTRA_CA_CERTS` used; no strict-ssl or reject-unauthorized overrides (grep) | closed |
| T-02-17 | Tampering | Footer external link (reverse tabnabbing) | low | mitigate | `frontend/src/components/Footer.tsx:10` `rel="noopener noreferrer"` | closed |
| T-02-18 | Denial of service | Reconnect loop after errors | low | mitigate | `frontend/src/lib/useMarketStream.ts:8` `BACKOFF_MS = [1000, 2000, 4000, 10000]`; UAT test 2 observed recovery against a real server | closed |
| T-02-19 | Information disclosure | Portfolio fetch errors in the header | low | mitigate | Failed fetch keeps "--" with no error text | closed |
| T-02-20 | Denial of service | Client sparkline buffers | low | mitigate | `frontend/src/lib/store.ts:10,43` `SPARK_CAP = 300`; chart re-seeded from the capped buffer (WR-01 fix) | closed |
| T-02-21 | Information disclosure | Secrets in the image | medium | mitigate | `.dockerignore:6-8` excludes `.env` and `.env.*` | closed |
| T-02-22 | Denial of service | `docker stop` with open SSE clients | medium | mitigate | `Dockerfile:40` `--timeout-graceful-shutdown 3`; 02-07 measured a 4 s stop with an open stream | closed |
| T-02-23 | Tampering | TLS inside `docker build` | high | mitigate | Only the `extra_ca` build secret path exists; no verification override in `Dockerfile` (grep) | closed |
| T-02-SC | Tampering | PyPI and npm installs for the phase | high | mitigate | User-approved package gate (02-01 Task 1); exact pins in `backend/pyproject.toml` and `frontend/package.json`; committed lockfiles; Docker uses `npm ci` and `uv sync --locked` | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-02-02 | Single-user local app; each SSE connection costs one 0.1 s integer-compare loop | Phase 2 plan (02-01) | 2026-10-08 |
| AR-02 | T-02-08 | The single local user already controls the environment; the Docker image fixes `DB_PATH=/app/db/finally.db` | Phase 2 plan (02-02) | 2026-10-08 |
| AR-03 | T-02-09 | A malformed value fails `Settings.from_env()` at startup by design; only the local user sets these | Phase 2 plan (02-03) | 2026-10-08 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-08 | 24 | 24 | 0 | gsd-secure-phase (L1 grep, orchestrator; auditor skipped per short-circuit rule) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-08
