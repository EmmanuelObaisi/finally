---
phase: 01-walking-skeleton
plan: 03
subsystem: api
tags: [fastapi, uv, uvicorn, pydantic, pytest, python-dotenv, starlette]

requires:
  - phase: 01-walking-skeleton
    provides: "01-01 repo hygiene (.gitignore fixes); 01-02 frozen REST/SSE contract (planning/API_CONTRACT.md)"
provides:
  - "backend/ uv virtual project (no build-system) with a dev extra (pytest, httpx) and pytest config"
  - "create_app(settings=None) factory with lifespan, GET /api/health, /api catch-all and static mount last"
  - "Settings.from_env(): env plus project-root .env, real env wins"
  - "register_error_handlers(app): the {\"error\": ...} envelope for 404, 400 and 500"
affects: [01-04, 01-05, phase-02-market-data-wiring, phase-03-portfolio, all later API routes]

actuals:
  tokens: 2200
  tasks: 3
  commits: 3

tech-stack:
  added: [fastapi 0.142.2, starlette 1.7.0, pydantic 2.13.5, uvicorn[standard] 0.54.0, python-dotenv 1.2.4, pytest 9.1.1 (dev), httpx 0.28.1 (dev)]
  patterns:
    - "App factory run with uvicorn --factory; no module-level app or singletons"
    - "Settings reached via app.state.settings (set in lifespan), never via module globals"
    - "New routers are included above the /api/{path} catch-all; the static mount is always last"
    - "Tests build a Settings with dataclasses.replace(Settings.from_env(), db_path=..., static_dir=...)"

key-files:
  created:
    - backend/pyproject.toml
    - backend/uv.lock
    - backend/.python-version
    - backend/app/__init__.py
    - backend/app/config.py
    - backend/app/main.py
    - backend/app/errors.py
    - backend/tests/test_health.py
    - backend/tests/test_errors.py
    - backend/tests/test_config.py
  modified: []

key-decisions:
  - "Plain httpx as the TestClient transport with the Starlette deprecation warning filtered by regex (D-02); httpx2 is not installed and not importable"
  - "Dependency versions pinned with == to the human-approved set, not the >= floors shown in RESEARCH"
  - "Validation failures return 400 with 'loc: msg' from the first error (body segment dropped), never 422"
  - "Unhandled exceptions return a fixed 'Internal server error' text so exception messages never reach the client"

patterns-established:
  - "Error envelope: every failure is {\"error\": \"...\"} with the contract status code"
  - "Config tests delenv every variable under test because the dev shell pre-exports LLM_MOCK and OPENROUTER_API_KEY"

requirements-completed: [FND-02, FND-05, PORT-08]

coverage:
  - id: D1
    description: "Backend is a uv virtual project and uv run python -m pytest passes with no warning section on plain httpx"
    requirement: FND-02
    verification:
      - kind: unit
        ref: "uv run --directory backend python -m pytest -q (9 passed, no warnings summary)"
        status: pass
    human_judgment: false
  - id: D2
    description: "GET /api/health returns 200 {\"status\": \"ok\"} from a real uvicorn --factory process and is side-effect free"
    requirement: PORT-08
    verification:
      - kind: unit
        ref: "backend/tests/test_health.py#test_health_ok"
        status: pass
      - kind: unit
        ref: "backend/tests/test_health.py#test_health_is_side_effect_free"
        status: pass
      - kind: integration
        ref: "uvicorn --factory app.main:create_app --port 8765, then GET /api/health"
        status: pass
    human_judgment: false
  - id: D3
    description: "Settings.from_env() reads the seven variables, loads the project-root .env, real env wins, DB_PATH defaults to project-root db/finally.db"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "backend/tests/test_config.py#test_defaults"
        status: pass
      - kind: unit
        ref: "backend/tests/test_config.py#test_root_dotenv_is_loaded_and_real_env_wins"
        status: pass
      - kind: unit
        ref: "backend/tests/test_config.py#test_explicit_env_vars_are_read"
        status: pass
    human_judgment: false
  - id: D4
    description: "Unknown /api paths return JSON 404 even with a static export mounted; validation failures return 400; unhandled exceptions return a generic 500"
    verification:
      - kind: unit
        ref: "backend/tests/test_errors.py (3 tests)"
        status: pass
      - kind: integration
        ref: "live uvicorn GET /api/nope returns {\"error\":\"Not found\"} 404"
        status: pass
    human_judgment: false
  - id: D5
    description: "App starts with no frontend build present; static export is served at / when STATIC_DIR exists"
    verification:
      - kind: unit
        ref: "backend/tests/test_health.py#test_static_export_served_when_present"
        status: pass
    human_judgment: false

