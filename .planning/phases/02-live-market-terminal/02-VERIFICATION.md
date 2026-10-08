---
phase: 02-live-market-terminal
verified: 2026-10-08T15:30:00Z
status: human_needed
score: 4/5 must-haves verified
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
  - "backend/app/db.py"
  - "backend/app/main.py"
  - "backend/app/market/massive_client.py"
  - "backend/app/market/simulator.py"
  - "backend/app/market/stream.py"
  - "frontend/src/components/Header.tsx"
  - "frontend/src/components/Sparkline.tsx"
  - "frontend/src/components/WatchlistPanel.tsx"
  - "frontend/src/lib/store.ts"
  - "frontend/src/lib/useMarketStream.ts"
covered_digest: "v3:sha256:a190b7d553512bbe11a7bfff5fa07fa83167e483ca2d1434751cb56ab04adac4"
behavior_unverified: 0
overrides_applied: 0
re_verification: false
human_verification:
  - test: "Run with a real MASSIVE_API_KEY (paid and, if available, free plan) and open the UI"
    expected: "Same 10 rows stream with no frontend change; startup does not fail on this Windows + Avast machine (certifi vs OS trust store)"
    why_human: "Only a stubbed client is tested (no key, no network). Review WR-05 predicts CERTIFICATE_VERIFY_FAILED here, and WR-04 turns any start-time Massive error into a dead app"
  - test: "With the page open in a real browser, kill the backend, wait more than 5 s, restart it with the same DB_PATH"
    expected: "Dot goes yellow, then red after 5 s, header dims; after restart the dot returns to green on its own, prices resume, header total refetches"
    why_human: "State machine is proven with a fake EventSource and fake timers, and a stubbed HTTP 500 in Playwright. A real server kill and restart against Chromium EventSource is not automated"
  - test: "Watch the terminal for 30 s at 1280x720 and 1920x1080"
    expected: "Flashes fade smoothly over ~500 ms, sparklines grow, layout feels dense and readable"
    why_human: "Visual quality and animation smoothness"
---

# Phase 2: Live Market Terminal Verification Report

**Phase Goal:** A user opens FinAlly and watches the 10 default tickers stream live in a dark terminal, with $10,000 cash shown and a live connection indicator
**Verified:** 2026-10-08
**Status:** human_needed
**Re-verification:** No, initial verification

## Goal Achievement

The core goal is achieved in the code. I started a real backend (fresh DB, simulator) and a headless Chromium against the exported frontend. The page showed 10 rows streaming, live sparklines (323 non-transparent canvas pixels on AAPL), a header of `$10,000.00` total and cash, and a green connection dot with the label "Live" (screenshot inspected). `GET /api/health`, `/api/portfolio`, `/api/watchlist` and the SSE stream returned the contract shapes. The only open items are real-service and real-browser behaviors that no automated check covers.

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 10 seeded tickers in a dense dark layout; ~2 updates/s; green/red flash fading ~500 ms; occasional 2-5% events | VERIFIED | `db.py` seeds the 10 tickers in order; simulator `TICK_SECONDS = 0.5`, `_event_shocks` uniform 2-5%, default probability 0.001; `globals.css` has 500 ms `flash-up`/`flash-down` keyframes, `PriceCell` restarts the animation by `key=flash.seq`; body background `rgb(13, 17, 23)` asserted in `smoke.spec.ts` (passes); `motion.spec.ts` flash test passes; live screenshot shows the dark terminal |
| 2 | Row shows price, change % since session start, sparkline from page load; `--` before first tick; shared formatters with tabular numerals | VERIFIED | `change_percent` = `(price / session_start_price - 1) * 100` (`models.py`); `format.ts` is the only formatter, `usable()` maps null/NaN/Infinity to `--`; `tabular-nums` on price/change cells; `Sparkline.tsx` renders a Lightweight Charts v5 line from the store buffer, confirmed non-blank in a real browser; `format.test.ts` and `WatchlistPanel.test.tsx` pass |
| 3 | Fresh DB is recreated and seeded; header shows $10,000.00 total and cash; green/yellow/red dot; auto-reconnect after backend restart | VERIFIED (real-browser restart is a human item) | `init_db` runs in the lifespan (idempotent, seed-once, `BEGIN IMMEDIATE`); `test_db.py::test_app_start_creates_and_recreates_database` passes; I started on a nonexistent DB path and got cash 10000.0; `connection.spec.ts` asserts `$10,000.00` and `data-status="connected"` (passes); `useMarketStream.ts` has the 5 s red timer and 1/2/4/10 s capped backoff, covered by 15 fake-timer unit tests |
| 4 | With `MASSIVE_API_KEY` the same UI is fed by the Massive poller; `SIM_SEED` makes output reproducible; non-seed ticker starts at the same derived price across restarts | PARTIAL: simulator half VERIFIED, Massive half UNCERTAIN (human) | `factory.py` branches on the key; `derived_price` is sha256-based and tested in a subprocess with a different `PYTHONHASHSEED`; seeded RNG tests pass; Massive paid snapshot and free Grouped Daily are tested only through a `StubClient` (`test_massive.py`). No real API call was made; see WR-04 and WR-05 |
| 5 | Server exits promptly with browsers connected; market data unit tests pass | VERIFIED | `test_shutdown.py::test_server_exits_promptly_with_an_open_stream` (real uvicorn plus open SSE client, under 4 s) passes inside the 109-test run; `--timeout-graceful-shutdown` is set in the Dockerfile CMD, README dev command and Playwright config; simulator (18 tests), cache, stream, Massive parsing and factory tests all pass |

