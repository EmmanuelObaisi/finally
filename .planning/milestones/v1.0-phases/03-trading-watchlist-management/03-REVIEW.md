---
phase: 03-trading-watchlist-management
reviewed: 2026-10-09T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - backend/app/trading.py
  - backend/tests/test_trading.py
  - frontend/src/components/WatchlistPanel.test.tsx
  - frontend/src/components/WatchlistPanel.tsx
  - planning/API_CONTRACT.md
findings:
  critical: 0
  warning: 0
  info: 3
  total: 3
status: issues_found
---

# Phase 3: Code Review Report (incremental re-review after WR-06 / WR-07 fixes)

**Reviewed:** 2026-10-09
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

I re-reviewed commits ee9cd7a (WR-06) and 3f93afb (WR-07). Both fixes are correct and I found no new bugs. The targeted suites pass: `test_trading.py` has 38 passed and `WatchlistPanel.test.tsx` has 32 passed. Structural (fallow) findings were not supplied.

WR-06, `closes_position = side == "sell" and quantity == held` (`trading.py:53`):
- The float equality is safe. `quantity` is `round(quantity, 6)` on entry (line 35). Every stored `positions.quantity` is also the output of `round(..., 6)` (lines 60 and 71). SQLite REAL round-trips doubles exactly. Two values that are both the nearest double to the same 6 dp decimal are therefore bit-identical.
- The `quantity > held` check on line 47 uses the same comparison pair, so a request that passes it with `quantity == held` is the whole-position case.
- Draining shares for $0.00 is not possible. The exemption only fires when the sell removes the entire position. Partial sells still hit the sub-cent guard, which the new test asserts with state unchanged. A position can only be opened with a buy worth at least $0.01 (`amount > 0`), so the most a user can lose is that cent. Re-buying and re-selling dust moves no money in the user's favor.
- The code path after the guard handles `amount == 0` correctly: cash is unchanged, the position row is deleted (`new_qty == 0`), and a trade row and snapshot are written.
- The contract (check 5 in `API_CONTRACT.md`) matches the code. The new test reproduces the exact WR-06 scenario (buy 0.000027 at 190, price falls to 150, partial sell rejected, whole sell succeeds, cash 9999.99, no positions).

WR-07, the `onFail` callback in `mutate` (`WatchlistPanel.tsx:57-75`):
- `onFail` is awaited inside `catch`, before the `finally` that clears `busy`. The remove buttons, the add input and the add button all stay disabled until the refresh settles, so no later mutation can race it.
- `refresh()` swallows its own errors, so `onFail` cannot reject. `finally` therefore always runs and `busy` cannot stick.
- The error message is set before `onFail` runs. `refresh()` never touches `message`, so the failure text stays visible, as the comment says.
- A state update after unmount is possible if the panel unmounts during the refresh. React 18+ does not warn about it, and the panel is mounted for the life of the page, so I am not raising it.
- The new test pins the lock-until-refresh behavior with a deferred promise.

## Info

### IN-01: Rejected buys of unknown tickers still hit the market source (carried forward)

**File:** `backend/app/trading.py:114-116`
**Issue:** Unchanged. `place_trade` calls `source.add_ticker(ticker)` before the quantity or order value is validated. A zero, negative or sub-micro quantity still adds the ticker and then removes it in `finally`. With `MassiveDataSource`, `add_ticker` polls, which spends one of the free tier's 5 calls per minute. "Order value is too small" and "No price available" can only be detected after the price fetch, so those rejections cannot be avoided this way. The quantity check can.
**Fix:** Round and check the quantity in `place_trade` before `add_ticker`.

### IN-04: Effect dependency list is incomplete (carried forward)

**File:** `frontend/src/components/WatchlistPanel.tsx:41-43`
**Issue:** Unchanged. The effect reads `view.kind` and calls `load` but lists only `[status]`. An error that happens while already "connected" never retries automatically, and the effect fails an exhaustive-deps lint rule.
**Fix:** Add `view.kind` to the dependencies, or add a comment saying the effect is deliberately status-triggered.

### IN-06: Cancellation can run the final sync while the trade thread is still committing (carried forward)

**File:** `backend/app/trading.py:112-119`
**Issue:** Unchanged. If the request task is cancelled while awaiting `asyncio.to_thread(run_trade, ...)`, the worker thread keeps running. The `finally` then runs `sync_ticker`, which may read the DB before the trade commits and evict the ticker, and the lock is released. A buy can then commit with an untracked, unpriced position. This is narrow: Starlette normally does not cancel a non-streaming handler on client disconnect. I did not prove it.
**Fix:** Shield the worker call (`await asyncio.shield(asyncio.to_thread(...))`) so `finally` runs after the thread completes, or accept the narrow risk and document it.

---

_Reviewed: 2026-10-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
