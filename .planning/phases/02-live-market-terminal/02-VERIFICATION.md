---
phase: 02-live-market-terminal
verified: 2026-10-08T16:30:00Z
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
  - "backend/app/db.py"
  - "backend/app/main.py"
  - "backend/app/market/cache.py"
  - "backend/app/market/massive_client.py"
  - "backend/app/market/simulator.py"
  - "backend/app/market/stream.py"
  - "backend/tests/market/test_cache.py"
  - "backend/tests/market/test_massive.py"
  - "frontend/src/components/Header.tsx"
  - "frontend/src/components/Sparkline.test.tsx"
  - "frontend/src/components/Sparkline.tsx"
  - "frontend/src/components/WatchlistPanel.tsx"
  - "frontend/src/lib/store.ts"
  - "frontend/src/lib/useMarketStream.ts"
  - "test/motion.spec.ts"
  - "test/playwright.config.ts"
covered_digest: "v3:sha256:62f38f37fbd0526777bd35923b38aab62ff2bc1d460e55c5fbe30c6cc171d4fb"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 4/5
  gaps_closed:
    - "Truth 4 Massive half: real MASSIVE_API_KEY run passed by the user (UAT test 1)"
    - "Real backend kill and restart reconnect: verified via Playwright MCP against a real uvicorn (UAT test 2)"
    - "Visual density and motion: passed by the user (UAT test 3)"
  gaps_remaining: []
  regressions: []
advisory: []
---

# Phase 2: Live Market Terminal Verification Report

**Phase Goal:** A user opens FinAlly and watches the 10 default tickers stream live in a dark terminal, with $10,000 cash shown and a live connection indicator
**Verified:** 2026-10-08
**Status:** passed
**Re-verification:** Yes. The prior report was stale after the code-review fix commits (WR-01, WR-02, WR-03, WR-04, WR-06, and now WR-07 in `dfe4268`; WR-05 was added then reverted). All items from the prior `human_verification` list are now closed by `02-UAT.md` (3 of 3 passed).

## Goal Achievement

