---
phase: 03-trading-watchlist-management
verified: 2026-10-09T00:50:00Z
status: human_needed
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
  - frontend/src/components/Header.tsx
  - frontend/src/components/PositionRow.tsx
  - frontend/src/components/PositionsTable.tsx
  - frontend/src/components/TradeBar.tsx
  - frontend/src/components/WatchlistPanel.tsx
  - frontend/src/components/WatchlistRow.tsx
  - frontend/src/lib/api.ts
  - frontend/src/lib/portfolioStore.ts
  - frontend/src/lib/totals.ts
  - planning/API_CONTRACT.md
  - test/trade.spec.ts
  - test/watchlist.spec.ts
covered_digest: "v3:sha256:718c55bc65bc9bbcd97fa5d4480c4f31c4c7766341bfc19d81a00d3803fadb7e"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Stop the backend while the page is open (positions table showing at least one position) and watch the positions table"
    expected: "The Price, P&L and P&L % cells of every position row dim (opacity-60) while the connection dot is red/disconnected, and return to full brightness after reconnect"
    why_human: "Visual state on a live disconnect; unit tests assert the class but not the rendered look, and the executors did not perform this check (03-04-SUMMARY)"
  - test: "Open the app at 1920x1080, 1280x800, 768x1024 and 480px wide"
    expected: "The document does not scroll at desktop widths (only the watchlist and positions panels scroll internally), the trade bar and add-ticker form stay usable, and no horizontal overflow or clipped controls appear at 768 and 480"
    why_human: "Layout fit and responsive behavior cannot be judged from grep or jsdom"
advisory_warnings:
  - id: WR-01
    note: "Sub-cent fills (price x quantity < 0.005) move $0.00 of cash but still add shares; value leaked per order is under half a cent"
  - id: WR-02
    note: "liveTotals falls back to avg_cost instead of the server's current_price for a held ticker with no streamed price yet; header total is momentarily wrong"
  - id: WR-03
    note: "sync_ticker is check-then-act with no lock; only reachable with overlapping requests (two tabs, Phase 5 chat)"
  - id: WR-04
    note: "Empty-body / invalid-JSON validation errors give a malformed message (': Field required')"
  - id: WR-05
    note: "A failed remove (e.g. 404 after removal from another tab) leaves the row until reload"
---

# Phase 3: Trading and Watchlist Management Verification Report

**Phase Goal:** A user can buy and sell shares and curate their watchlist, and every position stays priced and every change shows immediately
**Verified:** 2026-10-09
**Status:** human_needed
**Re-verification:** No - initial verification (a prior attempt was cut off before writing anything)

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Buy with fractional qty: cash drops by qty x price, position appears with live qty/avg/price/P&L/%, header tracks it, each fill logged and followed by a snapshot | VERIFIED | `backend/app/trading.py:execute_trade` does the fill, trades INSERT and `portfolio_snapshots` INSERT inside one `transaction(conn)` (BEGIN IMMEDIATE). Live probe against the real simulator: buy 2.5 IBM at 197.68 gave 200, cash 9505.8 (10000 - 494.20), trade row returned. Frontend: `TradeBar` -> `postTrade` -> `usePortfolioStore.applyTrade(portfolio)`; `Header` reads the store via `liveTotals`; `PositionRow` subscribes to the SSE price per ticker. 178 backend tests, 160 frontend tests, E2E `trade.spec.ts` pass. |
| 2 | Selling raises cash; selling the full quantity deletes the row with no residue | VERIFIED | `execute_trade` rounds to 6 dp and `DELETE FROM positions` when `new_qty == 0`. Live probe: sell 2.5 IBM left `positions == []`. Tests `test_partial_sell_keeps_avg_cost_and_full_sell_deletes_row`, `test_float_residue_leaves_no_position`, `test_selling_at_a_loss_credits_the_lower_price`. |
| 3 | Invalid trades show an inline error, return 400 `{"error"}`, change nothing; Buy/Sell disabled in flight; success inline | VERIFIED | Live probe: qty 0 -> `Quantity must be greater than 0`; 100000 AAPL -> `Insufficient cash`; sell unheld -> `Insufficient shares: you hold 0 AAPL`. `test_rejections_change_nothing` asserts cash, positions, trades and snapshots unchanged; `test_failure_inside_the_fill_rolls_everything_back` covers rollback. `TradeBar.tsx`: `disabled={pending}` on both buttons, `FormMessage` shows server `{error}` text and the "Bought ... at ..." success line. Bad input is also caught client-side before any request. |
| 4 | Add a ticker and it streams; malformed/unknown rejected with inline "Unknown ticker"; remove drops it; delete unknown is 404 | VERIFIED | `watchlist.py:add_to_watchlist` (normalize, `source.add_ticker`, price check, `Unknown ticker`, insert). Live probe: add IBM 200; delete IBM 200 then 404. Tests: malformed tickers rejected, unpriced rejected and untracked, delete unknown 404. `WatchlistPanel` add form and per-row remove replace the list from the response; `watchlist.spec.ts` covers add-streams and malformed-rejected-inline. |
| 5 | Removing a held ticker keeps it priced and streaming; buying an unwatched ticker starts streaming it before it is priced; portfolio unit tests pass | VERIFIED | `tracking.sync_ticker` implements watchlist U positions; `place_trade` pre-adds on buy and syncs in `finally`. Tests `test_removing_a_held_ticker_keeps_it_streaming_and_priced`, `test_buying_an_unwatched_ticker_streams_it_priced`, `test_selling_the_last_share_of_an_unwatched_ticker_stops_streaming`. E2E `watchlist.spec.ts` "removing a held ticker keeps its position streaming" and `trade.spec.ts` "unwatched ticker adds a streaming position row". TEST-02 suite `tests/test_trading.py` (execution, P&L after move, oversell, insufficient cash, loss) passes. |