duration: ~25min (continuation run covering Tasks 2-3; Task 1 was the human gate)
completed: 2026-10-07
status: complete
plan_head_before: 9649a1b804836085d370b352dbfdb626358ed363
plan_head_after: 4544da9270e2e07bb92aeb63c1f820ccdab3f9bb
commits: 3
---

# Phase 1 Plan 03: Backend Skeleton Summary

**FastAPI app factory on a uv virtual project: /api/health, env plus root-.env Settings, and a uniform {"error": ...} envelope, proven by 9 passing tests on plain httpx and a live uvicorn --factory check.**

## Performance

- **Duration:** ~25 min for this continuation (Tasks 2 and 3); Task 1 was a human package-legitimacy gate resolved with "approved" before this run
- **Completed:** 2026-10-07
- **Tasks:** 3 of 3 (Task 1 gate only, no commit; Task 2 tracer; Task 3 TDD)
- **Files created:** 10 (7 under `backend/app` and `backend/tests`, plus `pyproject.toml`, `uv.lock`, `.python-version`)

## Accomplishments

- `backend/` is a uv virtual project (no `[build-system]`); `uv sync --extra dev` is an exact sync, so the stale `.venv` was pruned of leftover scratch packages (litellm, massive, numpy, and others). `httpx2` is absent and not importable.
- `create_app()` factory with a lifespan that stores `app.state.settings`, `GET /api/health`, the `/api/{path:path}` catch-all, and the static export mounted last and only if `STATIC_DIR` exists. The tracer was verified twice end to end: pytest plus a real `uvicorn --factory app.main:create_app` process answering `{"status":"ok"}`.
- `Settings.from_env()` reads `OPENROUTER_API_KEY`, `MASSIVE_API_KEY`, `LLM_MOCK`, `DB_PATH`, `SIM_SEED`, `SIM_EVENT_PROBABILITY`, `STATIC_DIR`; loads the project-root `.env` with `override=False`; `DB_PATH` defaults to `<root>/db/finally.db`.
- Error envelope: 404 for unknown `/api` paths (also with a static export mounted), 400 for body validation failures, generic 500 without the exception text (threat T-01-07).

## Task Commits

1. **Task 1: Verify PyPI packages (checkpoint)** - no commit; user replied "approved" with exact versions
2. **Task 2: End-to-end health check (tracer)** - `3098c56` (feat)
3. **Task 3: JSON error envelope and env-config tests (TDD)**
   - RED `4b35c21` (test)
   - GREEN `4544da9` (feat)
   - REFACTOR: none needed

**Plan metadata:** recorded in the docs(01-03) commit that carries this file.

## TDD Gate Compliance

- **RED (`4b35c21`):** three target tests in `tests/test_errors.py` failed before any implementation.
  - `test_unknown_api_path_is_json_404_even_with_static_dir`: static `404.html` was served instead of JSON, so `r.json()` raised `JSONDecodeError` at the planned assertion.
  - `test_validation_failure_is_400_with_error_envelope`: `assert 422 == 400`.
  - `test_unhandled_exception_is_generic_500`: `content-type` was `text/plain`, not JSON.
  - Evidence was captured as pytest JUnit XML and each record returned `RED_EVIDENCE_OK` (`target_test_failed`) from `gsd check tdd-red-evidence`. Semantic assessment: each target executed and failed on the planned assertion for the intended reason (missing envelope behavior), not on import, fixture or syntax faults.
