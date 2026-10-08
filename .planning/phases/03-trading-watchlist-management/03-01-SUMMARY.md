---
phase: 03-trading-watchlist-management
plan: 01
subsystem: api
tags: [fastapi, sqlite, trading, market-orders, tracking]

requires:
  - phase: 02-market-data-and-streaming
    provides: PriceCache, MarketDataSource add/remove_ticker, build_portfolio, db schema and connect()
provides:
  - POST /api/portfolio/trade (atomic market-order fills, 400 envelope on rejection)
  - DomainError / NotFoundError and db.transaction (BEGIN IMMEDIATE)
  - tracking.normalize_ticker / is_wanted / sync_ticker (stream exactly watchlist union positions)
  - FixedPriceSource test double, client fixture, TEST-02 suite
affects: [03-02 watchlist routes, 03-03 trade bar, 03-04 positions table, 05 chat]

actuals:
  tokens: 6500
  tasks: 3
  commits: 4
plan_head_before: 2972360b13f0428d76eacc0ce84886e8ad13a85a
plan_head_after: b7c6f0f1b13ddb81387a89d058b97b3c39e99a25
commits: 4

tech-stack:
  added: []
  patterns:
    - "One BEGIN IMMEDIATE transaction per fill; cash, position, trade row and snapshot commit or roll back together"
    - "SQLite work runs in asyncio.to_thread so the SSE loop is never blocked"
    - "Tracking is decided in one place (sync_ticker) after every mutation"

key-files:
  created:
    - backend/app/trading.py
    - backend/app/tracking.py
    - backend/tests/test_trading.py
    - backend/tests/test_tracking.py
  modified:
    - backend/app/errors.py
    - backend/app/db.py
    - backend/app/main.py
    - backend/tests/conftest.py
    - planning/API_CONTRACT.md

key-decisions:
  - "Quantities rounded to 6 dp and money to 2 dp inside execute_trade, so the Phase 5 chat path that bypasses TradeRequest gets the same rules"
  - "Ownership is checked before the price, so selling a never-held symbol reports insufficient shares"
  - "place_trade ends in finally: sync_ticker, so a rejected buy of an unwatched ticker stops streaming"

requirements-completed: [PORT-02, PORT-03, PORT-04, PORT-05, PORT-06, MKT-08, TEST-02]

coverage:
  - id: D1
    description: "POST /api/portfolio/trade fills buys and sells at the cached price with weighted avg cost, fractional quantities and residue-free full sells"
    requirement: "PORT-02"
    verification:
      - kind: unit
        ref: "backend/tests/test_trading.py#test_buys_merge_into_weighted_average"
        status: pass
      - kind: integration
        ref: "live uvicorn check on port 8766 (buy 2, sell 0.5, oversell 400, GET portfolio)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every invalid trade is a 400 error envelope that changes nothing; a fill is atomic and rolls back on failure"
    requirement: "PORT-04"
    verification:
      - kind: unit
        ref: "backend/tests/test_trading.py#test_rejections_change_nothing"
        status: pass
      - kind: unit
        ref: "backend/tests/test_trading.py#test_failure_inside_the_fill_rolls_everything_back"
        status: pass
      - kind: unit
        ref: "backend/tests/test_trading.py#test_concurrent_buys_only_one_can_afford"
        status: pass
    human_judgment: false
  - id: D3
    description: "Trade response carries the updated portfolio, equal to GET /api/portfolio"
    requirement: "PORT-06"
    verification:
      - kind: unit
        ref: "backend/tests/test_trading.py#test_route_buy_returns_trade_and_portfolio"
        status: pass
    human_judgment: false
  - id: D4
    description: "Buying an unwatched ticker streams it before pricing; failed buys and full sells of unwatched tickers stop streaming"
    requirement: "MKT-08"
    verification:
      - kind: unit
        ref: "backend/tests/test_tracking.py#test_buying_an_unwatched_ticker_streams_it_priced"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-10-08