**Score:** 5/5 truths verified (0 present, behavior-unverified). Behavior-dependent truths (atomic rollback, concurrent-buy single winner, stale-GET guard, held-ticker streaming) each have a passing behavioral test, not just symbol presence.

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `backend/app/trading.py` | VERIFIED | 118 lines, real fill logic, router included in `main.py` above the `/api` catch-all |
| `backend/app/tracking.py` | VERIFIED | `normalize_ticker`, `is_wanted`, `sync_ticker`; used by trading and watchlist |
| `backend/app/watchlist.py` | VERIFIED | GET/POST/DELETE wired, `NotFoundError` for unknown delete |
| `backend/app/errors.py`, `db.transaction` | VERIFIED | `DomainError` 400, `NotFoundError` 404, handler registered; rollback on any exception |
| `frontend/src/components/TradeBar.tsx` | VERIFIED | Wired to `postTrade` and the portfolio store |
| `frontend/src/components/PositionsTable.tsx` / `PositionRow.tsx` | VERIFIED | Loading, error, empty and data states; live price from SSE store |
| `frontend/src/components/WatchlistPanel.tsx` / `WatchlistRow.tsx` | VERIFIED | Add form, per-row remove, response list replaces table |
| `frontend/src/lib/portfolioStore.ts` | VERIFIED | Ticketed stale-response guard; `applyTrade` feeds Header and table |
| `test/trade.spec.ts`, `test/watchlist.spec.ts` | VERIFIED | Real E2E scenarios (smoke 12/12 per orchestrator) |

### Key Link Verification

| From | To | Status |
|------|----|--------|
| `main.py` -> `trading.router` | `include_router(trading.router)` above catch-all | WIRED |
| `trading.execute_trade` -> `db.transaction` | `with transaction(conn)` | WIRED |
| `trading.execute_trade` -> `build_portfolio` | same connection feeds snapshot and response | WIRED |
| `trading.place_trade` -> `tracking.sync_ticker` | `finally: await sync_ticker` | WIRED |
| `watchlist.add/remove` -> `tracking.sync_ticker` | `finally` / after delete | WIRED |
| `TradeBar` -> `portfolioStore.applyTrade` -> `Header`, `PositionsTable` | store subscription | WIRED |
| `WatchlistPanel` -> `addTicker`/`removeTicker` -> `/api/watchlist` | `send()` | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| Header total/cash | `portfolio` + `prices` | `GET /api/portfolio`, trade response, SSE store | Yes (SQLite + price cache) | FLOWING |
| PositionRow | `position`, `live` | portfolio store, SSE store | Yes | FLOWING |
| WatchlistPanel rows | `view.items` | `GET/POST/DELETE /api/watchlist` response | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend suite | `uv run python -m pytest -q` (backend/) | 178 passed | PASS |
| Frontend suite | `npm test` (frontend/) | 160 passed, 13 files | PASS |
| Live trade/watchlist flow on real simulator | TestClient probe (buy unwatched IBM, add, delete x2, remove AAPL, sell all, zero qty, oversize buy, unheld sell) | All statuses and messages as specified | PASS |
| Build and E2E smoke | not re-run; orchestrator evidence: build OK, `npm --prefix test run smoke` 12/12 | accepted as given | PASS (reported) |

