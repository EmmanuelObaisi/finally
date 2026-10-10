---
phase: "06"
slug: "one-command-launch-full-verification"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-10"
---

# Phase 06 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| LAN -> published host port | The API has no auth; any host that reaches the port can trade and spend OpenRouter credit through chat | HTTP requests to `/api/*` |
| Host shell and `.env` -> container env | Values cross into the container through env_file and compose interpolation | OPENROUTER_API_KEY, MASSIVE_API_KEY, LLM_MOCK, FINALLY_PORT |
| Automated checks -> Docker daemon | `test/e2e.mjs`, `test/persist.mjs` and the reconnect spec create, restart and remove containers and volumes next to the user's own | Compose project names, container ids, volumes |
| Test container -> network | A container without the mock pins would call OpenRouter or Massive with the user's keys | API keys, LLM prompts |
| Wrapper -> terminal and logs | Output is read by humans and agents | Status lines, Playwright output |
| Specs -> shared test database | Specs mutate one throwaway database per run | Trades, positions, chat rows |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-06-01 | Elevation of privilege | `docker-compose.yml` ports | high | mitigate | Only `127.0.0.1:${FINALLY_PORT:-8000}:8000` is published (`docker-compose.yml:8`); no all-interfaces address in the file | closed |
| T-06-02 | Information disclosure | Secrets in the image or script output | high | mitigate | `.env` enters only through the optional `env_file` (`docker-compose.yml:9-11`); `.dockerignore` excludes env files; scripts print only the URL and fixed notes | closed |
| T-06-03 | Tampering | Caller's shell env leaking into the container | medium | mitigate | Base compose interpolates only `FINALLY_PORT`; `test/compose.e2e.yml` pins `LLM_MOCK`, `MASSIVE_API_KEY`, `SIM_SEED` as literals; 06-01 hostile-shell check passed | closed |
| T-06-04 | Tampering | Automated checks touching the user's data or images | high | mitigate | Private projects (`finally-test`, `finally-persist`, probe projects), image `finally-e2e`, explicit `-p` on every compose call; user volume and `finally:*` image ids compared before and after | closed |
| T-06-05 | Tampering | `down -v` in `test/e2e.mjs` | high | mitigate | `COMPOSE = ["compose", "-p", "finally-test", ...]` (`test/e2e.mjs:14`) plus `COMPOSE_PROJECT_NAME`; every `down -v` goes through it | closed |
| T-06-06 | Tampering (cost) | Real LLM or Massive calls from the test container | high | mitigate | Literal pins in `test/compose.e2e.yml`; `test/e2e.mjs:28-33` checks `LLM_MOCK` and an empty `MASSIVE_API_KEY` inside the container before Playwright runs | closed |
| T-06-07 | Information disclosure | Wrapper output | medium | mitigate | No environment or `docker compose config` dump; the only `printenv` reads `LLM_MOCK` (a non-secret flag) into a captured string | closed |
| T-06-08 | Tampering / Denial of service | `docker restart` in `test/zz-reconnect.spec.ts` | high | mitigate | Restarts only `process.env.E2E_CONTAINER` (`:51`) and the spec is skipped without it (`:8`) | closed |
| T-06-09 | Tampering | Cross-spec residue in the shared database | low | mitigate | Delta assertions read state first; new specs end flat for their tickers; `zz-` prefix fixes the reconnect spec last; the database is throwaway per run | closed |
| T-06-10 | Tampering | `down -v` and script runs in `test/persist.mjs` | high | mitigate | `compose()` always passes `-p finally-persist` (`test/persist.mjs:35`); the real stop scripts only run `docker compose down` without `-v` | closed |
| T-06-11 | Information disclosure | `.env` delivery check | high | mitigate | Host side is a boolean regex test (`test/persist.mjs:102`); container side is `test -n` (`:106`); only booleans are printed | closed |
| T-06-12 | Tampering (cost) | Mock chat turn in the persistence check | high | mitigate | `assertMockPins()` (`test/persist.mjs:91`) runs before the chat call (`:143`) | closed |
| T-06-13 | Tampering (cost) | New backend route tests | medium | mitigate | The chat test uses the `mock_client` fixture (`backend/tests/test_chat.py:26`, LLM_MOCK on, no network); the history test needs no LLM | closed |
| T-06-SC | Tampering | npm/pip/cargo installs | low | accept | No packages installed in this phase; TLS verification is never disabled (no matches in `test/`, `scripts/`, compose files) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-06-01 | T-06-SC | Phase 6 installs no new packages; existing pins and lockfiles are unchanged | plan-time threat model (06-01..06-05) | 2026-10-10 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-10 | 14 | 14 | 0 | secure-phase (L1 grep-depth, orchestrator) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-10
