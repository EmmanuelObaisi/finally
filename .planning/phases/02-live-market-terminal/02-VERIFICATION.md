---
phase: 02-live-market-terminal
verified: 2026-10-10T06:00:00Z
status: passed
score: 5/5 must-haves verified
covered_files:
  - ".planning/phases/02-live-market-terminal/02-01-PLAN.md"
  - ".planning/phases/02-live-market-terminal/02-01-SUMMARY.md"
  - ".planning/phases/02-live-market-terminal/02-02-PLAN.md"
  - ".planning/phases/02-live-market-terminal/02-02-SUMMARY.md"
  - ".planning/phases/02-live-market-terminal/02-03-PLAN.md"
  - ".planning/phases/02-live-market-terminal/02-03-SUMMARY.md"
  - ".planning/phases/02-live-market-terminal/02-04-PLAN.md"
  - ".planning/phases/02-live-market-terminal/02-04-SUMMARY.md"
  - ".planning/phases/02-live-market-terminal/02-05-PLAN.md"
  - ".planning/phases/02-live-market-terminal/02-05-SUMMARY.md"
  - ".planning/phases/02-live-market-terminal/02-06-PLAN.md"
  - ".planning/phases/02-live-market-terminal/02-06-SUMMARY.md"
  - ".planning/phases/02-live-market-terminal/02-07-PLAN.md"
  - ".planning/phases/02-live-market-terminal/02-07-SUMMARY.md"
  - "backend/app/config.py"
  - "backend/app/db.py"
  - "backend/app/main.py"
  - "backend/app/market/cache.py"
  - "backend/app/market/factory.py"
  - "backend/app/market/interface.py"
  - "backend/app/market/massive_client.py"
  - "backend/app/market/models.py"
  - "backend/app/market/seed_prices.py"
  - "backend/app/market/simulator.py"
  - "backend/app/market/stream.py"
  - "backend/app/portfolio.py"
  - "backend/app/watchlist.py"
  - "backend/tests/market/test_cache.py"
  - "backend/tests/market/test_massive.py"
  - "backend/tests/market/test_shutdown.py"
  - "backend/tests/market/test_simulator.py"
  - "backend/tests/market/test_stream.py"
  - "backend/tests/test_db.py"
  - "frontend/src/components/ConnectionDot.tsx"
  - "frontend/src/components/Header.tsx"
  - "frontend/src/components/PriceCell.tsx"
  - "frontend/src/components/Sparkline.tsx"
  - "frontend/src/components/WatchlistPanel.tsx"
  - "frontend/src/components/WatchlistRow.tsx"
  - "frontend/src/lib/format.ts"
  - "frontend/src/lib/store.ts"
  - "frontend/src/lib/totals.ts"
  - "frontend/src/lib/useMarketStream.ts"
  - "test/connection.spec.ts"
  - "test/motion.spec.ts"
  - "test/playwright.config.ts"
  - "test/smoke.spec.ts"
covered_digest: "v3:sha256:fd3cbf5ae975d97b575980fcf3d03f7b514196a9a3a802915dc9d888487e9b97"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 5/5
  gaps_closed: []
  gaps_remaining: []
  regressions: []
advisory: []
---

# Phase 2: Live Market Terminal Verification Report

**Phase Goal:** A user opens FinAlly and watches the 10 default tickers stream live in a dark terminal, with $10,000 cash shown and a live connection indicator
**Verified:** 2026-10-10
**Status:** passed
**Re-verification:** Yes. The prior report (2026-10-08) was stale because Phases 3-6 edited files it covered. This pass judges the current codebase against the Phase 2 goal and requirements. Later-phase evolution of the same files (tracking.py, trading routes, extra components, chat) is expected and is not treated as a regression where the Phase 2 behavior still holds.

## Goal Achievement