The goal is achieved. Refreshed after `dfe4268` (WR-07), which changed only `massive_client.py` and `test_massive.py` (`git diff --stat 98ae1c7 HEAD -- backend frontend test` lists exactly those two files, 24 insertions, 1 deletion); frontend and `test/` are untouched, so their results below carry over. Before that, fix commits touched 8 files (diff against 642eef7: cache.py, massive_client.py, their two test files, Sparkline.tsx and its test, motion.spec.ts, playwright.config.ts). I read each changed source file, re-ran all three test layers, and checked that the fixes did not break any truth.

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 10 seeded tickers in a dense dark layout; ~2 updates/s; green/red flash fading ~500 ms; occasional 2-5% events | VERIFIED | Unchanged since the prior report (simulator, `db.py` seed, keyframes). `motion.spec.ts` "prices flash on ticks" and `smoke.spec.ts` "fresh start streams the seeded watchlist" pass in my re-run. UAT test 3 passed by the user at 1280x720 and 1920x1080 |
| 2 | Row shows price, change % since session start, sparkline from page load; `--` before first tick; shared formatters, tabular numerals | VERIFIED | `Sparkline.tsx` now re-seeds the series via `setData(toData(buffer))` from the capped store buffer, so chart and store agree (WR-01). The E2E "sparklines draw from the stream" test now requires at least one non-transparent pixel (WR-02), and passes. `cache.update` ignores a price that rounds to <= 0, so `change_percent` cannot divide by zero and an unpriced ticker still renders `--` (WR-06). 87 frontend tests pass |
| 3 | Fresh DB recreated and seeded; header shows $10,000.00 total and cash; green/yellow/red dot; reconnects on its own after backend restart | VERIFIED | `connection.spec.ts` "fresh start shows $10,000 and a live connection" passes. UAT test 2: a real uvicorn was killed and restarted with the same `DB_PATH`; yellow at +0.5 s, red at +5.0 s with header `opacity-60`, then green on its own with a fresh `GET /api/portfolio` observed |
| 4 | With `MASSIVE_API_KEY` the same UI is fed by the Massive poller; `SIM_SEED` makes output reproducible; non-seed ticker starts at the same derived price across restarts | VERIFIED | Simulator half unchanged and tested (derived price is sha256-based). Massive half: UAT test 1, a real key on this Windows + Avast machine, streamed the same 10 rows with no frontend change. `start()` re-raises only on "Unknown API Key" and otherwise logs and retries (WR-04), covered by a new test. WR-05 (truststore) was reverted at the user's request because the predicted TLS failure did not reproduce, and UAT test 1 confirms certifi reaches Massive here. WR-07 (free-plan retry delay after a transient startup error) is resolved by `dfe4268`: `_delay()` returns `retry_interval` (60 s) while `eod_mode` and `_eod_closes` is empty, else `eod_interval`; new test `test_a_transient_grouped_daily_error_at_start_retries_before_the_eod_interval` passes |
| 5 | Server exits promptly with browsers connected; market data unit tests pass | VERIFIED | `test_shutdown.py` is part of the 112-test backend run, which passes. Graceful-timeout flag unchanged |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/app/market/{models,cache,interface,simulator,massive_client,factory,stream,seed_prices}.py` | Market engine | VERIFIED | `cache.py` read in full: version counter, session-start price, thread lock, zero-price guard. `massive_client.py` read in full |
| `backend/app/db.py`, `watchlist.py`, `portfolio.py`, `main.py` | Schema, seed, GET endpoints, lifespan | VERIFIED | Unchanged since the prior report; backend tests cover them |
| `frontend/src/lib/{store,useMarketStream,format,totals,api}.ts` | Store, single EventSource, formatters | VERIFIED | 87 tests pass across 8 files |
| `frontend/src/components/{Header,ConnectionDot,WatchlistPanel,WatchlistRow,PriceCell,Sparkline,Footer}.tsx` | Terminal UI | VERIFIED | `Sparkline.tsx` read in full; the buffer effect updates the same series ref that the mount effect creates |
| `test/{smoke,connection,motion}.spec.ts`, `playwright.config.ts` | E2E | VERIFIED | 6 of 6 pass in my re-run; `webServer.env` pins `MASSIVE_API_KEY` and `LLM_MOCK` (WR-03) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `main.py` lifespan | `init_db`, then source `start`, then `stop` on exit | startup order | WIRED | Unchanged |
| `PriceCache.version` | SSE frames | `price_frames` | WIRED | `cache.update` still bumps the version on every accepted write; the rejected-zero path correctly does not |
| `useMarketStream` | `store.receiveFrame` / `setStatus` | `EventSource("/api/stream/prices")` | WIRED | Real reconnect proven in UAT test 2 |
| `store.spark[ticker]` | `Sparkline` chart | `setData(toData(buffer))` | WIRED | Pixel-level E2E assertion passes |
| `create_app` | Massive or simulator | `create_market_data_source` | WIRED | Unchanged |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `WatchlistRow` price | `live.price` | SSE frame from `PriceCache` | Yes | FLOWING |
| `Header` total/cash | `portfolio.cash` | SQLite `users_profile` via `build_portfolio` | Yes | FLOWING (positions empty until Phase 3, by design) |
| `Sparkline` | `spark[ticker]` | `applyFrame` per SSE frame | Yes | FLOWING (E2E requires drawn pixels) |
| `ConnectionDot` | `status` | EventSource events and timers | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend suite | `UV_SYSTEM_CERTS=1 uv run python -m pytest -q` (backend/) | 112 passed in 8.44 s | PASS |
| Frontend suite | `npm --prefix frontend test` | 87 passed, 8 files | PASS |
| E2E | `npm --prefix test run smoke` | 6 passed (real uvicorn started and stopped by Playwright; no listener left on :8000) | PASS |

### Probe Execution

Step 7c: SKIPPED. No `probe-*.sh` scripts exist or are declared by the phase plans.

### Requirements Coverage

The union of `requirements:` across the seven PLAN files is exactly the 21 IDs in the ROADMAP Phase 2 entry: 02-01 (MKT-01, 06, 07, 09, 10, TEST-01), 02-02 (DB-01, 02, 03, WL-01, PORT-01), 02-03 (MKT-01, 02, 03, 04, 06, TEST-01), 02-04 (MKT-05, 06, TEST-01), 02-05 (UI-01, 03, 04, 08, WL-01), 02-06 (UI-01, 02, 03, 08, PORT-01), 02-07 (UI-01, 04, 05, 08, MKT-10). All are `[x]` / Complete in REQUIREMENTS.md. No orphans: the only Phase 2-adjacent requirement not claimed here, MKT-08, is mapped to Phase 3 in REQUIREMENTS.md.

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MKT-01 | 02-01, 02-03 | Correlated GBM, 500 ms ticks, seed prices | SATISFIED | `simulator.py`, simulator tests |
| MKT-02 | 02-03 | 2-5% events | SATISFIED | `_event_shocks` and its test |
| MKT-03 | 02-03 | Deterministic derived price for non-seed tickers | SATISFIED | `derived_price`, process-independence test |
| MKT-04 | 02-03 | `SIM_SEED`, `SIM_EVENT_PROBABILITY` | SATISFIED | `config.py` into the simulator |
| MKT-05 | 02-04 | Massive REST poller, paid and free paths | SATISFIED | `massive_client.py`, `test_massive.py`, real-key UAT test 1; WR-07 free-plan transient retry fixed in `dfe4268` |
| MKT-06 | 02-01, 02-03, 02-04 | One interface, factory | SATISFIED | `interface.py`, `factory.py`, `test_factory.py` |
| MKT-07 | 02-01 | Cache with version and session-start price | SATISFIED | `cache.py` read in full, `test_cache.py` |
| MKT-09 | 02-01 | SSE frames, dict of all tickers | SATISFIED | `stream.py`, tests, E2E |
| MKT-10 | 02-01, 02-07 | Clean start/stop, no hang | SATISFIED | `test_shutdown.py` in the passing suite |
| DB-01 | 02-02 | Lazy idempotent SQLite | SATISFIED | `init_db`, `test_db.py` |
| DB-02 | 02-02 | Natural PKs, UUID ids, `user_id` | SATISFIED | schema test |
| DB-03 | 02-02 | Seed $10,000, 10 tickers, snapshot | SATISFIED | `init_db`, E2E asserts `$10,000.00` |
| WL-01 | 02-02, 02-05 | `GET /api/watchlist` | SATISFIED | `watchlist.py`, smoke E2E shows 10 rows |
| PORT-01 | 02-02, 02-06 | `GET /api/portfolio` | SATISFIED | `portfolio.py`, header E2E |
| UI-01 | 02-05, 02-06, 02-07 | Dark theme, dense layout | SATISFIED | E2E body color; density passed by the user (UAT 3) |
| UI-02 | 02-06 | Header total, cash, dot | SATISFIED | `Header.tsx`, `ConnectionDot.tsx`, E2E |
| UI-03 | 02-05, 02-06 | Single EventSource, reconnect | SATISFIED | 15 fake-timer tests plus real restart (UAT 2) |
| UI-04 | 02-05, 02-07 | Price, change %, sparkline | SATISFIED | `WatchlistRow`, `Sparkline`, pixel E2E |
| UI-05 | 02-07 | Flash green/red, ~500 ms | SATISFIED | `PriceCell`, keyframes, E2E, UAT 3 |
| UI-08 | 02-05, 02-06, 02-07 | `--` placeholders, shared formatters | SATISFIED | `format.ts`, tests |
| TEST-01 | 02-01, 02-03, 02-04 | Market data unit tests | SATISFIED | 112 backend tests green |

### Anti-Patterns Found

No `TBD`, `FIXME`, `XXX`, `TODO` or `HACK` marker in `backend/app`, `frontend/src` or `test/*.ts`. No stubs or hollow props.

Review disposition (`02-REVIEW-DISPOSITION.md`): 15 findings, 8 open (all info), 6 fixed (WR-01..WR-04, WR-06, WR-07), 1 skipped (WR-05, reverted at user request). Security: `02-SECURITY.md` threats_open 0. UI review: 23/24.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/app/market/massive_client.py` | 93-106 | WR-07 (resolved in `dfe4268`) | Resolved | `_delay()` retries in 60 s while EOD mode has no closes; at most `MAX_EOD_LOOKBACK` (5) Grouped Daily calls per attempt, so the free-plan 5 calls/minute limit is respected |
| `backend/app/market/massive_client.py` | 61 | IN-08: bad-key detection by message text | Info | If Massive rewords the error, a rejected key logs tracebacks instead of failing fast |
| `backend/app/market/massive_client.py` | 84-86, 128-136 | IN-03, IN-04 | Info | Latent for Phase 3 (held-ticker eviction) and free-plan call budget |
| Header, WatchlistPanel | - | IN-01, IN-02, IN-05 | Info | Stale-response race, silent portfolio error, stale REST price; Phase 3 hardening |
| `test/playwright.config.ts`, `Sparkline.tsx` | - | IN-06, IN-07 | Info | Temp DB files not cleaned up; timing test could flake under load |

### Human Verification Required

None. The three items from the prior report were executed and recorded as passed in `02-UAT.md`: real Massive key run (user), real backend kill and restart reconnect (Playwright MCP against a real uvicorn, with timings), and 30 s visual watch at two resolutions (user).

### Gaps Summary

No gaps. All five roadmap success criteria hold in the current code and all 21 requirement IDs are accounted for. The one previously open warning, WR-07 (free-plan Massive retry delay after a transient startup error), is fixed in `dfe4268` with a regression test; there are no open warnings and no advisories. The remaining 8 review findings are info-level Phase 3 housekeeping.

Housekeeping: ROADMAP.md marks Phase 2 complete (2026-10-08, commit af71d08).

---

_Verified: 2026-10-08_
_Verifier: Claude (gsd-verifier)_
