---
phase: 01-walking-skeleton
verified: 2026-10-10T06:30:00Z
status: passed
score: 7/7 must-haves verified
covered_files:
  - ".dockerignore"
  - ".env.example"
  - ".gitattributes"
  - ".gitignore"
  - ".planning/phases/01-walking-skeleton/01-01-PLAN.md"
  - ".planning/phases/01-walking-skeleton/01-01-SUMMARY.md"
  - ".planning/phases/01-walking-skeleton/01-02-PLAN.md"
  - ".planning/phases/01-walking-skeleton/01-02-SUMMARY.md"
  - ".planning/phases/01-walking-skeleton/01-03-PLAN.md"
  - ".planning/phases/01-walking-skeleton/01-03-SUMMARY.md"
  - ".planning/phases/01-walking-skeleton/01-04-PLAN.md"
  - ".planning/phases/01-walking-skeleton/01-04-SUMMARY.md"
  - ".planning/phases/01-walking-skeleton/01-05-PLAN.md"
  - ".planning/phases/01-walking-skeleton/01-05-SUMMARY.md"
  - ".planning/phases/01-walking-skeleton/01-06-PLAN.md"
  - ".planning/phases/01-walking-skeleton/01-06-SUMMARY.md"
  - ".planning/phases/01-walking-skeleton/01-07-PLAN.md"
  - ".planning/phases/01-walking-skeleton/01-07-SUMMARY.md"
  - ".planning/phases/01-walking-skeleton/01-08-PLAN.md"
  - ".planning/phases/01-walking-skeleton/01-08-SUMMARY.md"
  - "CLAUDE.md"
  - "Dockerfile"
  - "README.md"
  - "backend/app/config.py"
  - "backend/app/errors.py"
  - "backend/app/main.py"
  - "backend/tests/conftest.py"
  - "backend/tests/test_config.py"
  - "backend/tests/test_errors.py"
  - "backend/tests/test_health.py"
  - "frontend/next.config.ts"
  - "frontend/src/app/page.tsx"
  - "frontend/src/lib/api.ts"
  - "planning/API_CONTRACT.md"
  - "test/playwright.config.ts"
  - "test/smoke.spec.ts"
covered_digest: "v3:sha256:8bffe50899f057e51426ab6a05761cc981c8e209347b9ee014507ff4f477da89"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 6/7
  gaps_closed: []
  gaps_remaining: []
  regressions: []
deferred: []
human_verification: []
---

# Phase 1: Walking Skeleton Verification Report

**Phase Goal:** A developer can build and run an end-to-end skeleton of FinAlly on this machine (local and in Docker) against one frozen API/SSE contract
**Verified:** 2026-10-10T06:30:00Z
**Status:** passed
**Re-verification:** Yes. Re-verification of the shipped phase against the CURRENT codebase (after Phases 2-6). The previous report was stale because later phases legitimately edited files it covered. Later-phase evolution is not treated as regression where the phase goal and requirements still hold.

## Goal Achievement

All five roadmap Success Criteria still hold in the current code. The skeleton has since been grown into the full app by Phases 2-6, but every Phase 1 deliverable (clean repo, uv backend with health and JSON error envelope, Next.js static export with Tailwind dark theme, Docker image, frozen contract) is present, wired and exercised. The two human-only items from the prior report (interrupted docker build, judgment-tier prohibitions) were confirmed in `01-UAT.md` (2/2 passed), so no human items remain open.

Note on mode: ROADMAP marks Phase 1 `Mode: mvp`, but its goal is a developer-capability statement, not an "As a ..., I want ..., so that ..." user story, so the user-story format guard does not apply. Verification used the standard goal-backward method against the stated goal and success criteria.

