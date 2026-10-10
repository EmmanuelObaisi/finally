---
phase: 04-charts-portfolio-visualizations
plan: 01
subsystem: api
tags: [fastapi, sqlite, portfolio-history, snapshots, tracer, npm-approval]

requires:
  - phase: 03-trading-watchlist-management
    provides: build_portfolio valuation, execute_trade snapshot insert, transaction(conn), error envelope and /api catch-all
provides:
  - GET /api/portfolio/history returning the newest 2000 snapshots oldest first
  - record_if_due(conn, cache, now), MIN_INTERVAL_SECONDS = 10, MAX_POINTS = 2000
  - now_iso(now=None) accepting an optional datetime
  - API_CONTRACT.md sentence naming the snapshot guard
  - Approved npm package list for plan 04-04
affects: [04-03 P&L chart data, 04-04 treemap install]

requirements-completed: [PORT-07]

actuals:
  tokens: 9500
  tasks: 3
  commits: 2
plan_head_before: 88399867a341c48c4360bb833b248c2b1e25d1ad
plan_head_after: e508f09bf01305b1608002fe63a23142e0b1e350
commits: 2

tech-stack:
  added: []
  patterns:
    - request-time write guarded by interval and changed value, read-then-insert under BEGIN IMMEDIATE
    - ORDER BY recorded_at DESC, rowid DESC for a stable order of same-second rows

key-files:
  created:
    - backend/app/history.py
    - backend/tests/test_history.py
  modified:
    - backend/app/db.py
    - backend/app/main.py
    - planning/API_CONTRACT.md

key-decisions:
  - "The history request records a snapshot only when the latest is at least 10 s old AND the total differs (exact equality on the 2 dp rounded total); an empty table records nothing"
  - "record_if_due takes `now` as a parameter so the boundary is tested without sleeping"

patterns-established:
  - "Direct record_if_due tests use init_db plus SQL setup and a PriceCache; HTTP tests backdate snapshots through connect(settings.db_path)"

coverage:
  - id: D1
    description: "GET /api/portfolio/history returns the seeded point on a fresh database and a repeat request returns the same body"
    requirement: PORT-07
    verification:
      - kind: integration
        ref: "backend/tests/test_history.py#test_fresh_database_returns_the_seeded_point"
        status: pass
      - kind: other
        ref: "live uvicorn on port 8768: one seeded point, identical repeat, exactly 2 points after one buy"
        status: pass
    human_judgment: false
  - id: D2
    description: "A request records a snapshot only after 10 s and only when the total changed (boundary 9 s vs 10 s, unchanged value, one-cent change)"
    requirement: PORT-07
    verification:
      - kind: unit
        ref: "backend/tests/test_history.py#test_interval_boundary_nine_seconds_skips_ten_records"
        status: pass
      - kind: unit
        ref: "backend/tests/test_history.py#test_one_cent_change_records_and_identical_total_does_not"
        status: pass
      - kind: integration
        ref: "backend/tests/test_history.py#test_unchanged_value_keeps_one_point_however_old_the_seed"
        status: pass
    human_judgment: false
  - id: D3
    description: "History is ascending, capped at the newest 2000, stable for same-second rows, empty when no snapshot exists"
    requirement: PORT-07
    verification:
      - kind: integration
        ref: "backend/tests/test_history.py#test_history_returns_the_newest_2000_ascending"
        status: pass
      - kind: integration
        ref: "backend/tests/test_history.py#test_same_second_snapshots_return_in_insertion_order"
        status: pass
      - kind: integration
        ref: "backend/tests/test_history.py#test_empty_table_records_nothing_and_returns_empty_history"
        status: pass
    human_judgment: false
  - id: D4
    description: "Two concurrent requests after the interval insert at most one snapshot; POST to the route is a JSON 404; a trade adds exactly one point"
    requirement: PORT-07
    verification:
      - kind: unit
        ref: "backend/tests/test_history.py#test_concurrent_requests_record_at_most_one_snapshot"
        status: pass
      - kind: integration
        ref: "backend/tests/test_history.py#test_post_to_history_is_a_json_404"
        status: pass
      - kind: integration
        ref: "backend/tests/test_history.py#test_trade_adds_exactly_one_point"
        status: pass
    human_judgment: false
  - id: D5
    description: "API_CONTRACT.md names the 10 s / changed-value guard"
    requirement: PORT-07
    verification:
      - kind: other
        ref: "grep MIN_INTERVAL_SECONDS planning/API_CONTRACT.md"
        status: pass
    human_judgment: false

duration: 3 min
completed: 2026-10-09
status: complete
---

# Phase 4 Plan 01: Portfolio Value History Summary

**GET /api/portfolio/history serving the newest 2000 snapshots oldest first, with a request-time snapshot recorded under BEGIN IMMEDIATE only after 10 s and only when the total value changed, so a never-traded portfolio keeps exactly one point.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-10-09T08:23:00Z
- **Completed:** 2026-10-09T08:27:00Z
- **Tasks:** 3 (Task 1 resolved by the orchestrator before this run)
- **Files modified:** 5

