---
phase: 03-trading-watchlist-management
plan: 02
subsystem: api
tags: [fastapi, sqlite, watchlist, tracking]

requires:
  - phase: 03-trading-watchlist-management
    provides: DomainError / NotFoundError, tracking.normalize_ticker / sync_ticker, FixedPriceSource client fixture
provides:
  - POST /api/watchlist (validated, priced, idempotent add)
  - DELETE /api/watchlist/{ticker} (case-insensitive remove, 404 when absent)
  - add_to_watchlist / remove_from_watchlist shared cores for Phase 5 chat
  - Held tickers keep streaming after leaving the watchlist (02-REVIEW IN-03 fixed)
affects: [03-03 trade bar, 03-05 watchlist panel, 05 chat]

actuals:
  tokens: 4500
  tasks: 2
  commits: 3
plan_head_before: 71f09433bd85300170982216209457b3455028f3
plan_head_after: 748dea858c0c05a98fb85d5e43a7ee76a4588f88
commits: 3

tech-stack:
  added: []
  patterns:
    - "Every watchlist mutation ends in sync_ticker (finally on add), so streaming equals watchlist union positions"
    - "INSERT OR IGNORE makes concurrent adds of one ticker both 200 with one row"

key-files:
  created: []
  modified:
    - backend/app/watchlist.py
    - backend/app/market/interface.py
    - backend/tests/test_watchlist.py
    - backend/tests/test_tracking.py
    - .planning/phases/02-live-market-terminal/02-REVIEW-DISPOSITION.md

key-decisions:
  - "add_to_watchlist short-circuits on an already-watched ticker, so a re-add makes no market call"
  - "DELETE upper-cases only ASCII path text; a non-ASCII path can never match and ends as 404"
  - "Routes never call the market source directly; sync_ticker decides, which is what closes IN-03"

requirements-completed: [WL-02, WL-03, MKT-08]

coverage:
  - id: D1
    description: "POST /api/watchlist upper-cases, validates format, starts streaming, rejects unpriced tickers with 400 Unknown ticker and leaves them untracked"
    requirement: "WL-02"
    verification:
      - kind: unit
        ref: "backend/tests/test_watchlist.py#test_add_upper_cases_prices_and_appends_last"
        status: pass
      - kind: unit
        ref: "backend/tests/test_watchlist.py#test_unpriced_ticker_is_rejected_and_not_left_tracked"
        status: pass
      - kind: unit
        ref: "backend/tests/test_watchlist.py#test_malformed_ticker_is_rejected_and_changes_nothing"
        status: pass
      - kind: integration
        ref: "live uvicorn check on port 8767 (add pypl, reject PYPL$, PYPL last in GET)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Concurrent adds of one ticker all return 200 and leave one row"
    requirement: "WL-02"
    verification:
      - kind: integration
        ref: "backend/tests/test_watchlist.py#test_concurrent_adds_leave_one_row"
        status: pass
    human_judgment: false
  - id: D3
    description: "DELETE /api/watchlist/{ticker} removes in any letter case, 404 when absent, exactly one 200 under five concurrent deletes"
    requirement: "WL-03"
    verification:
      - kind: unit
        ref: "backend/tests/test_watchlist.py#test_deleting_twice_is_200_then_404_and_changes_no_money"
        status: pass
      - kind: integration
        ref: "backend/tests/test_watchlist.py#test_concurrent_deletes_give_one_200_and_four_404"
        status: pass
    human_judgment: false
  - id: D4
    description: "A held ticker removed from the watchlist keeps streaming and priced with no unpriced-position error; selling it afterwards stops streaming"
    requirement: "MKT-08"
    verification:
      - kind: unit
        ref: "backend/tests/test_tracking.py#test_removing_a_held_ticker_keeps_it_streaming_and_priced"
        status: pass
      - kind: unit
        ref: "backend/tests/test_tracking.py#test_selling_a_removed_held_ticker_stops_streaming_it"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-10-08
status: complete
---

# Phase 3 Plan 02: Watchlist Add and Remove Summary

**POST and DELETE /api/watchlist with ticker validation, price check and tracking through `sync_ticker`, so a held ticker keeps streaming after it leaves the watchlist (IN-03 closed).**

## Performance

- **Duration:** 6 min
- **Completed:** 2026-10-08T21:08Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Add: `normalize_ticker`, then an idempotent short-circuit, then `source.add_ticker`, a price check (`Unknown ticker` otherwise) and `INSERT OR IGNORE`; the `finally: sync_ticker` untracks a rejected symbol.
- Remove: DELETE row (404 `Ticker not in watchlist` when none), then `sync_ticker`, which keeps a held ticker tracked and priced and drops an unheld one with its cached price.
- Tests cover boundary tickers (A, ABCDEFGHIJ, BRK.B), unicode and whitespace rejects, unknown ticker, double delete, wrong methods (404 Not found) and five-way concurrent add and delete against a live server.
- 02-REVIEW-DISPOSITION.md: IN-03 fixed, open count 8 to 7.

## Task Commits

1. **Task 1: POST /api/watchlist (tracer)** - `f54a2af` (feat)
2. **Task 2: DELETE and held-ticker rule** - `f56023f` (test, RED: 7 failed on assertions, 30 passed) and `748dea8` (feat, GREEN)

## Files Created/Modified
- `backend/app/watchlist.py` - WatchlistRequest, on_watchlist, read_watchlist, insert_and_read, delete_and_read, add_to_watchlist, remove_from_watchlist, POST and DELETE routes
- `backend/app/market/interface.py` - `remove_ticker` docstring names `sync_ticker` as the only caller path
- `backend/tests/test_watchlist.py`, `backend/tests/test_tracking.py` - add, remove and held-ticker tests
- `.planning/phases/02-live-market-terminal/02-REVIEW-DISPOSITION.md` - IN-03 fixed

## Decisions Made
- A re-add of a watched ticker returns before any market call.
- A non-ASCII DELETE path is not upper-cased; it simply never matches a stored ticker and yields 404.
- Routes delegate all tracking to `sync_ticker`; no route touches `remove_ticker`.

## TDD Notes

The tracer (Task 1) wrote code and tests together by design. Task 2 was a true RED: the DELETE route did not exist, so the new tests failed on assertions (the catch-all answered 404), 7 failed and 30 passed, committed as `test(03-02)`, then GREEN. No REFACTOR needed.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. Pre-existing unrelated changes (`.planning/config.json`, `.planning/state.json`, `.planning/milestone.lock`) were left unstaged. Full backend suite: 178 passed, no warnings summary. The live check on port 8767 ran and its scratch database was removed.

## Known Stubs
None.

## Threat Flags
None. New surface matches the plan's threat model (T-03-08 to T-03-10 mitigated and tested).

## Next Phase Readiness
Ready for 03-03 (trade bar). Phase 5 chat can call `add_to_watchlist` / `remove_from_watchlist` with `request.app.state`.

## Self-Check: PASSED
Files verified present; commits f54a2af, f56023f, 748dea8 are ancestors of HEAD; all task acceptance criteria re-run and passing.