### Observable Truths (ROADMAP Success Criteria are the contract)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: `backend/static/` and `test/node_modules/` gone from git and ignored; `.gitattributes` forces LF for `.sh`, Dockerfile, env files; README/CLAUDE.md describe the real state | VERIFIED | `git ls-files backend/static test/node_modules` = 0 lines; `git check-ignore -v` matches `.gitignore:205` (backend/static/) and `:198` (node_modules/); `git check-attr eol` = lf for `scripts/start_mac.sh`, `Dockerfile`, `.env.example`, `.dockerignore`; `.gitattributes` has `*.sh`, `Dockerfile`, `.env*`, `*.env` rules; `frontend/src/lib/api.ts` is tracked and not ignored; `db/.gitkeep` is the only tracked file in `db/` (`db/finally.db` ignored via `.gitignore:212`); `.env` untracked. README "Status" section lists what each phase actually built (no unbuilt claim), CLAUDE.md points to `planning/API_CONTRACT.md` and tracks progress in `.planning/`. |
| 2 | SC2: `uv run python -m pytest` passes in `backend/`; local run loads root `.env` and the config env vars and answers `GET /api/health` 200 | VERIFIED | `uv run python -m pytest -q`: 329 passed (full suite, includes later phases). `test_config.py` + `test_errors.py` + `test_health.py`: 29 passed. Full suite re-run with `SIM_SEED=not-an-int SIM_EVENT_PROBABILITY=bogus LLM_MOCK=true` exported: 329 passed (hermetic). Live `uvicorn --factory app.main:create_app` with `SIM_EVENT_PROBABILITY= SIM_SEED=` blank (what `.env.example` produces) and a temp `DB_PATH`: `GET /api/health` -> 200 `{"status":"ok"}`. `config.py`: `env()` strips and treats blank as unset for every variable, `load_dotenv(ROOT_DIR/".env", override=False)` so real env wins, `DB_PATH` defaults to root `db/finally.db`. |
| 3 | SC3: frontend builds a static export (`output: 'export'`) of a Tailwind dark page | VERIFIED | `npm --prefix frontend run build`: compiled, TypeScript passed, routes `/` and `/_not-found` prerendered static; `next.config.ts` sets `output: "export"` outside dev; built CSS contains `#0d1117`, `#ecad0a`, `#209dd7`; `git status` unchanged by the build (`frontend/out/` ignored). The page is now the full terminal UI (Phase 2-5 evolution of the placeholder), still a Tailwind dark static export. |
| 4 | SC4: `docker build` succeeds with TLS verification on; container serves page and `/api/health` on :8000 with one worker; host Playwright smoke loads the page | VERIFIED (current Dockerfile; Docker run evidence from Phase 6) | `Dockerfile` unchanged since `85f71e1` (01-08): `node:24-slim` -> `python:3.12-slim` + `uv 0.12.17`, `set -e; uv sync --locked`, `USER app`, `HEALTHCHECK` on `/api/health`, `CMD uvicorn --factory ... --workers 1`, extra CA only via optional BuildKit secret in throwaway stages, no `verify=False`/insecure tokens. Per instruction no Docker build was started; `06-VERIFICATION.md` (this Dockerfile, built and run) records container E2E `passed 20, skipped 0, failed 0` via host Playwright, plus persistence checks. Host Playwright works on this machine (no container fallback needed): `npm --prefix test run smoke` run now against the fresh build: 19 passed, 1 skipped (`zz-reconnect`, container-only by design), including `smoke.spec.ts` fresh-start streaming. |
| 5 | SC5: one API/SSE contract doc in `planning/` defines every endpoint, shapes, `{"error"}` format, status codes, SSE payload (`change_percent` from session-start price), `GET /api/chat/history`; backend and frontend reference it | VERIFIED | `planning/API_CONTRACT.md` (271 lines) has sections for health, watchlist (GET/POST/DELETE), portfolio, trade, history, chat, chat/history, SSE `PriceUpdate`; `change_percent = round((price/session_start_price - 1)*100, 4)`; unknown `/api/*` any method = 404 `{"error":"Not found"}`. Every implemented route in `backend/app/*.py` (9 `@router` routes + health) maps to a contract section. Live SSE sample from the running backend carries `ticker, price, previous_price, timestamp, change, change_percent, direction, session_start_price`. Referenced from `backend/app/main.py:1`, `frontend/src/lib/api.ts:1`, `frontend/src/lib/types.ts:1`, `CLAUDE.md:6`. No legacy `day_change_percent`/`reference_price` in `planning/*.md`. |