## Approved packages

Task 1 (package legitimacy, `gate="blocking-human"`) was presented to the user by the orchestrator before dispatch and approved on 2026-10-09 ("approved", no replacements named). Plan 04-04 installs from this list; use these exact versions.

npm:

| Package | Version | Kind | Installed by |
|---------|---------|------|--------------|
| d3-hierarchy | 3.1.2 | dependency | 04-04 |
| @types/d3-hierarchy | 3.1.7 | devDependency | 04-04 |

Registry evidence gathered by the orchestrator:

- d3-hierarchy 3.1.2: latest tag 3.1.2, license ISC, repository github.com/d3/d3-hierarchy, maintainers mbostock and recifs (Fil), no dependencies, only test/prepublishOnly/postpublish scripts (no install-time scripts).
- @types/d3-hierarchy 3.1.7: latest tag 3.1.7, license MIT, repository github.com/DefinitelyTyped/DefinitelyTyped, maintainer "types" (Microsoft), dependencies `{}`, no scripts.

Not to be confused with the unrelated npm package `d3-treemap`. No replacements were named. Nothing was installed in this plan; TLS verification stayed on.

## Accomplishments

- `backend/app/history.py`: `GET /api/portfolio/history` (sync handler) calls `record_if_due` then returns the newest `MAX_POINTS` rows reversed to ascending. The snapshot value is `build_portfolio(conn, cache)["total_value"]`, the same rounded number `GET /api/portfolio` returns; the route reads no body, so a client cannot set it.
- `record_if_due(conn, cache, now)` reads the latest snapshot and inserts inside one `transaction(conn)`; a concurrency test with two threads proves at most one insert.
- `now_iso(now=None)` in `db.py`; every existing caller unchanged.
- Router included above the `/api/{path:path}` catch-all, so a POST to the route answers `404 {"error": "Not found"}`.
- 11 tests in `backend/tests/test_history.py`; full backend suite 196 passed with no warnings summary. A mutation check (`age <= MIN_INTERVAL_SECONDS` and no equality check) made 4 tests fail, then the source was restored.
- Live check against a real uvicorn on port 8768: one seeded point, identical repeat, exactly two points after one buy.

## Task Commits

1. **Task 1: Verify Phase 4 npm packages** - resolved by the orchestrator (no commit)
2. **Task 2: History end to end (tracer)** - `45f86d6` (feat)
3. **Task 3: Guard edges and contract sentence** - `e508f09` (test)

**Plan metadata:** committed with this SUMMARY (docs: complete plan)

## Files Created/Modified

- `backend/app/history.py` - router, `MIN_INTERVAL_SECONDS`, `MAX_POINTS`, `record_if_due`, `get_history`
- `backend/app/db.py` - `now_iso(now=None)`
- `backend/app/main.py` - `history` import and `include_router(history.router)`
- `backend/tests/test_history.py` - 11 PORT-07 tests
- `planning/API_CONTRACT.md` - the history guard sentence replacing "may first record a snapshot"

## Decisions Made

- `record_if_due` takes `now` as an argument so the 9 s / 10 s boundary and the concurrency case are tested without sleeping.
- The unchanged-value check is exact equality on the already rounded total; a $0.01 difference records, an identical total does not.
- With no snapshot at all (unreachable through the app) the request records nothing and returns `{"history": []}`.

## Deviations from Plan

None - plan executed exactly as written.

### TDD note (Task 3)

Task 3 is `tdd="true"` but follows the tracer, which already built the production code, so the tests were written against existing behavior and all passed on first run; there was no failing RED run and no separate RED commit. To show the tests are not vacuous, a mutation of the guard was applied and 4 tests failed before the source was restored. Plan type is `execute`, so no TDD gate applies. One test helper change (batched inserts in one transaction for the 2005-row cap test) cut that test from 11 s to well under a second before the commit.

**Total deviations:** 0 auto-fixed.

## Issues Encountered

None.

## Authentication Gates

None. The Task 1 human-verify gate was resolved before execution.

## Known Stubs

None.

## Threat Flags

None. T-04-01 to T-04-04 are mitigated and tested: write amplification guard, single transaction, no client-supplied value (POST is 404), parameterized SQL. The route returns only `total_value` and `recorded_at`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 04-03 can plot `GET /api/portfolio/history`; an untraded portfolio yields exactly one point, which the P&L empty state relies on.
- Plan 04-04 installs d3-hierarchy 3.1.2 and @types/d3-hierarchy 3.1.7 from the Approved packages list.

---
*Phase: 04-charts-portfolio-visualizations*
*Completed: 2026-10-09*

## Self-Check: PASSED

All created files exist (history.py, test_history.py); commits 45f86d6 and e508f09 are ancestors of HEAD; full backend suite (196 passed, no warnings summary) and the live port 8768 check re-run green.