**Score:** 4/5 truths verified (truth 4 partially verified, Massive live path routed to human)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/app/market/{models,cache,interface,simulator,massive_client,factory,stream,seed_prices}.py` | Market engine | VERIFIED | Substantive, imported by `main.py`; stream reads `cache.version` |
| `backend/app/db.py` | Schema, seed, connect | VERIFIED | Six tables, natural PKs on `users_profile`, `watchlist`, `positions`, UUID ids on the three append-only tables, `user_id` default `'default'` on all |
| `backend/app/watchlist.py`, `portfolio.py` | GET endpoints | VERIFIED | Real queries joined with the price cache; routers included in `create_app` |
| `frontend/src/lib/{store,useMarketStream,format,totals,api}.ts` | Store, single EventSource, formatters | VERIFIED | Wired from `page.tsx` and components |
| `frontend/src/components/{Header,ConnectionDot,WatchlistPanel,WatchlistRow,PriceCell,Sparkline,Footer}.tsx` | Terminal UI | VERIFIED | All rendered from `page.tsx`; Footer carries the charting attribution |
| `test/{smoke,connection,motion}.spec.ts` | E2E | VERIFIED | 6 of 6 pass (re-run by me) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `main.py` lifespan | `init_db` then `load_tracked_tickers` then `source.start` | startup order | WIRED | DB created before the source starts; `source.stop()` awaited on exit |
| `PriceCache.version` | SSE frames | `price_frames` | WIRED | A frame per version change (confirmed with live curl: `retry: 1000` then data frame) |
| `useMarketStream` | `store.receiveFrame` / `setStatus` | `EventSource("/api/stream/prices")` | WIRED | One source from `page.tsx` |
| `WatchlistRow` | store price/flash/spark slices | per-ticker selectors | WIRED | `PriceCell` and `Sparkline` read `flash[ticker]` and `spark[ticker]` |
| `Header` | `GET /api/portfolio` + store prices | `liveTotals` | WIRED | Refetches on transition to connected |
| `create_app` | Massive or simulator | `create_market_data_source` | WIRED | Key present selects Massive |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `WatchlistRow` price | `live.price` | SSE frame from `PriceCache`, written by the GBM task | Yes | FLOWING |
| `Header` total/cash | `portfolio.cash` | SQLite `users_profile` through `build_portfolio` | Yes | FLOWING (positions empty until Phase 3, by design) |
| `Sparkline` | `spark[ticker]` | `applyFrame` per SSE frame | Yes | FLOWING (323 drawn pixels in a real browser) |
| `ConnectionDot` | `status` | EventSource events and timers | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend suite | `uv run python -m pytest -q` (backend/) | 109 passed | PASS |
| Frontend suite | `npm test` (frontend/) | 86 passed, 8 files | PASS |
| E2E | `npm --prefix test run smoke` | 6 passed | PASS |
| Live backend on a fresh DB | uvicorn on a temp `DB_PATH`, curl health/portfolio/watchlist/stream | health ok, cash 10000.0, 10 priced tickers, SSE frame has all 8 contract fields, wrong-method POST on `/api/health` returns 404 as the contract says | PASS |
| Live browser | headless Chromium against the served export | header `$10,000.00`, dot `connected`, 323 sparkline pixels, screenshot shows the dark terminal | PASS |

### Probe Execution

Step 7c: SKIPPED. No `probe-*.sh` scripts exist or are declared by the phase plans.

### Requirements Coverage

All 21 phase IDs appear in at least one plan's `requirements:` frontmatter, are marked Complete in REQUIREMENTS.md traceability, and are backed by evidence. No orphaned Phase 2 requirements (MKT-08 is mapped to Phase 3).

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MKT-01 | 02-01, 02-03 | Correlated GBM, 500 ms ticks, seed prices | SATISFIED | `simulator.py`; vol and correlation tests |
| MKT-02 | 02-03 | 2-5% events | SATISFIED | `_event_shocks`; test at probability 1 gives 1.9-5.1% |
| MKT-03 | 02-03 | Deterministic derived price for non-seed tickers | SATISFIED | `derived_price`; process-independence test |
| MKT-04 | 02-03 | `SIM_SEED`, `SIM_EVENT_PROBABILITY` | SATISFIED | `config.py` into `SimulatorDataSource` |
| MKT-05 | 02-04 | Massive REST poller, paid and free paths | SATISFIED (stub-tested; live run is a human item) | `massive_client.py`, `test_massive.py` |
| MKT-06 | 02-01, 02-03, 02-04 | One interface, factory | SATISFIED | `interface.py`, `factory.py`, `test_factory.py` |
| MKT-07 | 02-01 | Cache with version and session-start price | SATISFIED | `cache.py`, `test_cache.py` |
| MKT-09 | 02-01 | SSE frames, dict of all tickers, 7 documented fields plus `session_start_price` | SATISFIED | `stream.py`, live curl. `change_percent` is session-start based; `change` is tick-over-tick, as `API_CONTRACT.md` defines |
| MKT-10 | 02-01, 02-07 | Clean start/stop, no hang | SATISFIED | `test_shutdown.py`; graceful timeout flag everywhere |
| DB-01 | 02-02 | Lazy idempotent SQLite | SATISFIED | `init_db`, `test_db.py` |
| DB-02 | 02-02 | Natural PKs, UUID ids, `user_id` | SATISFIED | schema in `db.py`, `test_schema_keys_and_user_id_defaults` |
| DB-03 | 02-02 | Seed $10,000, 10 tickers, snapshot | SATISFIED | `init_db`, live check |
| WL-01 | 02-02, 02-05 | `GET /api/watchlist` | SATISFIED | `watchlist.py`, live check |
| PORT-01 | 02-02, 02-06 | `GET /api/portfolio` | SATISFIED | `portfolio.py`, live check |
| UI-01 | 02-05, 02-06, 02-07 | Dark theme, dense layout | SATISFIED | theme tokens, E2E body color; density is a human item |
| UI-02 | 02-06 | Header total, cash, dot | SATISFIED | `Header.tsx`, `ConnectionDot.tsx`, E2E |
| UI-03 | 02-05, 02-06 | Single EventSource, reconnect | SATISFIED | `useMarketStream.ts`, 15 unit tests; real restart is a human item |
| UI-04 | 02-05, 02-07 | Price, change %, sparkline | SATISFIED | `WatchlistRow`, `Sparkline` |
| UI-05 | 02-07 | Flash green/red, ~500 ms | SATISFIED | `PriceCell`, keyframes, E2E |
| UI-08 | 02-05, 02-06, 02-07 | `--` placeholders, shared formatters | SATISFIED | `format.ts`, tests |
| TEST-01 | 02-01, 02-03, 02-04 | Market data unit tests | SATISFIED | simulator, cache, Massive, factory, stream tests, 109 backend tests green |

### Anti-Patterns Found

No `TBD`, `FIXME`, `XXX`, `TODO` or `HACK` markers in phase files. No stubs or hollow props found. 02-REVIEW.md (0 critical, 6 warning, 7 info) was weighed against the goal. None of it blocks the stated goal. All 13 findings are still `open` in `02-REVIEW-DISPOSITION.md`.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/app/market/massive_client.py` | 52-56 | WR-04: start-time poll error aborts app | Warning | Hits the Massive path only; one transient network error at boot kills the container. Not on the default simulator path |
| `backend/app/market/massive_client.py` | 8, 44 | WR-05: no truststore opt-in | Warning | With a key set on this machine the poll is likely to fail TLS, and with WR-04 the app will not start. Matters for truth 4 (Massive half) |
| `backend/app/market/models.py` | 33 | WR-06: sub-cent price rounds to 0, then ZeroDivisionError kills the stream | Warning | Not reachable from the simulator (prices 50-800 range). Reachable only from a Massive sub-cent quote |
| `frontend/src/components/Sparkline.tsx` | 55-60 | WR-01: chart not trimmed to the 300-point store cap | Warning | After 300 s a mounted sparkline shows a longer window than a fresh one. The sparkline still fills in |
| `test/motion.spec.ts` | 12-15 | WR-02: sparkline E2E passes on an empty canvas | Warning | Weak test; I checked non-blank pixels manually and they are drawn |
| `test/playwright.config.ts` | 23-28 | WR-03: E2E env does not pin `MASSIVE_API_KEY` | Warning | A developer key in `.env` would silently switch E2E to live Massive |
| Header, WatchlistPanel, others | - | IN-01..IN-07 | Info | Latent issues for Phase 3 (stale-response race, `remove_ticker` evicts held tickers, README PowerShell form) |