- **Note on `test_config.py`:** its three tests passed at RED because `config.py` already existed from the Task 2 tracer (copied verbatim from RESEARCH). They are regression tests for already-built behavior, not RED drivers.
- **GREEN (`4544da9`):** `errors.py` plus the `main.py` wiring; 9 passed, no warnings summary.
- **Ordering note:** an earlier `feat(01-03)` commit (`3098c56`) exists from Task 2, so a naive "first feat after test" log query lists the tracer commit; the RED-then-GREEN sequence for Task 3 is `4b35c21` then `4544da9`.

## Files Created/Modified

- `backend/pyproject.toml` - virtual project, `dev` extra (pytest, httpx), pytest config with the Starlette httpx warning filter
- `backend/uv.lock`, `backend/.python-version` - reproducible lock; Python 3.12
- `backend/app/config.py` - `Settings` dataclass, `from_env()`, `BACKEND_DIR`, `ROOT_DIR`
- `backend/app/main.py` - `create_app()`, lifespan, `/api/health`, `/api` catch-all, static mount
- `backend/app/errors.py` - `register_error_handlers(app)` (`http_error`, `validation_error`, `unhandled_error`)
- `backend/tests/test_health.py`, `test_errors.py`, `test_config.py` - 9 tests

## Decisions Made

- Plain `httpx` plus a regex warning filter (D-02), confirmed against the real warning text by running once with `-o filterwarnings=`.
- Versions pinned with `==` to exactly the approved set (the user said "install exactly"), tighter than the `>=` floors in RESEARCH.
- Test-only routes (`/probe`, `/boom`) live on non-`/api` paths and are added after `create_app()` so the catch-all cannot shadow them.

## Deviations from Plan

None - plan executed exactly as written. Two small notes, neither a rule-based deviation:

- `uv add` wrote `==` pins instead of the `>=` that a bare `uv add` would produce, per the user's "install exactly" instruction on the Task 1 gate.
- Task 3 was run as a TDD task inside an `execute` plan (not `type: tdd`), so the TDD Gate Compliance section above is informational.

## Issues Encountered

- No TLS error occurred; `UV_SYSTEM_CERTS=1` was not needed and no verification was relaxed.
- Git prints LF to CRLF warnings on commit (Windows autocrlf); harmless and unrelated to this plan.
- The first draft of my RED-evidence scratch script wrote junit XML via an absolute scratchpad path (pytest did not create it) and the classifier rejects records outside the project. Fixed in the scratch script only, by using a relative junit path and a record under the gitignored `backend/.pytest_cache/red/`. Nothing from this is committed.

## Known Stubs

None. No placeholder data, empty-value UI wiring or TODO/FIXME markers in the files created.

## Threat Flags

None. No network surface beyond what the plan's threat model covers (`/api/health`, the catch-all and the static mount). T-01-07 and T-01-08 are mitigated and test-asserted; T-01-10 and T-01-SC were honored (no insecure TLS option used, package gate approved before install, `uv.lock` committed).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for 01-04 and 01-05: Docker can use `uvicorn --factory app.main:create_app`, must set `DB_PATH=/app/db/finally.db` (ROOT_DIR is `/` inside the image, RESEARCH Pitfall 2), and the default `static_dir` is `BACKEND_DIR / "static"`. Playwright's webServer can pass `STATIC_DIR`.
- Later routers must be included above the `/api/{path:path}` catch-all in `create_app()`.
- Local mock-LLM runs need the explicit env (`LLM_MOCK=true uv run ...`) because a real env var beats `.env` and this shell pre-exports `LLM_MOCK`.

## Self-Check: PASSED

- Created files verified on disk: all 10 listed files present.
- Commits verified as ancestors of HEAD: `3098c56`, `4b35c21`, `4544da9`.
- `uv run --directory backend python -m pytest -q`: 9 passed, no warnings summary; live uvicorn returned `{"status":"ok"}` and `{"error":"Not found"}` 404 on `/api/nope`.

---
*Phase: 01-walking-skeleton*
*Completed: 2026-10-07*
