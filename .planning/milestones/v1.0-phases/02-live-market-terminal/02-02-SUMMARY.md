---
phase: 02-live-market-terminal
plan: 02
subsystem: database
tags: [sqlite, fastapi, watchlist, portfolio, wal, pytest]

requires:
  - phase: 02-live-market-terminal
    provides: PriceCache, market source lifespan wiring, live_server fixture (plan 02-01)
provides:
  - backend/app/db.py (six-table SQLite schema, seed-once init_db, connect, load_tracked_tickers, now_iso)
  - GET /api/watchlist (stored tickers joined with the price cache, nulls when unpriced)
  - GET /api/portfolio (cash, positions with P&L, totals from one cache snapshot)
  - Lifespan that creates and seeds the database before the source starts and tracks watchlist plus held tickers
  - API contract rule: wrong method on a known /api path is 404, never 405
affects: [02-03, 02-04, 02-05, 02-06, phase-3-trading, phase-4-chat, phase-5-snapshots]

actuals:
  tokens: 14000
  tasks: 3
  commits: 4
plan_head_before: d34ee9af8a91a4f6fb2d606888693eb6fe0d460a
plan_head_after: 7a6563934843648c65c22cfc221da90403b9b560

tech-stack:
  added: []
  patterns:
    - one short-lived autocommit sqlite3 connection per request via the connect() context manager
    - plain def route handlers (threadpool) with no try/except; the Phase 1 error envelope handles failures
    - seed only when no users_profile row exists, inside BEGIN IMMEDIATE
    - build_* functions take (conn, cache) so routes and tests share one code path

key-files:
  created:
    - backend/app/db.py
    - backend/app/watchlist.py
    - backend/app/portfolio.py
    - backend/tests/test_db.py
    - backend/tests/test_watchlist.py
    - backend/tests/test_portfolio.py
  modified:
    - backend/app/main.py
    - backend/tests/test_health.py
    - planning/API_CONTRACT.md
    - .planning/phases/01-walking-skeleton/01-REVIEW-DISPOSITION.md

key-decisions:
  - "Seed defaults only into a fresh database (no users_profile row), so a restart never re-adds a removed ticker or resets cash"
  - "A held ticker with no cached price is valued at avg_cost and logged at ERROR, never null, so total_value stays a number"
  - "Wrong-method requests on known /api paths stay 404 via the existing catch-all; the contract now states this as a decision (Phase 1 review WR-01)"

patterns-established:
  - "Tracked tickers = watchlist rows in rowid order, then held-only tickers sorted (load_tracked_tickers)"
  - "Portfolio rounding: money 2 dp, quantity 6 dp, pnl_percent 4 dp"

requirements-completed: [DB-01, DB-02, DB-03, WL-01, PORT-01]

coverage:
  - id: D1
    description: "Database file and parent directories are created and seeded in the lifespan (profile 10000.0, 10 tickers in order, one 10000.0 snapshot), idempotently, and recreated after deletion"
    requirement: DB-01
    verification:
      - kind: unit
        ref: "backend/tests/test_db.py#test_init_db_creates_directories_file_and_seed"
        status: pass
      - kind: unit
        ref: "backend/tests/test_db.py#test_init_db_is_idempotent"
        status: pass
      - kind: integration
        ref: "backend/tests/test_db.py#test_app_start_creates_and_recreates_database"
        status: pass
    human_judgment: false
  - id: D2
    description: "Natural primary keys, UUID text ids on append-only tables, user_id NOT NULL DEFAULT 'default' on all six tables, duplicate and CHECK rejection"
    requirement: DB-02
    verification:
      - kind: unit
        ref: "backend/tests/test_db.py#test_schema_keys_and_user_id_defaults"
        status: pass
      - kind: unit
        ref: "backend/tests/test_db.py#test_duplicate_ticker_per_user_rejected_other_user_accepted"
        status: pass
      - kind: unit
        ref: "backend/tests/test_db.py#test_check_constraints_reject_bad_values"
        status: pass
    human_judgment: false
  - id: D3
    description: "A restart keeps existing cash and a removed watchlist ticker (seed-once prohibition, T-02-07)"
    requirement: DB-03
    verification:
      - kind: unit
        ref: "backend/tests/test_db.py#test_init_db_keeps_user_data_on_restart"
        status: pass
    human_judgment: false
  - id: D4
    description: "GET /api/watchlist returns seeded tickers in order with eight price keys, nulls when unpriced, and survives 20 concurrent requests against real uvicorn"
    requirement: WL-01
    verification:
      - kind: integration
        ref: "backend/tests/test_watchlist.py#test_get_watchlist_returns_seeded_tickers_in_order_with_prices"
        status: pass
      - kind: unit
        ref: "backend/tests/test_watchlist.py#test_unpriced_ticker_has_null_price_fields"
        status: pass
      - kind: integration
        ref: "backend/tests/test_watchlist.py#test_concurrent_watchlist_reads_all_succeed_in_order"
        status: pass
      - kind: other
        ref: "plan verify 2: uvicorn --factory on DB_PATH=../db/livecheck-02.db, curl /api/watchlist returned priced AAPL and NFLX, file created and removed"
        status: pass
    human_judgment: false
  - id: D5
    description: "GET /api/portfolio: fresh database is cash-only; positions valued from one cache snapshot with rounding rules; unpriced held ticker valued at avg_cost with an ERROR log"
    requirement: PORT-01
    verification:
      - kind: integration
        ref: "backend/tests/test_portfolio.py#test_fresh_portfolio_is_cash_only"
        status: pass
      - kind: unit
        ref: "backend/tests/test_portfolio.py#test_position_valued_at_cached_price"
        status: pass
      - kind: unit
        ref: "backend/tests/test_portfolio.py#test_unpriced_position_valued_at_avg_cost_and_logged"
        status: pass
      - kind: unit
        ref: "backend/tests/test_portfolio.py#test_values_are_rounded_and_total_is_cash_plus_market_values"
        status: pass
    human_judgment: false
  - id: D6
    description: "Wrong method on a known /api path is 404 {error: Not found}, written into planning/API_CONTRACT.md"
    verification:
      - kind: integration
        ref: "backend/tests/test_watchlist.py#test_wrong_method_on_known_path_is_404"
        status: pass
    human_judgment: false