### Human Verification Required

#### 1. Live Massive feed

**Test:** Set a real `MASSIVE_API_KEY` in `.env` (paid and, if possible, free plan), start the backend, open the UI.
**Expected:** The same 10 rows stream with no frontend change. Startup succeeds on this Windows and Avast machine.
**Why human:** Only a stub client is tested. WR-05 predicts a TLS failure on this machine and WR-04 makes it fatal. If it fails, fix with `truststore` and an auth-only start-time failure.

#### 2. Backend kill and restart with a browser open

**Test:** Open the page, kill the backend, wait more than 5 s, restart it with the same `DB_PATH`.
**Expected:** Dot goes yellow, then red at 5 s with the header dimmed, then back to green without a reload. Prices resume and the header total refetches.
**Why human:** Unit tests use a fake EventSource and fake timers. Playwright only simulates a 500 response. A real Chromium EventSource against a killed server is not exercised automatically.

#### 3. Visual density and motion

**Test:** Watch for 30 s at 1280x720 and 1920x1080.
**Expected:** Flash fades smoothly, sparklines grow, the layout is dense and readable.
**Why human:** Visual quality.

### Gaps Summary

No gaps. Every roadmap success criterion is met by code that exists, is wired, and carries real data. I ran the backend suite (109), the frontend suite (86) and the Playwright smoke (6), and also drove a real backend and a real Chromium page. The status is `human_needed` because the Massive live path and the real backend-restart reconnect cannot be proven without a key and a live kill/restart. Triage the 13 open review findings in `02-REVIEW-DISPOSITION.md` before or during Phase 3. WR-04, WR-05 and WR-06 are the ones to fix before relying on Massive. Housekeeping: the ROADMAP.md Phase 2 checkbox and progress row still read "In Progress" and are for the orchestrator to update.

---

_Verified: 2026-10-08_
_Verifier: Claude (gsd-verifier)_