status: complete
---

# Phase 3 Plan 01: Trade Execution Summary

**Atomic market-order fills at POST /api/portfolio/trade (BEGIN IMMEDIATE, strict body model, 400 envelopes) with tracking that keeps streamed tickers equal to watchlist union positions.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-10-08T21:00:17Z
- **Completed:** 2026-10-08T21:04:00Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- Buys and sells fill at the cached price: cash moves by `round(price x quantity, 2)`, avg cost is the 6 dp weighted average, a sell to zero deletes the position, and every fill appends a trade row and one portfolio snapshot.
- Rejections (quantity, ticker format, no price, insufficient cash or shares, bad side, NaN, string and boolean quantities) are 400 `{"error"}` and change nothing; an exception inside the fill rolls back all writes; two concurrent unaffordable buys yield exactly one winner.
- `tracking.sync_ticker` is the single place that stops tracking a ticker; trades start tracking before the price read and end with the ticker tracked exactly when watched or held. Contract now lists the rejection messages verbatim.

## Task Commits

1. **Task 1: Buy and sell end to end (tracer)** - `01f7af4` (feat)
2. **Task 2: TEST-02 suite and fixed-price double** - `4f934e7` (test)
3. **Task 3: Tracking rule and contract** - `844661f` (test, RED) and `b7c6f0f` (feat, GREEN)

**Plan metadata:** committed with this SUMMARY (docs).

## Files Created/Modified
- `backend/app/trading.py` - TradeRequest, execute_trade, run_trade, place_trade, route
- `backend/app/tracking.py` - ticker format check, is_wanted, sync_ticker
- `backend/app/errors.py` - DomainError (400), NotFoundError (404) and handler
- `backend/app/db.py` - transaction() context manager
- `backend/app/main.py` - trading router included above the /api catch-all
- `backend/tests/conftest.py` - FixedPriceSource, FIXED_PRICES, client fixture
- `backend/tests/test_trading.py` - 20 tests (TEST-02)
- `backend/tests/test_tracking.py` - 8 tests (MKT-08 trade path)
- `planning/API_CONTRACT.md` - trade check order, messages, fill and tracking rules

## Decisions Made
- Rounding and `not quantity > 0` live in `execute_trade`, not only the request model, so chat reuses the same guarantees.
- Sell ownership is validated before price lookup (a never-held symbol says "you hold 0 X").
- `sync_ticker` in a `finally` handles failed buys, full sells and partial sells with one rule.

## TDD Notes

Task 2 tests exercised behaviour Task 1 had already built (tracer first, by plan design), so they were green on first full run, apart from one wrong expected avg_cost in my own test that was corrected. They are committed as `test(03-01)`. Task 3 was a true RED: the three route tests asserting tracking and `is_wanted` failed on their assertions (4 failed, 4 passed; the 4 passes are negative cases that hold before and after). The first RED attempt had a module-level import error (INVALID_RED); I moved the `is_wanted` import into its test to get a valid RED, then restored it at GREEN. No REFACTOR commit was needed. The classifier `check tdd-red-evidence` was not run because pytest console output is not one of its supported report formats and the plan is `type: execute`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. Pre-existing unrelated changes (`.planning/config.json`, `.planning/state.json`, `.planning/milestone.lock`) were left unstaged.

## Known Stubs
None.

## Threat Flags
None. The new endpoint and its mitigations (T-03-01 to T-03-05, T-03-07) are those in the plan's threat model.

## Next Phase Readiness
Ready for 03-02 (watchlist add/remove can reuse `DomainError`, `NotFoundError`, `normalize_ticker` and `sync_ticker`) and 03-03 (trade bar can show the frozen rejection messages).

## Self-Check: PASSED
Files verified present; commits 01f7af4, 4f934e7, 844661f, b7c6f0f are ancestors of HEAD; full backend suite 153 passed with no warnings summary.