The goal still holds in the current code. I read the market engine, SSE stream, DB seed, GET endpoints, the stream hook, store, header, connection dot, price cell, row and sparkline. I re-ran the Phase 2 test slices in my own process. Human-only items were closed by `02-UAT.md` (3 of 3 passed, including a real Massive key run), and the later `app/` and component changes did not alter the paths those items exercised.

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 10 seeded tickers in a dense dark layout; about 2 updates per second; green/red flash fading about 500 ms; occasional 2-5% events | VERIFIED | `db.py` `DEFAULT_TICKERS` and `init_db` seed the 10 tickers in order. `simulator.py` steps every `TICK_SECONDS = 0.5`, with `_event_shocks` drawing 2-5% jumps. `globals.css` defines `flash-up` and `flash-down` keyframes at 500 ms. `PriceCell.tsx` remounts the span on a new `flash.seq` (CSS only, no timers) and sets `data-flash`. `layout.tsx` body is `bg-surface` (#0d1117). `smoke.spec.ts` asserts the body color `rgb(13, 17, 23)`, 10 rows in seed order and a changing AAPL price. UAT test 3 passed (1280x720 and 1920x1080) |
| 2 | Row shows price, change % since session start, sparkline from page load; `--` before first tick; shared formatters, tabular numerals | VERIFIED | `WatchlistRow.tsx` uses `fmtPct`/`fmtMoney` from `format.ts` (null, NaN and Infinity give `--`), `tabular-nums` on the cells, and `<Sparkline>`. `Sparkline.tsx` uses `chart.addSeries(LineSeries)` (v5 API), attribution off, no axes, and re-seeds from the capped `store.spark` buffer (`SPARK_CAP = 300`, one point per second). `models.py` measures `change_percent` from `session_start_price`. `cache.update` ignores a price that rounds to <= 0 |
| 3 | Fresh DB created and seeded; header shows $10,000.00 total and cash; green/yellow/red dot; reconnects on its own after backend restart | VERIFIED | `init_db` creates the file, schema and, only when no `users_profile` row exists, seeds $10,000 cash, the 10 watchlist rows and a $10,000 snapshot. `portfolio.py` returns `cash` and `total_value`. `Header.tsx` renders them through `liveTotals` and `fmtMoney`, dims at 60% opacity when disconnected, and refetches on reconnect. `ConnectionDot.tsx` maps connected/reconnecting/disconnected to `bg-up`/`bg-warn`/`bg-down`. `useMarketStream.ts` keeps one EventSource, turns the dot red after 5000 ms, and recreates a CLOSED source with backoff 1, 2, 4, 10 s. UAT test 2: real uvicorn kill and restart, yellow at +0.5 s, red at +5.0 s, green on its own, portfolio refetched |
| 4 | With `MASSIVE_API_KEY` the same UI is fed by the Massive poller; `SIM_SEED` makes output reproducible; a non-seed ticker starts at the same derived price across restarts | VERIFIED | `factory.py` returns `MassiveDataSource` when the key is non-blank, else `SimulatorDataSource(seed=settings.sim_seed, event_probability=...)`. `config.py` reads `SIM_SEED` and `SIM_EVENT_PROBABILITY`. `derived_price` is sha256-based and process-independent. `massive_client.py` uses the multi-ticker snapshot on paid plans and falls back to Grouped Daily on `NOT_AUTHORIZED`; `start()` re-raises only on "Unknown API Key". UAT test 1 ran a real Massive key through the unchanged UI on this Windows + Avast machine |
| 5 | Server exits promptly with browsers connected; market data unit tests pass | VERIFIED | `main.py` lifespan calls `source.start(tickers)` after `init_db` and `source.stop()` on exit; both sources cancel and await their task. The Dockerfile CMD sets `--timeout-graceful-shutdown 3` and `conftest.py` uses `timeout_graceful_shutdown=1`. `tests/market/test_shutdown.py` is in the passing run. Market data tests (cache, factory, massive, shutdown, simulator, stream) pass |

**Score:** 5/5 truths verified. No behavior-dependent truth is left without a behavioral test: reconnect has fake-timer tests plus a real restart (UAT 2), and the shutdown invariant has `test_shutdown.py`.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/app/market/{models,cache,interface,simulator,massive_client,factory,stream,seed_prices}.py` | Market engine | VERIFIED | All read in full. Cache has a version counter, session-start price, thread lock and zero-price guard. Interface and factory keep downstream code source-agnostic |
| `backend/app/{db,config,main,watchlist,portfolio}.py` | Schema, seed, GET endpoints, lifespan | VERIFIED | Natural PKs on `users_profile`, `watchlist`, `positions`; UUID ids on `trades`, `portfolio_snapshots`, `chat_messages`; `user_id` default on all tables. Stream router is included above the `/api` catch-all |
| `frontend/src/lib/{store,useMarketStream,format,totals}.ts` | Store, single EventSource, formatters | VERIFIED | 126 tests across the 8 Phase 2 frontend files pass |
| `frontend/src/components/{Header,ConnectionDot,WatchlistPanel,WatchlistRow,PriceCell,Sparkline}.tsx` | Terminal UI | VERIFIED | All read. Wired into `app/page.tsx`, which calls `useMarketStream()` once |
| `test/{smoke,connection,motion}.spec.ts`, `playwright.config.ts` | E2E | VERIFIED | Not re-run here (no Docker or server start requested). Phase 6 verification re-ran the container E2E suite: "passed 20, skipped 0, failed 0, flaky 0", which includes these scenarios |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `main.py` lifespan | `init_db`, then `source.start`, then `source.stop` | startup order | WIRED | DB is seeded and tickers loaded before the source starts |
| `PriceCache.version` | SSE frames | `price_frames` in `stream.py` | WIRED | One frame (dict of all tickers) per version change, preceded by `retry: 1000` |
| `useMarketStream` | `store.receiveFrame` / `setStatus` | `EventSource("/api/stream/prices")` | WIRED | `onopen`, `onmessage`, `onerror` all feed the store |
| `store.prices` | `PriceCell`, `Header`, `WatchlistRow` | zustand selectors | WIRED | Per-ticker selectors; flash only on newer timestamp with up/down direction |
| `store.spark[ticker]` | `Sparkline` chart | `setData(toData(buffer))` | WIRED | Buffer effect updates the series created by the mount effect |
| `create_app` | Massive or simulator | `create_market_data_source` | WIRED | Chosen from `Settings` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `WatchlistRow` price | `live.price` | SSE frame from `PriceCache`, written by simulator or Massive | Yes | FLOWING |
| `Header` total/cash | `portfolio.cash` | SQLite `users_profile` via `build_portfolio` | Yes | FLOWING |
| `Sparkline` | `spark[ticker]` | `applyFrame` per SSE frame | Yes | FLOWING |
| `ConnectionDot` | `status` | EventSource events and timers | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 2 backend slice (market, db, watchlist, portfolio) | `cd backend && UV_SYSTEM_CERTS=1 uv run python -m pytest -q tests/market tests/test_db.py tests/test_watchlist.py tests/test_portfolio.py` | 106 passed in 9.71 s | PASS |
| Phase 2 frontend slice (store, stream hook, format, totals, Sparkline, PriceCell, Header, WatchlistPanel) | `cd frontend && npx vitest run <8 files>` | 8 files, 126 tests passed | PASS |
| Full regression suites (supplied by the orchestrator, not re-run by me) | backend `uv run python -m pytest -q`; frontend `npx vitest run` | 329 passed; 345 passed | PASS (reported) |
| Container E2E including smoke, connection, motion | Phase 6 `npm --prefix test run e2e` | 20 passed, 0 failed, 0 flaky (06-VERIFICATION.md) | PASS (prior evidence) |

### Probe Execution

Step 7c: SKIPPED. No `probe-*.sh` scripts exist or are declared by the Phase 2 plans.

### Requirements Coverage

The union of `requirements:` across the seven PLAN files is exactly the 21 IDs given for this phase: 02-01 (MKT-01, MKT-06, MKT-07, MKT-09, MKT-10, TEST-01), 02-02 (DB-01, DB-02, DB-03, WL-01, PORT-01), 02-03 (MKT-01, MKT-02, MKT-03, MKT-04, MKT-06, TEST-01), 02-04 (MKT-05, MKT-06, TEST-01), 02-05 (UI-01, UI-03, UI-04, UI-08, WL-01), 02-06 (UI-01, UI-02, UI-03, UI-08, PORT-01), 02-07 (UI-01, UI-04, UI-05, UI-08, MKT-10). All 21 are `[x]` and Complete in REQUIREMENTS.md. REQUIREMENTS.md maps no further IDs to Phase 2, so there are no orphans (MKT-08 is mapped to Phase 3).

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MKT-01 | 02-01, 02-03 | Correlated GBM, 500 ms ticks, seed prices | SATISFIED | `simulator.py` Cholesky GBM, `TICK_SECONDS`, `SEED_PRICES`; `test_simulator.py` |
| MKT-02 | 02-03 | 2-5% events | SATISFIED | `_event_shocks` uniform(0.02, 0.05) and its test |
| MKT-03 | 02-03 | Deterministic derived price for non-seed tickers | SATISFIED | `derived_price` (sha256) and process-independence test |
| MKT-04 | 02-03 | `SIM_SEED`, `SIM_EVENT_PROBABILITY` | SATISFIED | `config.py` into `factory.py` into the simulator |
| MKT-05 | 02-04 | Massive REST poller, paid and free paths | SATISFIED | `massive_client.py`, `test_massive.py`, real-key UAT test 1 |
| MKT-06 | 02-01, 02-03, 02-04 | One interface, factory | SATISFIED | `interface.py`, `factory.py`, `test_factory.py` |
| MKT-07 | 02-01 | Cache with version and session-start price | SATISFIED | `cache.py`, `test_cache.py` |
| MKT-09 | 02-01 | SSE frames, dict of all tickers | SATISFIED | `stream.py`, `models.PriceUpdate.to_dict`, `test_stream.py` |
| MKT-10 | 02-01, 02-07 | Clean start/stop, no hang | SATISFIED | lifespan, `test_shutdown.py`, graceful-timeout flag in Dockerfile and test server |
| DB-01 | 02-02 | Lazy idempotent SQLite | SATISFIED | `init_db`, `test_db.py` |
| DB-02 | 02-02 | Natural PKs, UUID ids, `user_id` | SATISFIED | `SCHEMA` in `db.py` |
| DB-03 | 02-02 | Seed $10,000, 10 tickers, snapshot | SATISFIED | `init_db`; E2E asserts `$10,000.00` |
| WL-01 | 02-02, 02-05 | `GET /api/watchlist` | SATISFIED | `watchlist.py` `build_watchlist`; smoke E2E shows 10 rows |
| PORT-01 | 02-02, 02-06 | `GET /api/portfolio` | SATISFIED | `portfolio.py` `build_portfolio`; header E2E |
| UI-01 | 02-05, 02-06, 02-07 | Dark theme, dense layout | SATISFIED | `globals.css` palette, body `bg-surface`, E2E body color, UAT 3 |
| UI-02 | 02-06 | Header total, cash, dot | SATISFIED | `Header.tsx`, `ConnectionDot.tsx`, `connection.spec.ts` |
| UI-03 | 02-05, 02-06 | Single EventSource, reconnect | SATISFIED | `useMarketStream.ts`, `useMarketStream.test.ts`, UAT 2 |
| UI-04 | 02-05, 02-07 | Price, change %, sparkline | SATISFIED | `WatchlistRow.tsx`, `Sparkline.tsx` |
| UI-05 | 02-07 | Flash green/red, about 500 ms | SATISFIED | `PriceCell.tsx`, keyframes, `motion.spec.ts`, UAT 3 |
| UI-08 | 02-05, 02-06, 02-07 | `--` placeholders, shared formatters | SATISFIED | `format.ts`, `format.test.ts` |
| TEST-01 | 02-01, 02-03, 02-04 | Market data unit tests | SATISFIED | tests/market suite green (106 in the slice I ran, 329 in the full run) |

### Anti-Patterns Found

No `TBD`, `FIXME`, `XXX`, `TODO` or `HACK` marker in `backend/app`, `frontend/src` or `test/*.ts`. No stubs, empty handlers or hollow props in the covered files.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/app/market/massive_client.py` | 61 | Bad-key detection by message text ("Unknown API Key") | Info | If Massive rewords the error, a rejected key logs tracebacks instead of failing fast. Tracked as IN-08 in `02-REVIEW-DISPOSITION.md` |
| `backend/app/market/massive_client.py` | 84-86 | `add_ticker` re-polls everything outside EOD mode | Info | Latent call-budget cost on the free plan. IN-03/IN-04, not goal-affecting |

### Human Verification Required

None open. The three human items were completed in `02-UAT.md` (3 of 3 passed): real `MASSIVE_API_KEY` run with the unchanged UI, real backend kill and restart reconnect, and the 30 s visual watch at two resolutions.

### Gaps Summary

No gaps. All five roadmap success criteria hold in the current code, and all 21 requirement IDs are accounted for in the plans and in REQUIREMENTS.md with no orphans. Later phases extended the same files (tracked-ticker sync, trading, history, chat, extra panels) without breaking any Phase 2 behavior. The Phase 2 test slices pass in my own run, and the orchestrator-supplied full suites (329 backend, 345 frontend) pass.

---

_Verified: 2026-10-10_
_Verifier: Claude (gsd-verifier)_
