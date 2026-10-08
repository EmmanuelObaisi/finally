---
phase: "01"
slug: "walking-skeleton"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-08"
---

# Phase 01 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| working tree -> git history | Anything staged is published with the repo | Secrets (API keys) must never cross |
| browser -> FastAPI | Untrusted HTTP requests (any method) reach `/api/*` and the static mount | Request paths and bodies (untrusted) |
| environment / `.env` -> Settings | Config values and API keys enter process memory | API keys (secret) |
| registries -> build | npm, PyPI, Docker Hub and ghcr.io code enters, possibly via a TLS-intercepting proxy | Third-party packages and base images |
| host repo -> Docker build context | Everything not in `.dockerignore` reaches the builder | Source; `.env` excluded |
| build stages -> final image | Only explicitly copied paths ship | Venv, app code, static export; no CA material |
| API response -> page DOM | Health status decides what the page shows | Fixed status strings only |
| contract doc -> code | Later phases implement `planning/API_CONTRACT.md` exactly | Specification |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-01-01 | Information disclosure | `.env` / `.env.example` | high | mitigate | `.env` ignored, template holds names only (01-VERIFICATION SC1) | closed |
| T-01-02 | Tampering | stale `backend/static` export | medium | mitigate | Untracked and ignored (`git check-ignore`, `git ls-files` empty) | closed |
| T-01-03 | Denial of service | hygiene `rm -rf` commands | medium | mitigate | Deletion scoped; `.env` and `test/node_modules/@playwright/test` kept (01-01-SUMMARY) | closed |
| T-01-04 | Tampering | `planning/API_CONTRACT.md` drift | medium | mitigate | Single contract file; CLAUDE.md points to it | closed |
| T-01-05 | Information disclosure | error envelope rules | medium | mitigate | Contract mandates `{"error": "Internal server error"}` for 500 | closed |
| T-01-06 | Tampering | ticker and trade input rules | low | mitigate | Contract fixes `[A-Z][A-Z.]{0,9}` and `quantity` > 0 (API_CONTRACT.md:118-119) | closed |
| T-01-07 | Information disclosure | `errors.py` unhandled exceptions | medium | mitigate | `unhandled_error` returns generic body; asserted in `backend/tests` | closed |
| T-01-08 | Information disclosure | `config.py` / `GET /api/health` | medium | mitigate | No print/logging in `config.py`; health returns `{"status": "ok"}` | closed |
| T-01-09 | Tampering | `StaticFiles` mount (path traversal) | low | accept | See AR-01 | closed |
| T-01-10 | Tampering | TLS during `uv add` / `uv sync` | high | mitigate | No `allow-insecure-host` / `UV_INSECURE_HOST` in backend or Dockerfile | closed |
| T-01-11 | Tampering | build-time network fetches | medium | mitigate | No `next/font/google` in frontend | closed |
| T-01-12 | Information disclosure | `page.tsx` rendering API text | low | accept | See AR-02 | closed |
| T-01-13 | Tampering | TLS during `npm install` | high | mitigate | No `NODE_TLS_REJECT_UNAUTHORIZED` / `strict-ssl` in frontend, test, Dockerfile | closed |
| T-01-14 | Information disclosure | build context / image (`.env`) | high | mitigate | `.dockerignore` excludes env files; `/app` holds only `.venv app db static` (01-VERIFICATION #6) | closed |
| T-01-15 | Spoofing | interception root CA in shipped image | high | mitigate | Secret mounted only in build stages; `docker history` and `/app`, `/etc/ssl` free of CA material (re-checked after interrupted build, 01-UAT test 1) | closed |
| T-01-16 | Tampering | TLS verification during the build | high | mitigate | Dockerfile has no verification-disabling or CA-install tokens | closed |
| T-01-17 | Tampering | base images and uv binary | low | accept | See AR-03 | closed |
| T-01-18 | Denial of service | container readiness | low | mitigate | `HEALTHCHECK` on `/api/health`; container reached `healthy` | closed |
| T-01-19 | Information disclosure | tests reading the real root `.env` | low | mitigate | `isolated_env` fixture in `backend/tests/conftest.py` | closed |
| T-01-20 | Denial of service | `Settings.from_env()` on empty values | medium | mitigate | `env()` strips and treats empty as unset (`config.py`) | closed |
| T-01-21 | Information disclosure | unknown `/api` requests reaching `StaticFiles` | low | mitigate | All-method catch-all `add_route` before the static mount (`main.py`); 9-method test in `test_errors.py` | closed |
| T-01-22 | Tampering | `api-status` on non-2xx health | low | mitigate | `getHealth()` checks `res.ok`; `test/health-status.spec.ts` | closed |
| T-01-23 | Information disclosure | rendering server error text in page | low | accept | See AR-04 | closed |
| T-01-24 | Elevation of privilege | uvicorn running as root | medium | mitigate | `USER app`; container `id -un` = app | closed |
| T-01-25 | Tampering | masked failed `uv sync --locked` | medium | mitigate | `set -e;` before `uv sync --locked`; garbage-lock build fails (01-VERIFICATION #6) | closed |
| T-01-26 | Denial of service | `/app/db` not writable by non-root | low | mitigate | `chown app:app /app/db` before `USER app` | closed |
| T-01-SC | Tampering | npm / PyPI / Docker installs | high | mitigate | Lockfiles committed (`uv.lock`, both `package-lock.json`); Docker uses `npm ci` and `uv sync --locked`; package-legitimacy checkpoints in 01-03/01-04 | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-01-09 | Starlette `StaticFiles` confines lookups to its directory; low severity for a local single-user demo | plan 01-03 | 2026-10-08 |
| AR-02 | T-01-12 | React escapes text content; no raw-HTML injection anywhere | plan 01-04 | 2026-10-08 |
| AR-03 | T-01-17 | Base images and uv pinned by tag, not digest; acceptable at ASVS L1 for a local demo | plan 01-05 | 2026-10-08 |
| AR-04 | T-01-23 | Page renders only the fixed string "down", never server error text | plan 01-07 | 2026-10-08 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-08 | 27 | 27 | 0 | /gsd-secure-phase (L1 grep verification, orchestrator) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-08