duration: 3 min
completed: 2026-10-08
status: complete
---

# Phase 2 Plan 02: Database, Watchlist and Portfolio Reads Summary

**SQLite database (six tables, natural keys, seed-once, WAL) created in the lifespan before the market source starts, feeding the tracked tickers to the simulator and serving `GET /api/watchlist` and `GET /api/portfolio` from one price-cache snapshot.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-10-08T13:37:21Z
- **Completed:** 2026-10-08T13:40:00Z
- **Tasks:** 3
- **Files modified:** 10 (6 created, 4 modified)

## Accomplishments

- `app/db.py` holds the schema, `init_db` (directory creation, WAL, `BEGIN IMMEDIATE` seed only when no profile row exists), a per-request `connect()` context manager and `load_tracked_tickers` (watchlist union held positions).
- The lifespan now calls `init_db` then `load_tracked_tickers` before `source.start(tickers)`; the `SEED_PRICES` import is gone.
- `GET /api/watchlist` and `GET /api/portfolio` are plain `def` handlers with no try/except; every value in SQL is a `?` parameter (T-02-05).
- The wrong-method 404 rule and `pnl_percent` 4 dp rounding are in `planning/API_CONTRACT.md`; Phase 1 review WR-01 and IN-02 are marked fixed.
- Backend suite: 62 passed, no warnings summary (46 before this plan).

## Task Commits

1. **Task 1: Fresh database to live watchlist (tracer)** - `d41b2e5` (feat)
2. **Task 2: Database guarantees** - `91dfc2e` (test)
3. **Task 3: Portfolio read, null/concurrency cases, wrong-method rule** - `b9e94ca` (feat)
4. **Disposition update (WR-01, IN-02 fixed)** - `7a65639` (docs)

**Plan metadata:** committed with this SUMMARY (docs: complete plan)

## Files Created/Modified

- `backend/app/db.py` - schema, seed, connect, tracked tickers, `now_iso`
- `backend/app/watchlist.py` - `build_watchlist` and `GET /api/watchlist`
- `backend/app/portfolio.py` - `build_portfolio` and `GET /api/portfolio`
- `backend/app/main.py` - init_db and tracked tickers in the lifespan; routers included above the catch-all
- `backend/tests/test_db.py`, `test_watchlist.py`, `test_portfolio.py` - 8 + 4 + 5 tests
- `backend/tests/test_health.py` - removed `test_health_is_side_effect_free`
- `planning/API_CONTRACT.md` - rounding bullet, wrong-method 404 rule
- `.planning/phases/01-walking-skeleton/01-REVIEW-DISPOSITION.md` - WR-01 and IN-02 fixed, open count 7 to 5

## Decisions Made

- Seeding is gated on the absence of a `users_profile` row, not on table creation, so a user who removed a ticker or spent cash never has defaults restored.
- Unpriced held ticker is valued at `avg_cost` (never null) and logged at ERROR so the problem is visible without breaking totals.
- The WR-01 fix is a documentation decision: the existing catch-all already returns 404 for wrong methods, so the contract now says so and a test pins it.

## Deviations from Plan

None - plan executed exactly as written.

Notes (not deviations):
- Task 2 is `tdd="true"` but follows the tracer that already built `db.py`, so its tests passed on first run; there was no failing RED run. No defects were found, so `db.py` was not touched in Task 2.
- Task 3 RED was a collection ImportError (`app.portfolio` missing) rather than assertion-level failures; tests and implementation went into one `feat` commit, with no separate `test` commit. The plan type is `execute`, so no TDD gate applies.
- The disposition file edit was committed separately (`7a65639`) because the WR-01 hash needed the Task 3 commit to exist first.

**Total deviations:** 0 auto-fixed.

## Issues Encountered

None.

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None. No new network surface beyond the two planned read routes; T-02-05 (parameterized SQL), T-02-06 (no exception text to clients) and T-02-07 (seed-once, tested) are mitigated as planned.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for 02-03 and 02-04 (simulator and factory edits; the constructor and start/stop contract are unchanged).
- Ready for 02-05 and 02-06: `/api/watchlist` and `/api/portfolio` shapes match the contract.
- Carried flag from the plan: a `.env` copied from `.env.example` passes an empty `DB_PATH` via `docker run --env-file`; Phase 6 (PKG-02) must resolve it.

---
*Phase: 02-live-market-terminal*
*Completed: 2026-10-08*

## Self-Check: PASSED

Created files exist (db.py, watchlist.py, portfolio.py, test_db.py, test_watchlist.py, test_portfolio.py); commits d41b2e5, 91dfc2e, b9e94ca, 7a65639 are on the branch; all task acceptance criteria re-run green; full backend suite 62 passed with no warnings summary; live uvicorn check passed and left no db/*.db behind.
