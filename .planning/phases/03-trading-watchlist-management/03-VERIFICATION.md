---
phase: 03-trading-watchlist-management
verified: 2026-10-09T02:30:00Z
status: passed
score: 5/5 must-haves verified
covered_files:
  - .planning/phases/03-trading-watchlist-management/03-01-PLAN.md
  - .planning/phases/03-trading-watchlist-management/03-01-SUMMARY.md
  - .planning/phases/03-trading-watchlist-management/03-02-PLAN.md
  - .planning/phases/03-trading-watchlist-management/03-02-SUMMARY.md
  - .planning/phases/03-trading-watchlist-management/03-03-PLAN.md
  - .planning/phases/03-trading-watchlist-management/03-03-SUMMARY.md
  - .planning/phases/03-trading-watchlist-management/03-04-PLAN.md
  - .planning/phases/03-trading-watchlist-management/03-04-SUMMARY.md
  - .planning/phases/03-trading-watchlist-management/03-05-PLAN.md
  - .planning/phases/03-trading-watchlist-management/03-05-SUMMARY.md
  - backend/app/db.py
  - backend/app/errors.py
  - backend/app/main.py
  - backend/app/portfolio.py
  - backend/app/tracking.py
  - backend/app/trading.py
  - backend/app/watchlist.py
  - backend/tests/test_trading.py
  - frontend/src/components/Header.tsx
  - frontend/src/components/PositionRow.tsx
  - frontend/src/components/PositionsTable.tsx
  - frontend/src/components/TradeBar.tsx
  - frontend/src/components/WatchlistPanel.test.tsx
  - frontend/src/components/WatchlistPanel.tsx
  - frontend/src/components/WatchlistRow.tsx
  - frontend/src/lib/api.ts
  - frontend/src/lib/portfolioStore.ts
  - frontend/src/lib/totals.ts
  - planning/API_CONTRACT.md
  - test/trade.spec.ts
  - test/watchlist.spec.ts
covered_digest: "v3:sha256:d2a32cc35aabcb1c6ba3c9ecdf39ccb1ae3b8bc91aa6a51af12f96f441e93f6e"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 5/5
  gaps_closed:
    - "Human item: positions live cells dim while disconnected (03-UAT.md test 1: pass)"
    - "Human item: layout fit at 1920x1080, 1280x800, 768x1024, 480px (03-UAT.md test 2: pass)"
    - "Review warnings WR-01..WR-07 fixed (03-REVIEW-DISPOSITION.md: all fixed)"
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "IN-01: a rejected buy with bad quantity still calls source.add_ticker before validating quantity (spends a Massive call on the free tier)"
    category: other
    reason: "Info-level, open in 03-REVIEW-DISPOSITION.md; cleaned up by sync_ticker in finally, no state leak"
    evidence_status: "none provided"
  - finding: "IN-06: cancelling the request while the worker thread commits could let the final sync_ticker run before the commit, leaving a buy untracked"
    category: other
    reason: "Reviewer did not prove it; Starlette does not normally cancel non-streaming handlers. Fix would be asyncio.shield on the worker call"
    evidence_status: "none provided"
  - finding: "IN-04: WatchlistPanel retry effect depends only on [status]"
    category: other
    reason: "Info-level lint-style issue; manual Retry button works"
    evidence_status: "none provided"
---

# Phase 3: Trading and Watchlist Management Verification Report