### Plan-level truths checked (beyond the roadmap SCs)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 6 | Image has no CA material or `.env`; build fails on bad `uv sync --locked`; runtime is non-root; all HTTP methods on unknown `/api/*` return JSON 404 | VERIFIED | Dockerfile read (above): CA only via `--mount=type=secret` in builder stages, final stage copies only `.venv`, `app`, `static`; `set -e` before `uv sync --locked`; `USER app` after chown of `/app/db`. Live: GET/POST/PUT/DELETE/PATCH/OPTIONS/PROPFIND on `/api/nope` all 404 `{"error":"Not found"}`, HEAD 404. Implemented by `app.add_route("/api/{path:path}", JSONResponse(...))` in `main.py:54`, included after all routers and before the static mount. |
| 7 | An interrupted docker build re-runs cleanly (backstop truth, 01-05) | VERIFIED (human) | Non-inferable backstop truth; confirmed by human in `01-UAT.md` test 1: result pass. Re-run succeeds with no manual cleanup, image healthy and free of CA material. |

**Score:** 7/7 truths verified, 0 behavior-unverified, 0 failed.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.gitignore` / `.gitattributes` / `db/.gitkeep` / `.dockerignore` | Ignore, LF, mount dir | VERIFIED | Checked above |
| `.env.example` | Six variable names, no secrets, boots with blanks | VERIFIED | All 6 blank/`false`; live boot with blanks OK |
| `backend/app/{config,main,errors}.py`, `pyproject.toml`, `uv.lock` | uv project, factory, health, envelope | VERIFIED | Substantive; 329 tests pass |
| `backend/tests/{conftest,test_config,test_errors,test_health}.py` | Hermetic suite | VERIFIED | Passes with garbage env exported |
| `frontend/next.config.ts`, `package.json`, `src/app/*`, `src/lib/api.ts` | Static export + Tailwind | VERIFIED | Built; `api.ts` is now the full typed client (superset of Phase 1 `getHealth`) |
| `planning/API_CONTRACT.md` | Frozen contract | VERIFIED | Content checked against routes |
| `Dockerfile` | 3-stage image, 1 worker, healthcheck, non-root, fail-fast | VERIFIED | Read in full; unchanged since 01-08; Phase 6 E2E ran against it |
| `test/playwright.config.ts`, `test/smoke.spec.ts` | Host Playwright local and container | VERIFIED | Smoke run: 19 passed, 1 container-only skip |
| `README.md`, `CLAUDE.md` | Truthful status | VERIFIED | Match built code (Phases 1-6 all described as built) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Dockerfile | frontend/out | `COPY --from=frontend /fe/out /app/static` | WIRED | Phase 6 container E2E serves the UI |
| Dockerfile | backend app | `CMD uvicorn --factory app.main:create_app --workers 1` | WIRED | Present in file |
| Dockerfile | uv.lock | `set -e; uv sync --locked` | WIRED | Present; uv.lock tracked |
| config.py `env()` | all settings | single reader | WIRED | Blank values -> defaults (live) |
| main.py catch-all | any method on unknown `/api/*` | `add_route` + `JSONResponse` | WIRED | Live, 7 methods + HEAD |
| main.py `StaticFiles` mount | `STATIC_DIR` export | mounted last, only if dir exists | WIRED | Smoke served the page |
| playwright.config.ts | backend | webServer uvicorn --factory + STATIC_DIR | WIRED | Smoke ran locally |
| backend/frontend | API_CONTRACT.md | doc references + shapes | WIRED | Live SSE payload matches contract fields |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Real Data | Status |
|----------|---------------|--------|-----------|--------|
| `page.tsx` (terminal UI) | price/watchlist/portfolio stores | `/api/stream/prices` SSE, `/api/watchlist`, `/api/portfolio` | Yes (live SSE sample shows simulator prices; smoke asserts streaming rows) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend full suite | `uv run python -m pytest -q` (backend) | 329 passed | PASS |
| Hermetic under bad env | same with `SIM_SEED=not-an-int SIM_EVENT_PROBABILITY=bogus LLM_MOCK=true` | 329 passed | PASS |
| Blank env values boot | uvicorn with `SIM_EVENT_PROBABILITY= SIM_SEED=`, curl `/api/health` | 200 `{"status":"ok"}` | PASS |
| Unknown API path, any method | curl GET/POST/PUT/DELETE/PATCH/OPTIONS/PROPFIND/HEAD `/api/nope` | 404 `{"error":"Not found"}` | PASS |
| SSE payload shape | curl `/api/stream/prices` | `data: {"AAPL": {..., "change_percent", "session_start_price"}}` | PASS |
| Frontend export | `npm --prefix frontend run build` | success, static routes, theme colors in CSS | PASS |
| Host Playwright | `npm --prefix test run smoke` | 19 passed, 1 skipped | PASS |
| Frontend unit suite | (orchestrator-reported) `npx vitest run` | 345 passed | PASS (reported) |

My scratch uvicorn on port 8123 was terminated; port 8000 and 8123 are free.

### Probe Execution

SKIPPED. No probe scripts declared or present for this phase.

### Requirements Coverage

All eight phase IDs are claimed by plan frontmatter (01-01 FND-01; 01-02 FND-04, FND-06; 01-03 FND-02, FND-05, PORT-08; 01-04 FND-03; 01-05 PKG-01, FND-06; 01-06 FND-05, FND-02, PORT-08; 01-07 FND-03; 01-08 PKG-01). REQUIREMENTS.md maps exactly FND-01..06, PORT-08 and PKG-01 to Phase 1, all checked `[x]` and marked Complete. No orphaned requirements.

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| FND-01 | 01-01 | Build artifacts untracked/ignored, `.gitattributes` LF | SATISFIED | SC1 evidence |
| FND-02 | 01-03, 01-06 | uv backend, factory, `uv run python -m pytest` | SATISFIED | 329 passed, hermetic |
| FND-03 | 01-04, 01-07 | Next TS static export + Tailwind | SATISFIED | Build verified |
| FND-04 | 01-02 | Contract in `planning/` | SATISFIED | API_CONTRACT.md matches routes |
| FND-05 | 01-03, 01-06 | Env config incl. `SIM_EVENT_PROBABILITY`; dev loads root `.env` | SATISFIED | `config.py`; blank-template boot live |
| FND-06 | 01-02, 01-05 | README/CLAUDE.md status accurate | SATISFIED | README Status matches Phases 1-6 as built |
| PORT-08 | 01-03, 01-06 | `GET /api/health` | SATISFIED | 200 live and in `test_health.py` |
| PKG-01 | 01-05, 01-08 | Multi-stage Node 24 -> Python 3.12 + uv `--locked`, port 8000, one worker | SATISFIED | Dockerfile read; Phase 6 container E2E green |

### Prohibitions (judgment-tier; confirmed by human in 01-UAT.md test 2)

| Prohibition | Verdict | Evidence |
|-------------|---------|----------|
| MUST NOT bake an interception root into the image or committed files | Holds | Dockerfile uses CA only as optional BuildKit secret in builder stages; final stage copies only venv/app/static; no cert material committed |
| MUST NOT disable/weaken TLS verification | Holds | No `verify=False`, `NODE_TLS_REJECT`, `insecure`, `strict-ssl` in Dockerfile, test config or app code (Dockerfile read in full) |
| MUST NOT claim unbuilt components in README | Holds | README Status lists only phases that are built; Phase 6 artifacts confirm they exist |

### Anti-Patterns Found

None blocking. No `TBD`/`FIXME`/`XXX` in the covered implementation files reviewed (`config.py`, `main.py`, `Dockerfile`, `next.config.ts`, `playwright.config.ts`). Prior review warning WR-01 (catch-all returning 404 rather than 405 on a wrong method for real routes) is now an explicit contract rule ("the API never answers 405", `API_CONTRACT.md:23`), so it is resolved by documentation.

### Evolution Notes (not regressions)

- `test/health-status.spec.ts` and `getHealth()` / the `api-status` placeholder line from 01-07 no longer exist: Phase 2 replaced the placeholder page with the terminal UI, and `/api/health` remains covered by `backend/tests/test_health.py`, the Docker HEALTHCHECK, and Playwright `webServer` readiness. The goal and PORT-08 still hold.
- `uv run python -m pytest` count grew from 30 to 329 as later phases added tests.

### Human Verification Required

None open. Both items from the earlier report passed in `01-UAT.md` (2/2, 0 issues).

### Gaps Summary

None. Phase goal achieved in the current codebase.

---

_Verified: 2026-10-10T06:30:00Z_
_Verifier: Claude (gsd-verifier)_
