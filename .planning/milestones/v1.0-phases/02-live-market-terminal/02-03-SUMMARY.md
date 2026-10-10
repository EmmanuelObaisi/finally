---
phase: 02-live-market-terminal
plan: 03
subsystem: market-data
tags: [simulator, gbm, numpy, sha256, pytest]

requires:
  - phase: 02-live-market-terminal
    provides: GBMSimulator, SimulatorDataSource, PriceCache, factory (plan 02-01)
provides:
  - derived_price(ticker): sha256-derived start price in [50, 300], identical in every process
  - GBMSimulator.add_ticker consumes no randomness, so start prices do not depend on add order
  - backend/tests/market/test_simulator.py: 18 tests pinning GBM math, correlation, events, seeding and conformance
affects: [phase-3-watchlist-add, e2e-determinism, 02-04]

actuals:
  tokens: 5500
  tasks: 2
  commits: 2
plan_head_before: 7b5e62ab28bdb504acd1f7e097ab2868aac5fa19
plan_head_after: 36744606d2b417bf93cf58e26b172f360b94bd5a

tech-stack:
  added: []
  patterns:
    - seeded statistical tests (dt of one trading day, events off) for volatility and correlation
    - subprocess with a different PYTHONHASHSEED to prove process independence

key-files:
  created:
    - backend/tests/market/test_simulator.py
  modified:
    - backend/app/market/simulator.py

key-decisions:
  - "Unknown tickers start at a sha256-derived price (first 8 bytes big-endian over 2**64), never the salted built-in hash() and never the RNG"

patterns-established:
  - "Start price is a pure function of the ticker; the RNG is only consumed by step()"

requirements-completed: [MKT-01, MKT-02, MKT-03, MKT-04, MKT-06, TEST-01]

coverage:
  - id: D1
    description: "Unknown tickers start at a stable derived price (PYPL 211.74, ZZZZ 196.93), the same in a fresh process under a different PYTHONHASHSEED, in [50, 300] with 2 dp, and written to the cache once"
    requirement: MKT-03
    verification:
      - kind: unit
        ref: "backend/tests/market/test_simulator.py#test_derived_price_known_values"
        status: pass
      - kind: unit
        ref: "backend/tests/market/test_simulator.py#test_derived_price_is_process_independent"
        status: pass
      - kind: unit
        ref: "backend/tests/market/test_simulator.py#test_derived_price_range_and_precision"
        status: pass
      - kind: unit
        ref: "backend/tests/market/test_simulator.py#test_source_add_unknown_ticker_caches_derived_price"
        status: pass
    human_judgment: false
  - id: D2
    description: "Seed prices, 0.5 s tick, positivity over 10,000 steps, annualized volatility within 5%, log-return correlation 0.6/0.3/0.3 within 0.05, drift"
    requirement: MKT-01
    verification:
      - kind: unit
        ref: "backend/tests/market/test_simulator.py#test_annualized_volatility_matches_parameters"
        status: pass
      - kind: unit
        ref: "backend/tests/market/test_simulator.py#test_log_return_correlation"
        status: pass
      - kind: unit
        ref: "backend/tests/market/test_simulator.py#test_prices_stay_positive"
        status: pass
      - kind: unit
        ref: "backend/tests/market/test_simulator.py#test_drift_moves_price_by_exp_mu_dt"
        status: pass
    human_judgment: false
  - id: D3
    description: "Events move a ticker 1.9-5.1% at probability 1 and never 1% at probability 0"
    requirement: MKT-02
    verification:
      - kind: unit
        ref: "backend/tests/market/test_simulator.py#test_event_moves_are_two_to_five_percent"
        status: pass
      - kind: unit
        ref: "backend/tests/market/test_simulator.py#test_no_events_means_no_large_moves"
        status: pass
    human_judgment: false
  - id: D4
    description: "Same seed reproduces, different seeds differ, add order is irrelevant, and Settings.sim_seed / sim_event_probability reach the simulator through the factory"
    requirement: MKT-04
    verification:
      - kind: unit
        ref: "backend/tests/market/test_simulator.py#test_same_seed_is_reproducible_and_different_seed_differs"
        status: pass
      - kind: unit
        ref: "backend/tests/market/test_simulator.py#test_start_prices_do_not_depend_on_add_order"
        status: pass
      - kind: unit
        ref: "backend/tests/market/test_simulator.py#test_settings_reach_the_simulator"
        status: pass
    human_judgment: false
  - id: D5
    description: "SimulatorDataSource conforms to MarketDataSource, runs and removes tickers, and ticker-management edge cases hold"
    requirement: MKT-06
    verification:
      - kind: unit
        ref: "backend/tests/market/test_simulator.py#test_simulator_source_conforms_to_the_interface"
        status: pass
      - kind: unit
        ref: "backend/tests/market/test_simulator.py#test_running_source_moves_prices_and_removes_tickers"
        status: pass
      - kind: unit
        ref: "backend/tests/market/test_simulator.py#test_ticker_management_edge_cases"
        status: pass
    human_judgment: false