**Phase Goal:** A user can buy and sell shares and curate their watchlist, and every position stays priced and every change shows immediately
**Verified:** 2026-10-09
**Status:** passed
**Re-verification:** Yes - regenerates a stale report (was `human_needed`) after seven review fixes (WR-01..WR-07, including the new "Order value is too small" rejection) and the human UAT

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Buy with fractional qty: cash drops by qty x price, position appears with live qty/avg/price/P&L/%, header tracks it, each fill logged and followed by a snapshot | VERIFIED | `backend/app/trading.py:execute_trade` does the cash update, position upsert, `trades` INSERT, `build_portfolio` and `portfolio_snapshots` INSERT inside one `with transaction(conn)` (BEGIN IMMEDIATE, rollback on any exception, `db.py:75`). Tests `test_buy_fills_at_cached_price`, `test_buys_merge_into_weighted_average`, `test_fractional_quantities_fill`, `test_unrealized_pnl_after_a_price_move`. Frontend: `TradeBar.submit` -> `postTrade` -> `usePortfolioStore.applyTrade(portfolio)`; `totals.liveTotals` now falls back to `p.current_price` (WR-02 fix, covered by `totals.test.ts`); `PositionRow` reads SSE price per ticker. |
| 2 | Selling raises cash; selling the full quantity deletes the row, no residue | VERIFIED | `execute_trade` rounds to 6 dp and `DELETE FROM positions` when `new_qty == 0`. Tests `test_partial_sell_keeps_avg_cost_and_full_sell_deletes_row`, `test_float_residue_leaves_no_position`, `test_selling_at_a_loss_credits_the_lower_price`, and the WR-06 case `test_dust_position_can_be_closed_after_the_price_falls`. |
| 3 | Invalid trades show inline error, return 400 `{"error"}`, change nothing; Buy/Sell disabled in flight; success inline | VERIFIED | Rejections raise `DomainError` (400 handler in `errors.py`): qty <= 0, NaN/inf (Pydantic strict), no price, insufficient shares, insufficient cash, and the new "Order value is too small" (sub-cent; whole-position sell exempt, `trading.py:53-56`, documented in `planning/API_CONTRACT.md` check 5). `test_rejections_change_nothing` (parametrized, incl. too-small), `test_sub_cent_sell_is_rejected`, `test_failure_inside_the_fill_rolls_everything_back`, route envelope tests. `TradeBar.tsx`: `disabled={pending}` on both buttons, `FormMessage` renders the server error and "Bought/Sold ... at ..." line. |
| 4 | Add a ticker and it streams; malformed/unknown rejected inline "Unknown ticker"; remove drops it; delete unknown is 404 | VERIFIED | `watchlist.add_to_watchlist` (normalize, `source.add_ticker`, price check -> `DomainError("Unknown ticker")`, insert) and `remove_from_watchlist` (`NotFoundError` -> 404), both under `state.tracking_lock`. Tests: malformed parametrized set, `test_unpriced_ticker_is_rejected_and_not_left_tracked`, `test_delete_of_an_unknown_ticker_is_404`, concurrency tests. `WatchlistPanel` add form / per-row remove replace the list from the response; failed remove now refreshes while still busy (WR-05/WR-07). E2E `watchlist.spec.ts` covers add-streams and malformed-rejected-inline. |
| 5 | Removing a held ticker keeps it priced and streaming; buying an unwatched ticker streams it before priced; portfolio unit tests pass | VERIFIED | `tracking.sync_ticker` = watchlist U positions, called in `finally` of `place_trade`, `add_to_watchlist`, `remove_from_watchlist`, all serialized by `tracking_lock` (created in `main.py:29`; WR-03 fix). Tests `test_removing_a_held_ticker_keeps_it_streaming_and_priced`, `test_buying_an_unwatched_ticker_streams_it_priced`, `test_selling_the_last_share_of_an_unwatched_ticker_stops_streaming`, `test_rejected_buy_does_not_evict_a_ticker_being_added`. E2E: "removing a held ticker keeps its position streaming", "buying an unwatched ticker adds a streaming position row". TEST-02 suite in `tests/test_trading.py` covers execution, P&L after move, oversell, insufficient cash, selling at a loss. |

**Score:** 5/5 truths verified (0 present, behavior-unverified). Behavior-dependent truths (atomic rollback, concurrent buys single winner, serialized tracking, stale-GET ticket guard, held-ticker streaming) each have a passing behavioral test, not only symbol presence. I re-ran seven of them by name this session: 7 passed.

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `backend/app/trading.py` | VERIFIED | Real fill logic; router included in `main.py:47` |
| `backend/app/tracking.py` | VERIFIED | `normalize_ticker`, `is_wanted`, `sync_ticker`; used by trading and watchlist |
| `backend/app/watchlist.py` | VERIFIED | GET/POST/DELETE with `NotFoundError` on unknown delete |
| `backend/app/errors.py`, `db.transaction` | VERIFIED | 400/404 envelopes; rollback on any exception |
| `frontend/src/components/TradeBar.tsx` | VERIFIED | Wired to `postTrade` and the portfolio store |
| `frontend/src/components/PositionsTable.tsx`, `PositionRow.tsx` | VERIFIED | Live SSE price; `opacity-60` when status is disconnected |
| `frontend/src/components/WatchlistPanel.tsx`, `WatchlistRow.tsx` | VERIFIED | Add form, per-row remove, response list replaces table, `onFail` refresh awaited before busy clears |
| `frontend/src/lib/portfolioStore.ts`, `totals.ts` | VERIFIED | Ticketed stale-response guard; `liveTotals` falls back to `current_price` |
| `test/trade.spec.ts`, `test/watchlist.spec.ts` | VERIFIED | Real scenarios; executed this session |

### Key Link Verification

