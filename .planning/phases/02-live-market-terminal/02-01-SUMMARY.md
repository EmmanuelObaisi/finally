---
phase: 02-live-market-terminal
plan: 01
subsystem: api
tags: [fastapi, sse, numpy, gbm, simulator, uvicorn, pytest-asyncio, playwright]

requires:
  - phase: 01-foundation
    provides: create_app factory, Settings, error envelope, /api catch-all, Playwright webServer
provides:
  - backend/app/market package (PriceUpdate, PriceCache, MarketDataSource, seed prices, GBM simulator, factory)
  - GET /api/stream/prices native SSE route (retry: 1000, one frame per cache version change)
  - lifespan that starts and awaits-stops the market source; app.state.cache / source / settings
  - live_server pytest fixture (real uvicorn on a free port)
  - Playwright webServer launched with --timeout-graceful-shutdown 2, temp DB_PATH, SIM_SEED=1, no events
affects: [02-02, 02-03, 02-04, 02-05, 02-06, 02-07]

actuals:
  tokens: 5500
  tasks: 3
  commits: 2

tech-stack:
  added: [numpy 2.5.3, pytest-asyncio 1.4.0]
  patterns:
    - cache, source and app built inside create_app (no module-level instances)
    - real-uvicorn in-process server for SSE and shutdown tests (TestClient and ASGITransport buffer infinite bodies)
    - every launch path passes --timeout-graceful-shutdown (uvicorn waits for open SSE streams before lifespan shutdown)

key-files:
  created:
    - backend/app/market/__init__.py
    - backend/app/market/models.py
    - backend/app/market/cache.py
    - backend/app/market/interface.py
    - backend/app/market/seed_prices.py
    - backend/app/market/simulator.py
    - backend/app/market/factory.py
    - backend/app/market/stream.py
    - backend/tests/market/test_stream.py
    - backend/tests/market/test_cache.py
    - backend/tests/market/test_shutdown.py
  modified:
    - backend/pyproject.toml
    - backend/uv.lock
    - backend/app/main.py
    - backend/tests/conftest.py
    - test/playwright.config.ts

key-decisions:
  - "SSE poll interval 0.1 s (not 0.5 s) so the poll does not alias with the 0.5 s simulator tick; frames still go out only when cache.version changes"
  - "SimulatorDataSource.stop() cancels and awaits the task; the loop body (not the loop) logs step errors so one bad step cannot freeze prices"
  - "SimulatorDataSource.add_ticker is a no-op for an already simulated ticker (no cache write, no version bump)"
  - "Lifespan starts the source with list(SEED_PRICES); plan 02-02 swaps this for the database's tracked tickers"

patterns-established:
  - "live_server fixture: uvicorn.Server on port 0, should_exit teardown awaited within 5 s"
  - "price_frames(cache, poll_seconds) is a plain async generator so frame logic is unit-tested with anext and no HTTP"

requirements-completed: [MKT-01, MKT-06, MKT-07, MKT-09, MKT-10, TEST-01]

