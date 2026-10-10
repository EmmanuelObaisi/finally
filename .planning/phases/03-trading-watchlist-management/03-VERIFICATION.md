---
phase: 03-trading-watchlist-management
verified: 2026-10-10T12:00:00Z
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
  - backend/tests/test_tracking.py
  - backend/tests/test_trading.py
  - backend/tests/test_watchlist.py
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
covered_digest: "v3:sha256:9ded632f317296aed04ea9ac7312410bbfdf32807c18257cf95df79c40a9883f"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 5/5
  gaps_closed: []
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "SC4 / ROADMAP wording says a malformed or unknown ticker shows an 'Unknown ticker' error; the code returns 'Invalid ticker: <raw>' for malformed input and 'Unknown ticker' only for well-formed unpriced symbols"
    category: other
    reason: "Documented split in planning/API_CONTRACT.md (lines 105-107) and REQUIREMENTS WL-02 (format-checked, then 'Unknown ticker' if no price appears). Both are inline 400 rejections that leave state unchanged. Wording difference only"
    evidence_status: "test_watchlist.py:81 and :95; watchlist.spec.ts:52"
  - finding: "IN-01 (rejected buy with bad quantity calls source.add_ticker before validating), IN-06 (cancellation during worker commit could leave a buy untracked), IN-04 (WatchlistPanel retry effect depends only on [status])"
    category: other
    reason: "Info-level, carried from 03-REVIEW-DISPOSITION.md; no state leak found (sync_ticker in finally); none contradicts a success criterion"
    evidence_status: "none provided"
---

# Phase 3: Trading and Watchlist Management Verification Report

**Phase Goal:** A user can buy and sell shares and curate their watchlist, and every position stays priced and every change shows immediately
**Verified:** 2026-10-10
**Status:** passed
**Re-verification:** Yes. Re-verification of a shipped phase against the CURRENT tree (after Phases 4-6). Later-phase edits to covered files are expected evolution; the phase goal and all 12 requirements still hold.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Buy with fractional qty: cash drops by qty x price, position appears with live qty/avg/price/P&L/%, header tracks it; each fill logged and followed by a snapshot | VERIFIED | `backend/app/trading.py:execute_trade` (read this session) does cash update, position upsert with weighted avg, `trades` INSERT, `build_portfolio`, and `portfolio_snapshots` INSERT inside one `with transaction(conn)`. Tests present and passing: `test_buy_fills_at_cached_price`, `test_buys_merge_into_weighted_average`, `test_fractional_quantities_fill`, `test_unrealized_pnl_after_a_price_move`. Frontend: `TradeBar.submit` -> `postTrade` -> `usePortfolioStore.applyTrade(portfolio)`; `PositionRow` reads the SSE price per ticker and computes live P&L via `livePosition`. |
| 2 | Selling raises cash; selling the full quantity deletes the row, no residue | VERIFIED | `execute_trade` rounds to 6 dp, `DELETE FROM positions` when `new_qty == 0`. Tests `test_partial_sell_keeps_avg_cost_and_full_sell_deletes_row`, `test_float_residue_leaves_no_position`, `test_selling_at_a_loss_credits_the_lower_price`, `test_dust_position_can_be_closed_after_the_price_falls`. |
| 3 | Invalid trades show inline error, return 400 `{"error"}`, change nothing; Buy/Sell disabled in flight; success inline | VERIFIED | `DomainError` rejections for qty <= 0, NaN/inf (strict Pydantic field), no price, insufficient shares, insufficient cash, sub-cent order (whole-position sell exempt). `test_rejections_change_nothing`, `test_failure_inside_the_fill_rolls_everything_back`, `test_sub_cent_sell_is_rejected`. `TradeBar.tsx`: both buttons `disabled={pending}`, `FormMessage` shows server error text or "Bought/Sold ... at ...". |
| 4 | Add a ticker and it streams; malformed/unknown rejected inline; remove drops it; delete unknown is 404 | VERIFIED | `watchlist.add_to_watchlist` (normalize, `source.add_ticker`, price check -> `DomainError("Unknown ticker")`, insert) and `remove_from_watchlist` (`NotFoundError` -> 404), both under `state.tracking_lock`. `WatchlistPanel` calls `addTicker`/`removeTicker` via `mutate`; per-row remove button `watchlist-remove-<T>` in `WatchlistRow`. Tests in `test_watchlist.py` (malformed set at :81, unknown at :95, 404 on unknown delete). E2E `test/watchlist.spec.ts` (add streams, malformed rejected inline). See advisory on error wording. |
| 5 | Removing a held ticker keeps it priced and streaming; buying an unwatched ticker streams it before priced; portfolio unit tests pass | VERIFIED | `tracking.sync_ticker` (watchlist UNION positions) is called in `finally` of `place_trade`, `add_to_watchlist` and after delete in `remove_from_watchlist`, all inside `tracking_lock` (created `main.py:29`). Tests in `test_tracking.py`: `test_removing_a_held_ticker_keeps_it_streaming_and_priced`, `test_buying_an_unwatched_ticker_streams_it_priced`, `test_selling_the_last_share_of_an_unwatched_ticker_stops_streaming`, `test_rejected_buy_does_not_evict_a_ticker_being_added`. E2E `watchlist.spec.ts` "removing a held ticker keeps its position streaming", `trade.spec.ts` "buying an unwatched ticker adds a streaming position row". |

