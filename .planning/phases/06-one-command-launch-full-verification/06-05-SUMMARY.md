---
phase: 06-one-command-launch-full-verification
plan: 05
subsystem: testing
tags: [pytest, vitest, audit, api-contract]

requires:
  - phase: 01-foundation
    provides: API contract and error envelope tests
  - phase: 05-ai-chat-assistant
    provides: chat route and chat history tests
provides:
  - 06-TEST-AUDIT.md with the TEST-04 and TEST-05 requirement-to-test matrices
  - HTTP key-set assertions for GET /api/chat/history items and GET /api/portfolio/history points
affects: [06-03 appends TEST-06 and PUI-08 sections to the audit file, phase 6 verification]

actuals:
  tokens: 4000
  tasks: 2
  commits: 2
plan_head_before: 560819dab87cc54822d8cc58cc49f025023ed076
commits: 2
plan_head_after: 3f59b621dc7d92fe5f5171317ee1ae57cbfaeb35

tech-stack:
  added: []
  patterns:
    - "Audit matrices cite tests as file.py::test_name (backend) and exact it() titles (frontend), each resolvable by grep"

key-files:
  created:
    - .planning/phases/06-one-command-launch-full-verification/06-TEST-AUDIT.md
  modified:
    - backend/tests/test_chat.py
    - backend/tests/test_history.py

key-decisions:
  - "Only the two planned gaps needed new tests; every other TEST-04 row and every TEST-05 bullet was already covered, so no frontend test was added"

patterns-established:
  - "Audit by grep, not line coverage: a row is covered only when a named test that exists asserts it"

requirements-completed: [TEST-04, TEST-05]

coverage:
  - id: D1
    description: "TEST-04 matrix maps every contract endpoint and the 404/400/500 rules to named pytest tests"
    requirement: TEST-04
    verification:
      - kind: unit
        ref: "uv run --directory backend python -m pytest -q (329 passed, no warnings summary)"
        status: pass
    human_judgment: false
  - id: D2
    description: "GET /api/chat/history and GET /api/portfolio/history response shapes asserted over HTTP"
    requirement: TEST-04
    verification:
      - kind: unit
        ref: "backend/tests/test_chat.py::test_history_items_have_the_contract_keys"
        status: pass
      - kind: unit
        ref: "backend/tests/test_history.py::test_history_points_have_the_contract_keys"
        status: pass
    human_judgment: false
  - id: D3
    description: "TEST-05 matrix maps each PLAN.md section 12 frontend bullet and the boundary/precision rules to named Vitest tests"
    requirement: TEST-05
    verification:
      - kind: unit
        ref: "npm --prefix frontend test (26 files, 345 tests passed)"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-10-10
status: complete
---

# Phase 6 Plan 05: TEST-04 and TEST-05 Audit Summary

**Requirement-to-test audit matrix for the backend API routes and frontend units, with two HTTP response-shape tests added for the chat history and portfolio history routes**

## Performance

- **Duration:** 8 min
- **Completed:** 2026-10-10
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `06-TEST-AUDIT.md` TEST-04 section: 13 rows (10 contract endpoints plus 404, 400 and 500 rules), every `file.py::test_name` resolved by grep against `backend/tests`; all rows covered or added, none open.
- Closed the two proven gaps: `test_history_items_have_the_contract_keys` (chat history items have exactly `id, role, content, actions, created_at`, two distinct non-empty ids, body keys exactly `messages`) and `test_history_points_have_the_contract_keys` (history body keys exactly `history`, points exactly `total_value, recorded_at`).
- `06-TEST-AUDIT.md` TEST-05 section: the five PLAN.md section 12 frontend bullets mapped to exact Vitest titles (all verified present in `frontend/src`), plus a boundary and precision table citing the formatter threshold and rounding tests.
- Full suites green: backend 329 passed with no warnings summary and nothing new under `db/`; frontend 26 files, 345 tests passed.

## Task Commits

1. **Task 1: TEST-04 audit and the two shape tests (tracer)** - `330cc36` (test)
2. **Task 2: TEST-05 audit matrix** - `3f59b62` (docs)

**Plan metadata:** committed separately (docs: complete plan)

## Files Created/Modified
- `.planning/phases/06-one-command-launch-full-verification/06-TEST-AUDIT.md` - TEST-04 and TEST-05 matrices
- `backend/tests/test_chat.py` - `test_history_items_have_the_contract_keys`
- `backend/tests/test_history.py` - `test_history_points_have_the_contract_keys`

## Decisions Made
None - followed plan as specified. Planning's finding held: no frontend bullet lacked a test, so no Vitest test was added and no file under `frontend/src` changed.

## Deviations from Plan

None - plan executed exactly as written.

One audit note, not a deviation: the plan text mentions removal of the flash class "with fake timers", but `PriceCell` has no timers (the CSS animation restarts by remounting the span on a new `flash.seq`). The matrix cites the remount test, which is what the component actually does.

## Issues Encountered
None.

## Known Stubs
None.

## Threat Flags
None. T-06-13 mitigated as planned: the new chat test uses the `mock_client` fixture (LLM_MOCK on, no network) and the history test needs no LLM.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 06-03 can append `## TEST-06` and `## PUI-08` sections to `06-TEST-AUDIT.md`.
- TEST-04 and TEST-05 complete.

## Self-Check: PASSED

- FOUND: `06-TEST-AUDIT.md`, `backend/tests/test_chat.py`, `backend/tests/test_history.py`
- FOUND commits: `330cc36`, `3f59b62`

---
*Phase: 06-one-command-launch-full-verification*
*Completed: 2026-10-10*