coverage:
  - id: D1
    description: "GET /api/stream/prices sends retry: 1000 then a data frame keyed by the 10 default tickers with the eight PriceUpdate keys"
    requirement: MKT-09
    verification:
      - kind: integration
        ref: "backend/tests/market/test_stream.py#test_live_stream_sends_retry_then_full_price_frame"
        status: pass
      - kind: other
        ref: "curl -N http://127.0.0.1:8765/api/stream/prices against uvicorn --factory app.main:create_app"
        status: pass
    human_judgment: false
  - id: D2
    description: "PriceCache keeps latest, previous, session-start price and a version counter with rounding rules"
    requirement: MKT-07
    verification:
      - kind: unit
        ref: "backend/tests/market/test_cache.py"
        status: pass
    human_judgment: false
  - id: D3
    description: "Frames are emitted once per version change, coalesce writes, handle empty and removed tickers, keep insertion order"
    requirement: MKT-09
    verification:
      - kind: unit
        ref: "backend/tests/market/test_stream.py#test_two_writes_between_polls_coalesce_into_one_frame"
        status: pass
      - kind: integration
        ref: "backend/tests/market/test_stream.py#test_two_clients_both_receive_frames_and_survive_each_other"
        status: pass
    human_judgment: false
  - id: D4
    description: "A real uvicorn server with an open SSE client exits within 4 s; lifespan cancels and awaits the source task"
    requirement: MKT-10
    verification:
      - kind: integration
        ref: "backend/tests/market/test_shutdown.py"
        status: pass
    human_judgment: false
  - id: D5
    description: "GBM simulator runs as a MarketDataSource built by the factory from Settings (seed and event probability)"
    requirement: MKT-06
    verification:
      - kind: unit
        ref: "backend/tests/market/test_shutdown.py#test_source_start_caches_tickers_ticks_and_stops_twice"
        status: pass
    human_judgment: false
  - id: D6
    description: "Playwright webServer launches the backend with the graceful-shutdown flag and isolated, deterministic env; Phase 1 E2E specs still pass"
    verification:
      - kind: e2e
        ref: "npm --prefix test run smoke (4 passed)"
        status: pass
    human_judgment: false

duration: 3 min
completed: 2026-10-08
status: complete
---

# Phase 2 Plan 01: Live Price Stream Summary

**GBM market simulator feeding a thread-safe PriceCache, streamed over native FastAPI SSE (`retry: 1000` plus one frame per cache version change), with lifespan wiring and real-uvicorn tests proving the wire format and a sub-4 s shutdown with an open stream.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-10-08T13:31:56Z
- **Completed:** 2026-10-08T13:35:02Z
- **Tasks:** 3 (Task 1 resolved by the orchestrator before this run)
- **Files modified:** 16 (including uv.lock)

## Approved packages

Task 1 (package legitimacy, `gate="blocking-human"`) was approved by the user ("approved", full list as-is, no replacements). The orchestrator verified registry metadata: repository URLs match and no npm install/postinstall scripts exist. Plans 02-04 and 02-05 install from this list; use these exact versions.

PyPI:

| Package | Version | Repository | Installed by |
|---------|---------|------------|--------------|
| numpy | 2.5.3 | github.com/numpy/numpy | 02-01 (done) |
| pytest-asyncio | 1.4.0 (dev extra) | github.com/pytest-dev/pytest-asyncio | 02-01 (done) |
| massive | 2.8.0 (pulls urllib3 2.8.0) | github.com/massive-com/client-python | 02-04 |

npm:

| Package | Version | Kind | Installed by |
|---------|---------|------|--------------|
| lightweight-charts | 5.2.1 | dependency | 02-05 |
| zustand | 5.0.15 | dependency | 02-05 |
| vitest | 5.0.3 | devDependency | 02-05 |
| vite | 8.3.3 | devDependency | 02-05 |
| @vitejs/plugin-react | 6.1.2 | devDependency | 02-05 |
| jsdom | 30.1.2 | devDependency | 02-05 |
| @testing-library/react | 16.3.3 | devDependency | 02-05 |
| @testing-library/dom | 10.4.2 | devDependency | 02-05 |
| @testing-library/jest-dom | 7.0.1 | devDependency | 02-05 |

Not installed: truststore (not needed; certifi reaches api.massive.com with verification on). No replacements were named. TLS verification stayed on throughout; `UV_SYSTEM_CERTS=1` was exported for uv commands and nothing else was changed.

## Accomplishments

- `backend/app/market/` package copied from the checked-in design docs with the plan's deltas (awaited `stop()`, per-step error logging, idempotent `add_ticker`, factory taking `(cache, settings)`).
- `GET /api/stream/prices` via `fastapi.sse`: first line `retry: 1000`, then `data:` frames keyed by the 10 seed tickers in seed order, each value the eight PriceUpdate keys. Verified with pytest against a real uvicorn and with `curl -N` against a hand-launched `uvicorn --factory app.main:create_app`.
- Lifespan builds nothing at import; `create_app` constructs `PriceCache` and the source, lifespan sets `app.state.cache/source/settings`, starts the source and awaits its stop. The stream router sits above the `/api/{path:path}` catch-all.
- 46 backend tests pass with no warnings summary (31 existing plus 15 new); existing E2E specs still pass with the new webServer flags.