| From | To | Status |
|------|----|--------|
| `main.py` -> `trading.router`, `watchlist.router` | `include_router` (lines 45, 47) | WIRED |
| `execute_trade` -> `db.transaction` | `with transaction(conn)` | WIRED |
| `execute_trade` -> `build_portfolio` | same connection feeds snapshot and response | WIRED |
| `place_trade` / `add_to_watchlist` / `remove_from_watchlist` -> `tracking.sync_ticker` | `finally` / after delete, under `tracking_lock` | WIRED |
| `TradeBar` -> `portfolioStore.applyTrade` -> `Header`, `PositionsTable` | store subscription | WIRED |
| `WatchlistPanel` -> `addTicker`/`removeTicker` -> `/api/watchlist` | `mutate()` | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| Header total/cash | `portfolio` + `prices` | `GET /api/portfolio`, trade response, SSE store | Yes (SQLite + price cache) | FLOWING |
| PositionRow | `position`, `live` | portfolio store, SSE store | Yes | FLOWING |
| WatchlistPanel rows | `view.items` | `GET/POST/DELETE /api/watchlist` response | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend suite | `uv run python -m pytest -q` (backend/) | 185 passed | PASS |
| Frontend suite | `npx vitest run` (frontend/) | 13 files, 162 passed | PASS |
| Type check | `npx tsc --noEmit` (frontend/) | exit 0, no output | PASS |
| Invariant tests by name (rollback, dust close, sub-cent sell, concurrent buys, held-ticker streaming, unwatched buy, no eviction) | `pytest -q <7 node ids>` | 7 passed | PASS |
| Static export build | `npm run build` (frontend/) | success, `/` prerendered | PASS |
| Playwright E2E (all specs, fresh build, local backend on :8000, `LLM_MOCK=true`, `SIM_SEED=1`) | `npx playwright test` (test/) | 12 passed (16.5s), incl. trade.spec.ts x3 and watchlist.spec.ts x3 | PASS |

### Probe Execution

No probes declared by the phase. SKIPPED.

### Requirements Coverage

Plan frontmatter `requirements:` unions to the 12 IDs in the ROADMAP phase block; all appear in REQUIREMENTS.md as `[x]` and "Phase 3 / Complete" in the traceability table. No orphans (PUI-06 and PORT-07 belong to Phases 5 and 4).

| Requirement | Source Plan | Status | Evidence |
|-------------|-------------|--------|----------|
| MKT-08 | 03-01, 03-02, 03-04 | SATISFIED | `tracking.sync_ticker`; `test_tracking.py`; E2E held/unwatched |
| WL-02 | 03-02 | SATISFIED | `add_to_watchlist`; `test_watchlist.py`; `watchlist.spec.ts` |
| WL-03 | 03-02 | SATISFIED | `remove_from_watchlist`, 404 on unknown, held ticker keeps streaming |
| PORT-02 | 03-01 | SATISFIED | buy fill, weighted avg, fractional |
| PORT-03 | 03-01 | SATISFIED | sell; row deleted at 0; float residue handled |
| PORT-04 | 03-01 | SATISFIED | 400 envelopes, nothing changes (now incl. "Order value is too small", whole-position sell exempt) |
| PORT-05 | 03-01 | SATISFIED | one transaction: trade + position + cash + snapshot |
| PORT-06 | 03-01 | SATISFIED | response `{trade, portfolio}`, portfolio shape equals GET /api/portfolio |
| UI-06 | 03-05 | SATISFIED | add form + per-row remove |
| PUI-01 | 03-03 | SATISFIED | TradeBar, disabled in flight, inline messages |
| PUI-02 | 03-04 | SATISFIED | PositionsTable/PositionRow, live |
| TEST-02 | 03-01 | SATISFIED | `tests/test_trading.py` |

### Anti-Patterns Found

None blocking. Grep for TBD/FIXME/XXX/TODO/HACK over `backend/app`, `frontend/src`, `test/*.ts` and `planning/API_CONTRACT.md` returned no matches. No stub handlers; all routes perform real queries and writes.

The new "Order value is too small" rule was checked against the success criteria: it adds a rejection class beyond SC3's list but does not contradict it (400 `{"error"}`, nothing changes), and it is documented in the API contract. The WR-06 exemption (`closes_position = side == "sell" and quantity == held`) is sound: both operands are 6 dp rounded values that round-trip exactly through SQLite REAL, and only a full close can pay $0.00.

Review disposition (`03-REVIEW-DISPOSITION.md`): WR-01..WR-07 fixed; IN-01, IN-02, IN-03, IN-04, IN-05, IN-06 open (info). None blocks the goal; recorded as advisory above.

### Human Verification Required

None outstanding. Both items from the earlier report were performed in `03-UAT.md` (status complete, 2 passed, 0 issues): positions cells dim on disconnect, and layout fit at 1920x1080, 1280x800, 768x1024 and 480px.

### Gaps Summary

No gaps. Every ROADMAP success criterion is backed by implementation, wiring, live data flow and a passing behavioral test; all 12 requirement IDs are accounted for; the human checks passed in UAT; the full backend (185), frontend (162) and E2E (12) suites pass in this session on the current tree.

---

_Verified: 2026-10-09_
_Verifier: Claude (gsd-verifier)_
