---
phase: 01-walking-skeleton
verified: 2026-10-08T09:30:00Z
status: passed
score: 6/7 must-haves verified
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
  - "test/health-status.spec.ts"
  - "test/playwright.config.ts"
  - "test/smoke.spec.ts"
covered_digest: "v3:sha256:b39f877fa35e0562a1a3888172e02db8ea2c0a39a8588f2830816651975e43fd"
behavior_unverified: 1
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 6/7
  gaps_closed:
    - "SC2 / FND-05: empty SIM_EVENT_PROBABILITY (committed .env.example) crashed Settings.from_env() (CR-01)"
  gaps_remaining: []
  regressions: []
deferred: []
behavior_unverified_items:
  - truth: "An interrupted docker build can be re-run without manual cleanup and yields an image that passes the same checks, with no CA material baked in (backstop, insufficient_spec)"
    test: "Start `docker build --no-cache -t finally:int .` and kill it mid-build (during the uv sync or npm ci step), then re-run the same command"
    expected: "Second build completes with exit 0 with no manual cleanup; resulting image passes /api/health and has no CA material (docker history has no extra_ca/avast/BEGIN CERTIFICATE)"
    why_human: "No test or executor run exercises interrupt recovery (01-05-SUMMARY records human_judgment: true). My rebuilds were fully cached, so they are not evidence of interrupt recovery."
human_verification:
  - test: "Interrupt a docker build mid-way and re-run it"
    expected: "Re-run succeeds with no manual cleanup; image is healthy and free of CA material"
    why_human: "Backstop truth; no test exercises it"
  - test: "Confirm the three judgment-tier prohibition verdicts (Prohibitions table)"
    expected: "No interception root committed or baked, TLS verification never disabled, README makes no unbuilt claims"
    why_human: "Judgment-tier prohibitions are NON-AUTHORITATIVE (unverified-prohibition - human review recommended)"
---

# Phase 1: Walking Skeleton Verification Report

**Phase Goal:** A developer can build and run an end-to-end skeleton of FinAlly on this machine (local and in Docker) against one frozen API/SSE contract
**Verified:** 2026-10-08T09:30:00Z
**Status:** human_needed
**Re-verification:** Yes - after gap closure (plans 01-06, 01-07, 01-08)

## Goal Achievement

The blocker from the first report (CR-01: empty `SIM_EVENT_PROBABILITY=` in the committed `.env.example` crashed startup) is closed and re-proven by direct execution locally and inside the rebuilt image. All five roadmap Success Criteria are verified. The phase goal is achieved. The only reason the status is not `passed` is the unchanged human-routed items: one backstop truth (interrupted docker build) that no test exercises, and the non-authoritative judgment-tier prohibition verdicts. No gaps remain.