duration: 2 min
completed: 2026-10-08
status: complete
---

# Phase 2 Plan 03: Simulator Realism and Reproducibility Summary

**Unknown tickers now start at a sha256-derived price (PYPL 211.74, ZZZZ 196.93) that is identical in every process, and 18 seeded unit tests prove the simulator's volatility, sector correlation, 2-5% events and `SIM_SEED` reproducibility.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-10-08T13:42:12Z
- **Completed:** 2026-10-08T13:44:00Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- `derived_price()` in `simulator.py` replaces `rng.uniform(50, 300)`; `add_ticker` no longer consumes randomness, so start prices are independent of add order and of `PYTHONHASHSEED`.
- Tracer (Task 1) proven in-process and in a fresh Python subprocess under `PYTHONHASHSEED=12345`.
- Statistical tests are seeded and use `dt = 1/252` with events off: volatility within 5% of 0.22/0.20/0.18/0.50, correlation 0.6 (AAPL-MSFT) and 0.3 (AAPL-JPM, AAPL-TSLA) within 0.05.
- Backend suite: 85 passed, no warnings summary (62 before this plan).

## Task Commits

1. **Task 1: Stable start price for any ticker (tracer)** - `ddd90e5` (feat)
2. **Task 2: GBM math, correlation, events and seeding pinned by tests** - `3674460` (test)

**Plan metadata:** committed with this SUMMARY (docs: complete plan)

## Files Created/Modified

- `backend/app/market/simulator.py` - `import hashlib`, `derived_price()`, `add_ticker` uses `SEED_PRICES.get(ticker) or derived_price(ticker)`
- `backend/tests/market/test_simulator.py` - 18 test functions (some parametrized, 23 collected)

## Decisions Made

- Start price is a pure function of the ticker (sha256, first 8 bytes, big-endian over 2**64, `round(50 + 250 * f, 2)`); the built-in `hash()` is salted per process and was not used.

## Deviations from Plan

None - plan executed exactly as written.

Notes (not deviations):
- The plan's hard-coded values (PYPL 211.74, ZZZZ 196.93) matched the function on the first run, so no expected value was edited.
- Task 2 is `tdd="true"`, but the simulator from 02-01 plus Task 1 already satisfied every listed behavior, so all new tests passed on first run and no defect was found. There was no failing RED run, and `simulator.py` was not touched in Task 2. No tolerance was loosened. The plan type is `execute`, so no TDD gate applies.
- The tracer gate ran in end-of-phase mode with an automated-only verify; it passed, so expansion proceeded.

**Total deviations:** 0 auto-fixed.

## Issues Encountered

None.

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None. No new surface; T-02-09 and T-02-SC were accepted as planned and nothing was installed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for 02-04 (factory edits; the simulator branch and signature are unchanged).
- Phase 3 watchlist add: any symbol starts at the same price on every restart.
- Carried flags from the plan: cadence drift of `asyncio.sleep(0.5)`, event timing, and wall-clock timestamps are not asserted, so E2E specs with `SIM_SEED=1` must not assert exact prices.
- `test_running_source_moves_prices_and_removes_tickers` relies on at least one 2-dp-rounded price differing after 0.1 s at a 0.01 s interval; it passed 6 of 6 runs, but a very slow runner could in principle flake it.

---
*Phase: 02-live-market-terminal*
*Completed: 2026-10-08*

## Self-Check: PASSED

Created file exists (`backend/tests/market/test_simulator.py`); commits ddd90e5 and 3674460 are on the branch; all task acceptance criteria re-run green (derived_price def, SEED_PRICES.get ... derived_price line, no `rng.uniform(50`, PYTHONHASHSEED, 18 `def test_`, corrcoef, `event_probability=1`, `__abstractmethods__`); `tests/market` 39 passed; full backend suite 85 passed with no warnings summary.