### Probe Execution

No probes declared by the phase. SKIPPED.

### Requirements Coverage

All 12 phase requirement IDs appear in plan frontmatter and in REQUIREMENTS.md (marked Complete, traceability table Phase 3). No orphaned requirements (PUI-06 is mapped to Phase 5, not this phase).

| Requirement | Source Plan | Status | Evidence |
|-------------|-------------|--------|----------|
| MKT-08 | 03-01, 03-02, 03-04 | SATISFIED | `tracking.sync_ticker`; test_tracking.py; E2E held/unwatched |
| WL-02 | 03-02 | SATISFIED | `add_to_watchlist`, test_watchlist.py, watchlist.spec.ts |
| WL-03 | 03-02 | SATISFIED | `remove_from_watchlist`, 404 on unknown, held ticker keeps streaming |
| PORT-02 | 03-01 | SATISFIED | buy fill, weighted avg, fractional |
| PORT-03 | 03-01 | SATISFIED | sell, row deleted at 0 |
| PORT-04 | 03-01 | SATISFIED | 400 envelopes, nothing changes |
| PORT-05 | 03-01 | SATISFIED | one transaction: trade + position + cash + snapshot |
| PORT-06 | 03-01 | SATISFIED | response `{trade, portfolio}` equals GET /api/portfolio shape |
| UI-06 | 03-05 | SATISFIED | add form + per-row remove |
| PUI-01 | 03-03 | SATISFIED | TradeBar, disabled in flight, inline messages |
| PUI-02 | 03-04 | SATISFIED | PositionsTable/PositionRow, live |
| TEST-02 | 03-01 | SATISFIED | tests/test_trading.py (execution, P&L, oversell, insufficient cash, loss) |

### Anti-Patterns Found

No TBD/FIXME/XXX/TODO/HACK markers in phase source (grep over `backend/app`, `frontend/src`, `test/*.ts`, `planning/API_CONTRACT.md`). No stubs: all handlers perform real queries and writes.

Code review (`03-REVIEW.md`: 0 critical, 5 warnings, 5 info, all `open`) was weighed. None is goal-blocking:

| ID | Severity | Assessment |
|----|----------|------------|
| WR-01 sub-cent free fills | Warning | Real (confirmed from code: `amount = round(price*quantity, 2)` while quantity is unrounded to cash). Leak is under half a cent per request and needs scripted repetition; SC1 "cash drops by quantity x price" holds to the cent. Recommend a minimum-order-value rejection before Phase 5 lets an LLM auto-trade. Not a blocker. |
| WR-02 header avg_cost fallback | Warning | Real (`totals.ts` uses `p.avg_cost`; `PositionRow` correctly uses `current_price`). Only affects the interval before the first SSE frame; the header then tracks live prices as SC1 requires. One-line fix: fall back to `p.current_price`. |
| WR-03 tracking race | Warning | Narrow: needs overlapping requests; UI locks controls in flight. Fix with one asyncio.Lock. |
| WR-04 malformed message | Warning | Cosmetic for non-browser callers; UI always sends a body. |
| WR-05 stale row after failed remove | Warning | Edge (multi-tab); SC4 normal path works. |
| IN-01..05 | Info | Advisory only. |

### Human Verification Required

#### 1. Positions live cells dim on disconnect

**Test:** With a position open, stop the backend and watch the positions table.
**Expected:** Price, P&L and P&L % cells dim while disconnected and recover on reconnect.
**Why human:** Visual state on a live disconnect; flagged by executors as not performed.

#### 2. Layout fit and no document scroll

**Test:** Load the app at 1920x1080, 1280x800, 768x1024 and 480px.
**Expected:** No document-level scroll at desktop widths, no clipped trade bar or add form, no horizontal overflow at tablet/phone widths.
**Why human:** Responsive layout cannot be verified by grep or jsdom.

### Gaps Summary

No gaps. Every ROADMAP success criterion is backed by implementation, wiring, live data flow and a passing behavioral test; all 12 requirement IDs are accounted for. Status is `human_needed` solely because two visual checks the executors flagged as human-only remain unperformed. The five review warnings are advisory; WR-01 and WR-02 are worth a small fix-up (or deferral note) before Phase 5.

---

_Verified: 2026-10-09_
_Verifier: Claude (gsd-verifier)_
