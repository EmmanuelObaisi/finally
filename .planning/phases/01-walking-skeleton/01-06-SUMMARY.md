---
phase: 01-walking-skeleton
plan: 06
subsystem: backend
tags: [config, dotenv, fastapi, starlette, pytest, gap-closure]

requires:
  - phase: 01-walking-skeleton
    provides: Settings.from_env(), create_app() with /api/health and static mount (plans 01-03)
provides:
  - env() helper: empty or whitespace-only config values count as unset for all seven variables
  - Hermetic backend test suite (autouse isolated_env fixture, explicit settings fixture)
  - All-method JSON 404 catch-all for unknown /api paths
affects: [01-07, 01-08, backend plans that add routers above the /api catch-all]

actuals:
  tokens: 3300
  tasks: 3
  commits: 6
plan_head_before: 179e284d591532b138fbabcd15a60e0898fdd1e0
plan_head_after: 845edae27d50243078bf64571c7cea2559107a8f

tech-stack:
  added: []
  patterns:
    - "Read every config variable through env(); empty means default"
    - "Tests build the app from an explicit settings fixture, never from the environment"
    - "Catch-all 404 registered via add_route with a JSONResponse instance (matches every HTTP method)"

key-files:
  created:
    - backend/tests/conftest.py
  modified:
    - backend/app/config.py
    - backend/app/main.py
    - backend/tests/test_config.py
    - backend/tests/test_errors.py
    - backend/tests/test_health.py
    - .planning/phases/01-walking-skeleton/01-REVIEW-DISPOSITION.md

key-decisions:
  - "Empty or whitespace-only config values are unset; a malformed non-empty value still fails at startup (no defensive parsing)"
  - "Unknown /api paths use add_route with a JSONResponse ASGI app so any method, including PROPFIND, gets the contract 404"
  - "Test isolation uses monkeypatch setenv then delenv so teardown also removes keys load_dotenv wrote"

patterns-established:
  - "conftest isolated_env: tmp_path as config.ROOT_DIR plus all config vars unset and restored"

requirements-completed: [FND-05, FND-02, PORT-08]

coverage:
  - id: D1
    description: "Settings.from_env() treats empty or whitespace-only values as unset; committed .env.example loads as defaults (CR-01)"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "backend/tests/test_config.py#test_blank_values_fall_back_to_defaults"
        status: pass
      - kind: unit
        ref: "backend/tests/test_config.py#test_committed_env_example_loads_as_defaults"
        status: pass
      - kind: integration
        ref: "live uvicorn with SIM_EVENT_PROBABILITY=, SIM_SEED=, DB_PATH= answers /api/health 200 status ok"
        status: pass
    human_judgment: false
  - id: D2
    description: "Backend suite is hermetic: passes with garbage config exported and leaves os.environ unchanged (WR-03)"
    requirement: FND-02
    verification:
      - kind: integration
        ref: "SIM_SEED=not-an-int SIM_EVENT_PROBABILITY=bogus LLM_MOCK=true uv run --directory backend python -m pytest -q"
        status: pass
      - kind: integration
        ref: "in-process pytest.main comparison of os.environ before and after prints ENV_CHANGED []"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every HTTP method on an unknown /api path returns 404 {error: Not found}, with and without the static mount (WR-05)"
    requirement: PORT-08
    verification:
      - kind: unit
        ref: "backend/tests/test_errors.py#test_any_method_on_unknown_api_path_is_json_404"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-10-08
status: complete
---

# Phase 1 Plan 06: CR-01, WR-03, WR-05 Gap Closure Summary

**Empty config values now fall back to defaults via an env() helper (the committed .env.example boots), the backend test suite is hermetic, and every HTTP method on an unknown /api path returns the contract JSON 404.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-07T23:20Z
- **Completed:** 2026-10-07T23:25Z
- **Tasks:** 3
- **Files modified:** 7 (1 created)

## Accomplishments

- CR-01: `Settings.from_env()` reads all seven variables through `env()`; `SIM_EVENT_PROBABILITY=`, `SIM_SEED=` and `DB_PATH=` (and the template copied to `.env`) give the default Settings. A live uvicorn started with those empty values answers `/api/health` 200 `{"status":"ok"}`.
- WR-03: new `backend/tests/conftest.py` with an autouse `isolated_env` fixture (tmp_path as `config.ROOT_DIR`, config vars unset and restored) and an explicit `settings` fixture. The suite passes with `SIM_SEED=not-an-int SIM_EVENT_PROBABILITY=bogus LLM_MOCK=true` exported, and an in-process run leaves `os.environ` unchanged (`ENV_CHANGED []`).
- WR-05: the decorated catch-all became `app.add_route("/api/{path:path}", JSONResponse(...404))`; nine methods (GET, HEAD, POST, PUT, DELETE, PATCH, OPTIONS, TRACE, PROPFIND) x static mount present/absent all pass. 30 tests pass, no warnings summary.
- Review disposition: CR-01, WR-03, WR-05 marked `fixed (hash)`; WR-01, WR-02, WR-04, IN-01, IN-02, IN-03 remain open (`open: 6`).

## TDD Gate Compliance

- RED 1 (`77a8093`): `test_blank_values_fall_back_to_defaults` (both params) and `test_committed_env_example_loads_as_defaults` failed with `ValueError: could not convert string to float: ''` at the `SIM_EVENT_PROBABILITY` read. Semantic assessment: the target tests executed and failed on the planned behavior (the CR-01 crash), not on a setup fault. 3 failed, 3 existing passed.
- GREEN 1 (`2824808`): `env()` helper; 12 passed, live check passed.
- RED 2 (`eb60120`): `test_any_method_on_unknown_api_path_is_json_404` failed with 405 for OPTIONS, TRACE, PROPFIND (static present and absent) and HEAD (static absent). 7 failed, 14 passed. Semantic assessment: target test failed on the status assertion for the planned behavior.
- GREEN 2 (`40a5611`): add_route catch-all; 30 passed.
- REFACTOR: none needed. The `gsd_run check tdd-red-evidence` classifier was not run; RED evidence is the pytest output above.

## Task Commits

1. Task 1 (tracer): `77a8093` test (RED), `2824808` fix (GREEN)
2. Task 2: `5f97c53` test (conftest isolation, helpers removed)
3. Task 3: `eb60120` test (RED), `40a5611` fix (GREEN), `845edae` docs (disposition)

## Tracer Gate

Tracer verified end to end (unit tests plus live uvicorn with empty config values) before Tasks 2 and 3 expanded.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0. **Impact:** none.

## Issues Encountered

- A throwaway edit command at the start of GREEN 1 (an empty heredoc) did nothing; the working tree was confirmed unchanged before editing.
- Git prints LF-to-CRLF warnings on this machine; harmless.

## Known Stubs

None.

## Threat Flags

None. T-01-19, T-01-20, T-01-21 mitigated as planned.

## Next Phase Readiness

Ready for 01-07. IN-01, IN-02, IN-03 intentionally stay open.

## Self-Check: PASSED