### Observable Truths (ROADMAP Success Criteria are the contract)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: `backend/static/` and `test/node_modules/` gone from git and ignored; `.gitattributes` forces LF; README/CLAUDE.md describe the real state | VERIFIED | `git ls-files backend/static test/node_modules` = 0; `git check-ignore -v` matches .gitignore:205 and :198; `git check-attr eol` = lf for `scripts/start_mac.sh`, `Dockerfile`, `.env.example`, `.dockerignore`; `frontend/src/lib/api.ts` not ignored; `db/.gitkeep` present; `.env` untracked; README "Not built yet" line lists market data, database, trading, charts, AI chat, compose/scripts; CLAUDE.md points to `planning/API_CONTRACT.md`. Unchanged since first verification. |
| 2 | SC2: `uv run python -m pytest` passes in `backend/`; local run picks up root `.env` (+ DB_PATH, LLM_MOCK, SIM_SEED, SIM_EVENT_PROBABILITY) and answers `GET /api/health` 200 | VERIFIED (gap closed) | `uv run --extra dev python -m pytest -q`: 30 passed (was 9). Same run with `SIM_SEED=not-an-int SIM_EVENT_PROBABILITY=bogus LLM_MOCK=true` exported: 30 passed (hermetic, WR-03). Live `uvicorn --factory app.main:create_app` with `SIM_EVENT_PROBABILITY= SIM_SEED= DB_PATH=` (exactly what the `.env.example` template produces) -> `/api/health` 200 `{"status":"ok"}`. `config.py`: every one of the 7 variables is read through `env()` (strip, empty = default); malformed non-empty values still raise at startup. `test_committed_env_example_loads_as_defaults` and `test_blank_values_fall_back_to_defaults` cover the former trigger. |
| 3 | SC3: frontend builds a static export (`output: 'export'`) of a Tailwind dark placeholder page | VERIFIED | `npm --prefix frontend run build` succeeded, routes `/` and `/_not-found` prerendered static; `git status` clean afterwards. The container served the exported page with `data-testid` `app-title` and `api-status`. |
| 4 | SC4: `docker build` succeeds with TLS verification on; container serves page and `/api/health` on :8000 with one worker; host Playwright smoke passes against it | VERIFIED | `docker build` rc 0 (cached, from the current Dockerfile with the 01-08 changes). Container run with `-e SIM_EVENT_PROBABILITY= -e SIM_SEED=` and a fresh named volume: `/api/health` 200, page serves both test ids, `OPTIONS /api/nope` 404 `{"error":"Not found"}`, Docker health `healthy`, exactly one uvicorn process (`--workers 1`), `Config.User=app`, `id -u`=999, `touch /app/db/probe` succeeds and is owned by `app`. `BASE_URL=http://localhost:8000 npm --prefix test run smoke`: 4 passed. Local full-stack `npm --prefix test run smoke`: 4 passed. No TLS-disabling tokens in Dockerfile, README, test, backend/app or frontend/src. |
| 5 | SC5: one API/SSE contract doc in `planning/` defines every endpoint, field names, `{"error"}` format, status codes, SSE payload (`change_percent` from session-start price) and `GET /api/chat/history`; backend and frontend reference it | VERIFIED | `planning/API_CONTRACT.md` 218 lines, `change_percent` and `GET /api/chat/history` present, unknown `/api/*` with any method = 404 stated (line 83) and now implemented for all methods; no legacy `day_change_percent`/`reference_price` under `planning/`; referenced from `backend/app/main.py`, `frontend/src/lib/api.ts`, CLAUDE.md. |

### Plan-level truths checked (beyond the roadmap SCs)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 6 | Image contains no CA material and no `.env`; history has no Avast reference (01-05); a failed `uv sync --locked` fails the build and runtime is non-root (01-08) | VERIFIED | `docker history --no-trunc` matches for avast/extra_ca/BEGIN CERT = 0; `grep -ril avast /app /etc/ssl` in the container empty; `/app` holds only `.venv app db static`. Independent fail-fast proof: a scratch context with the real Dockerfile and a garbage `uv.lock`, `docker build --target backend-build` -> rc 1, "uv sync --locked ... did not complete successfully: exit code: 2" (the masking from the first report is gone). |
| 7 | An interrupted docker build re-runs cleanly (backstop, 01-05) | PRESENT_BEHAVIOR_UNVERIFIED | Not exercised by any test or by the executor; unchanged. Routed to human verification. |

**Score:** 6/7 truths verified, 1 present-but-behavior-unverified (the backstop truth). No FAILED truths.