**Score:** 5/5 truths verified (0 behavior-unverified). Behavior-dependent truths (atomic rollback, concurrent buys single winner, held-ticker eviction rule, tracking-lock serialization) each have a passing behavioral test, not only symbol presence.

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `backend/app/trading.py` | VERIFIED | 125 lines, real fill logic; router included in `main.py:47`; also reused by chat via `place_trade` |
| `backend/app/tracking.py` | VERIFIED | `normalize_ticker`, `is_wanted`, `sync_ticker` used by trading and watchlist |
| `backend/app/watchlist.py` | VERIFIED | GET/POST/DELETE, router included `main.py:45` |
| `backend/app/errors.py`, `db.transaction` | VERIFIED | 400/404 envelopes; rollback on exception |
| `frontend/src/components/TradeBar.tsx` | VERIFIED | Wired to `postTrade` and portfolio store |
| `PositionsTable.tsx`, `PositionRow.tsx` | VERIFIED | Live SSE price, dim on disconnect (`opacity-60`) |
| `WatchlistPanel.tsx`, `WatchlistRow.tsx` | VERIFIED | Add form, per-row remove |
| `test/trade.spec.ts`, `test/watchlist.spec.ts` | VERIFIED | 3 scenarios each, substantive; executed in Phase 6 container run |

### Key Link Verification

| From | To | Status |
|------|----|--------|
| `main.py` -> `trading.router`, `watchlist.router` | `include_router` lines 45, 47 | WIRED |
| `execute_trade` -> `db.transaction` / `build_portfolio` / snapshot INSERT | same connection | WIRED |
| `place_trade`, `add_to_watchlist`, `remove_from_watchlist` -> `sync_ticker` | `finally` / post-delete under `tracking_lock` | WIRED |
| `TradeBar` -> `portfolioStore.applyTrade` -> `Header`, `PositionsTable` | store subscription | WIRED |
| `WatchlistPanel` -> `addTicker`/`removeTicker` -> `/api/watchlist` | `mutate()` | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| Header total/cash | portfolio + prices | `GET /api/portfolio`, trade response, SSE store | Yes (SQLite + price cache) | FLOWING |
| PositionRow | `position`, `live` | portfolio store, SSE price store | Yes | FLOWING |
| WatchlistPanel rows | `view.items` | `/api/watchlist` responses | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase backend tests | `uv run python -m pytest -q tests/test_trading.py tests/test_watchlist.py tests/test_tracking.py` | 77 passed | PASS |
| Full backend suite (supplied by orchestrator, same tree) | `uv run python -m pytest -q` | 329 passed | PASS |
| Full frontend suite (supplied by orchestrator) | `npx vitest run` | 345 passed | PASS |
| Type check | `npx tsc --noEmit` (frontend/) | exit 0 | PASS |
| Container E2E incl. trade/watchlist specs | Phase 6 evidence (`06-VERIFICATION.md`: `npm --prefix test run e2e`) | passed 20, failed 0 | PASS (prior-phase evidence; no Docker run here by instruction) |

### Probe Execution

No probes declared. SKIPPED.

### Requirements Coverage

Plan frontmatter unions to exactly the 12 ROADMAP IDs (03-01: PORT-02..06, MKT-08, TEST-02; 03-02: WL-02, WL-03, MKT-08; 03-03: PUI-01; 03-04: PUI-02, MKT-08; 03-05: UI-06). All are `[x]` in REQUIREMENTS.md and "Phase 3 / Complete" in the traceability table. No orphaned IDs (PUI-06 maps to Phase 5).

| Requirement | Source Plan | Status | Evidence |
|-------------|-------------|--------|----------|
| MKT-08 | 03-01, 03-02, 03-04 | SATISFIED | `tracking.sync_ticker`; `test_tracking.py`; E2E held/unwatched |
| WL-02 | 03-02 | SATISFIED | `add_to_watchlist`; `test_watchlist.py`; `watchlist.spec.ts` |
| WL-03 | 03-02 | SATISFIED | `remove_from_watchlist`, 404 on unknown, held ticker keeps streaming |
| PORT-02 | 03-01 | SATISFIED | buy fill, weighted avg, fractional |
| PORT-03 | 03-01 | SATISFIED | sell; row deleted at 0; residue handled |
| PORT-04 | 03-01 | SATISFIED | 400 envelopes via `DomainError`, no state change |
| PORT-05 | 03-01 | SATISFIED | one transaction: trade + position + cash + snapshot |
| PORT-06 | 03-01 | SATISFIED | response `{trade, portfolio}` |
| UI-06 | 03-05 | SATISFIED | add form + per-row remove |
| PUI-01 | 03-03 | SATISFIED | TradeBar, disabled in flight, inline messages |
| PUI-02 | 03-04 | SATISFIED | PositionsTable/PositionRow, live |
| TEST-02 | 03-01 | SATISFIED | `tests/test_trading.py` (execution, P&L, oversell, insufficient cash, loss) |

### Anti-Patterns Found

None. TBD/FIXME/XXX/TODO/HACK scan over `backend/app`, `frontend/src`, `test/*.ts`, `planning/API_CONTRACT.md` returned no matches. No stub handlers; routes perform real queries and writes.

### Human Verification Required

None outstanding. `03-UAT.md` (status complete, 2 passed, 0 issues) covers the two human-only items: positions cells dim on disconnect, and layout fit at 1920x1080, 1280x800, 768x1024 and 480px.

### Gaps Summary

No gaps. Every ROADMAP success criterion is backed by current implementation, wiring, live data flow and passing behavioral tests; all 12 requirement IDs are accounted for; later phases (chat reuse of `place_trade`/watchlist helpers, charts) did not regress the goal. Only advisories: a wording difference between "Unknown ticker" in the ROADMAP and the documented "Invalid ticker" message for malformed input, and carried info-level review items.

---

_Verified: 2026-10-10_
_Verifier: Claude (gsd-verifier)_