## Task Commits

1. **Task 1: Verify Phase 2 packages** - resolved by the orchestrator (no commit)
2. **Task 2: Live price stream end to end (tracer)** - `d99aa50` (feat)
3. **Task 3: Cache, frame and shutdown guarantees, Playwright flags** - `24a761a` (test)

**Plan metadata:** committed with this SUMMARY (docs: complete plan)

## Files Created/Modified

- `backend/app/market/models.py` - `PriceUpdate` frozen dataclass with `change`, `direction`, `change_percent`, `to_dict()`
- `backend/app/market/cache.py` - `PriceCache` with lock, `version`, session-start price
- `backend/app/market/interface.py` - `MarketDataSource` ABC
- `backend/app/market/seed_prices.py` - seed prices, GBM params, sectors, correlations
- `backend/app/market/simulator.py` - `GBMSimulator` and `SimulatorDataSource`
- `backend/app/market/factory.py` - `create_market_data_source(cache, settings)`
- `backend/app/market/stream.py` - `price_frames()` and the SSE router
- `backend/app/main.py` - cache/source built in `create_app`, lifespan start/stop, router inclusion
- `backend/tests/conftest.py` - async `live_server` fixture
- `backend/tests/market/test_stream.py`, `test_cache.py`, `test_shutdown.py` - wire format, cache, frame and shutdown tests
- `backend/pyproject.toml`, `backend/uv.lock` - numpy, pytest-asyncio, `asyncio_mode = "auto"`
- `test/playwright.config.ts` - `--timeout-graceful-shutdown 2`, temp `DB_PATH`, `SIM_SEED=1`, `SIM_EVENT_PROBABILITY=0`

## Decisions Made

- 0.1 s SSE poll with a version compare: avoids aliasing with the 0.5 s tick and costs one integer compare per poll (RESEARCH Delta 5).
- Kept the single justified exception handler in the simulator loop body; `CancelledError` is not an `Exception`, so cancellation still ends the loop.
- Unknown tickers still get a random seed price in `GBMSimulator.add_ticker`, as copied; plan 02-03 replaces it with the sha256-derived price.

## Deviations from Plan

None - plan executed exactly as written.

### TDD note (Task 3)

Task 3 is `tdd="true"` but follows a tracer task that already built the production code, so the tests were written against existing behavior and all passed on first run; there was no failing RED run and no separate RED commit. No behavior was found wrong, so no fixes were made to Task 2 files. Tests and the Playwright change share one `test(02-01)` commit. The `test`-before-`feat` ordering that the TDD gate expects is therefore not present for this task (plan type is `execute`, not `tdd`, so no gate applies).

**Total deviations:** 0 auto-fixed.

## Issues Encountered

None. A first-attempt shell heredoc for editing `main.py` did not apply; the file was unchanged and the edit was redone with the Edit tool before any commit.

## Authentication Gates

None. The Task 1 human-verify gate was resolved before execution.

## Known Stubs

None.

## Threat Flags

None. The new SSE route serializes only `PriceUpdate.to_dict()` values (T-02-03); no settings or keys reach it. T-02-01 is mitigated by the Playwright flag and `test_shutdown.py`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for 02-02: swap `list(SEED_PRICES)` in the lifespan for the database's tracked tickers; `app.state.cache` and `app.state.source` are in place.
- 02-03 hardens the simulator add-ticker price; 02-04 adds the Massive branch to `create_market_data_source`.
- Unresolved flag from the plan: prompt exit depends on every launcher passing `--timeout-graceful-shutdown` (Dockerfile and Playwright done; README dev command is 02-07).
- Note for 02-05: Phase 1 E2E specs (`smoke.spec.ts`, `health-status.spec.ts`) still target the placeholder page and must be replaced or kept when `page.tsx` changes.

---
*Phase: 02-live-market-terminal*
*Completed: 2026-10-08*