Gap-closure plan truths (01-06/07/08) were checked independently and hold: empty-env defaults (above); real env wins over `.env` and explicit values read (existing config tests pass); suite does not read the developer `.env` (garbage-env run passes); all HTTP methods on an unknown `/api/*` path return JSON 404 (live: GET, OPTIONS, POST, PUT, DELETE, PATCH, PROPFIND all 404 `{"error":"Not found"}`, HEAD 404); `getHealth()` throws on non-2xx (`api.ts:6`) and `health-status.spec.ts` (404/500/503 -> "down") passes against the container.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.gitignore` / `.gitattributes` / `db/.gitkeep` | Ignore + LF + mount dir | VERIFIED | As above |
| `.env.example` | Six variable names, no secrets | VERIFIED | Boots with blank values now |
| `backend/app/{config,main,errors}.py`, `pyproject.toml`, `uv.lock` | uv project, factory, health, envelope | VERIFIED | 30 tests pass; live checks above |
| `backend/tests/{conftest,test_config,test_errors,test_health}.py` | Hermetic suite | VERIFIED | Passes with garbage env exported |
| `frontend/{next.config.ts,package.json,src/app/*,src/lib/api.ts}` | Static export + placeholder | VERIFIED | Built and served |
| `planning/API_CONTRACT.md` | Frozen contract | VERIFIED | Content checked |
| `Dockerfile`, `.dockerignore` | 3-stage image, 1 worker, healthcheck, non-root, fail-fast | VERIFIED | Built, ran, negative build tested |
| `test/{playwright.config,smoke.spec,health-status.spec}.ts` | Host smoke local + container | VERIFIED | 4 passed in both modes |
| `README.md`, `CLAUDE.md` | Truthful status | VERIFIED | Content checked |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Dockerfile | frontend/out | `COPY --from=frontend /fe/out /app/static` | WIRED | Container serves page at `/` |
| Dockerfile | backend app | CMD `uvicorn --factory app.main:create_app --workers 1` | WIRED | Confirmed via inspect and process list |
| Dockerfile | /api/health | HEALTHCHECK as user `app` | WIRED | Status `healthy` |
| Dockerfile | uv.lock | `set -e; uv sync --locked` | WIRED | Bad lock fails build (rc 1) |
| config.py `env()` | all 7 settings | single reader | WIRED | Blank values -> defaults |
| main.py catch-all | any method on `/api/*` | `add_route` + `JSONResponse` | WIRED | 7 methods + HEAD live |
| playwright.config.ts | backend | webServer uvicorn --factory + STATIC_DIR | WIRED | Local smoke passed |
| smoke/health-status specs | page.tsx | `app-title`, `api-status` test ids | WIRED | 4 passed |
| frontend api.ts | /api/health | same-origin fetch, `res.ok` checked | WIRED | "ok" on 200, "down" on 404/500/503 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Real Data | Status |
|----------|---------------|--------|-----------|--------|
| `page.tsx` | `api` | `getHealth()` -> backend `/api/health` | Yes (smoke asserts "ok"; mocked errors assert "down") | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend tests | `uv run --extra dev python -m pytest -q` | 30 passed | PASS |
| Hermetic under bad env | same with `SIM_SEED=not-an-int SIM_EVENT_PROBABILITY=bogus LLM_MOCK=true` | 30 passed | PASS |
| Empty config values (CR-01) | uvicorn with `SIM_EVENT_PROBABILITY= SIM_SEED= DB_PATH=`, curl `/api/health` | 200 `{"status":"ok"}` | PASS |
| Any method on unknown API path | curl -X GET/OPTIONS/POST/PUT/DELETE/PATCH/PROPFIND `/api/nope`, HEAD | all 404 `{"error":"Not found"}` | PASS |
| Frontend export | `npm --prefix frontend run build` | success, tree clean | PASS |
| Image fail-fast (WR-01) | `docker build --target backend-build` with garbage uv.lock | rc 1, uv sync step named | PASS |
| Container non-root + volume | `docker run -v fv2-db:/app/db -e SIM_EVENT_PROBABILITY= -e SIM_SEED=` | user app, health 200, healthy, file writable, one uvicorn | PASS |
| Smoke vs container | `BASE_URL=http://localhost:8000 npm --prefix test run smoke` | 4 passed | PASS |
| Smoke local | `npm --prefix test run smoke` | 4 passed | PASS |

All started servers/containers/volumes/images were removed (ports 8000 and 8766 free, no leftover containers).

### Probe Execution

SKIPPED - no probe scripts declared or present.

### Requirements Coverage

All eight phase IDs are claimed by plan frontmatter (01-01 FND-01; 01-02 FND-04, FND-06; 01-03 FND-02, FND-05, PORT-08; 01-04 FND-03; 01-05 PKG-01, FND-06; 01-06 FND-05, FND-02, PORT-08; 01-07 FND-03; 01-08 PKG-01). No orphaned Phase 1 requirement in REQUIREMENTS.md.

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| FND-01 | 01-01 | Build artifacts untracked/ignored, `.gitattributes` LF | SATISFIED | SC1 evidence |
| FND-02 | 01-03, 01-06 | uv backend, factory, pytest via `uv run python -m pytest` | SATISFIED | 30 passed, hermetic |
| FND-03 | 01-04, 01-07 | Next TS static export + Tailwind | SATISFIED | Build verified; health error path tested |
| FND-04 | 01-02 | Contract in `planning/` | SATISFIED | API_CONTRACT.md |
| FND-05 | 01-03, 01-06 | Env config incl. SIM_EVENT_PROBABILITY; local dev loads root `.env` | SATISFIED (previously BLOCKED) | Blank values fall back; template boots live and in container |
| FND-06 | 01-02, 01-05 | README/CLAUDE.md status accurate | SATISFIED | Content checked |
| PORT-08 | 01-03, 01-06 | `GET /api/health` | SATISFIED | 200 locally and in container |
| PKG-01 | 01-05, 01-08 | Multi-stage Node 24 -> Python 3.12 + uv `--locked`, port 8000, one worker | SATISFIED | Built, ran; `--locked` failure now fails the build |

Bookkeeping note (not a code defect): REQUIREMENTS.md still has FND-01, FND-04, FND-06 unchecked and shows "Gaps Found" in the traceability table (reverted in `4187de1` after the first report). The orchestrator should mark these Complete now that the phase verifies.

### Prohibitions (judgment-tier, NON-AUTHORITATIVE - unverified-prohibition, human review recommended)

| Prohibition | Verdict | Evidence |
|-------------|---------|----------|
| MUST NOT bake an interception root into the image or committed files | Holds (LLM-judge) | No Avast/cert strings in image history or filesystem; secret mounted only in builder stages and absent from the build I ran |
| MUST NOT disable/weaken TLS verification | Holds (LLM-judge) | grep for `verify=False`, `NODE_TLS_REJECT`, `insecure`, `strict-ssl` in Dockerfile/README/test/backend/frontend = no matches |
| MUST NOT claim unbuilt components in README | Holds (LLM-judge) | README "Not built yet" line lists market data, database, trading, charts, AI chat, compose/scripts |

### Review Findings Weighed (01-REVIEW.md gap-closure re-review: 0 critical, 1 warning, 6 info)

| ID | Effect on must-haves |
|----|----------------------|
| WR-01 (catch-all makes wrong-method on a real route 404, not 405) | Reproduced live: `POST /api/health` -> 404 `{"error":"Not found"}`. The frozen contract only requires 404 for unknown paths, and no Phase 1 truth depends on 405, so this is a warning, not a gap. It becomes misleading once Phase 2+ adds real routes: decide 405 vs documented 404 (and pin with a test) before then. |
| IN-01..IN-06 | Cosmetic or forward-looking (error-message formatting, a vacuous test, `.gitignore` anchoring, duplicated `CONFIG_VARS`, root-owned bind mounts vs non-root user, `/api` bare path casing). None defeats a must-have. IN-05 and the 01-08 note on `DB_PATH=` blank in a copied `.env` resolving to `/db/finally.db` inside the image must be resolved in Phase 2 (DB-01) / Phase 6 (PKG-02). |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/app/main.py` | 31 | Catch-all shadows 405 on real routes | Warning | Review WR-01; address before Phase 2 adds routes |
| `frontend/src/lib/api.ts` | 7 | `res.json()` cast to `Health` without shape check | Info | Review IN-06; backend never emits it |

No TBD/FIXME/XXX markers in phase files. No stubs: all artifacts are wired and data flows.

### Human Verification Required

1. **Interrupted docker build re-runs cleanly** (backstop truth)
   - **Test:** run `docker build --no-cache -t finally:int .`, kill it mid-step, re-run the same command.
   - **Expected:** second build exits 0 with no manual cleanup; image healthy and free of CA material.
   - **Why human:** no test exists; executor did not simulate it.
2. **Confirm the three judgment-tier prohibition verdicts above** (non-authoritative).

### Gaps Summary

None. CR-01 (the sole blocker) is fixed and verified live and in the image, the Dockerfile now fails on a bad lock and runs non-root, `getHealth` checks `res.ok`, and unknown `/api/*` paths return the contract 404 for every method. One warning (wrong method on a real route returns 404) is carried to Phase 2 planning. The STATE.md UI safety-gate override (placeholder page only; run `/gsd-ui-phase 2` before Phase 2 UI) does not affect any Phase 1 truth.

---

_Verified: 2026-10-08T09:30:00Z_
_Verifier: Claude (gsd-verifier)_
