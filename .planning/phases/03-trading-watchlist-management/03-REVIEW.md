---
phase: 03-trading-watchlist-management
reviewed: 2026-10-09T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - backend/app/errors.py
  - backend/app/main.py
  - backend/app/trading.py
  - backend/app/watchlist.py
  - backend/tests/test_tracking.py
  - backend/tests/test_trading.py
  - frontend/src/components/Header.test.tsx
  - frontend/src/components/WatchlistPanel.test.tsx
  - frontend/src/components/WatchlistPanel.tsx
  - frontend/src/lib/totals.test.ts
  - frontend/src/lib/totals.ts
  - planning/API_CONTRACT.md
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 3: Code Review Report (re-review after WR-01..WR-05 fixes)

**Reviewed:** 2026-10-09
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

I re-reviewed the five fix commits against `0265aa4`. Backend (184 passed) and frontend suites pass. Structural (fallow) findings were not supplied.

Fix verification:
- WR-02 (totals fallback to `current_price`) and WR-04 (validation message prefix) are correct and tested. For a body-root error the location is `("body",)` or `("body", <int>)`, so the prefix is dropped as intended. Nested locations still render, e.g. `trades.ticker`.
- WR-03 (tracking lock): `place_trade`, `add_to_watchlist` and `remove_from_watchlist` all take the lock and `sync_ticker` does not, so there is no re-entry or deadlock. The lock is created in the lifespan, bound to the running loop. The two new tests exercise the real races.
- WR-01 (sub-cent guard) is correct for what it targets, but it introduces a sell-side lock-in (WR-06 below).
- WR-05 (refresh after failed remove) fixes the stale row but adds a small ordering race (WR-07 below).

## Warnings

### WR-06: The sub-cent guard makes dust positions permanently unsellable

**File:** `backend/app/trading.py:52-54`
**Issue:** The `amount <= 0` check now applies to sells too, and it runs after the "insufficient shares" check. A position can be opened when `round(price x quantity, 2)` is 0.01 and later be worth less than half a cent. Example: buy 0.000027 AAPL at 190.00 (value 0.00513, charged 0.01); the price falls to 150.00 and a full sell is worth 0.00405, which rounds to 0.00. Every sell of the whole position, or any part of it, fails with "Order value is too small" until the price recovers. The user can never close it, and `is_wanted` keeps that ticker streaming forever. The contract describes the rule as "so no shares change hands for free", which is not the case when the user is closing out a position they own.
**Fix:** Apply the minimum-value rule to buys only, or allow a sell that closes the whole position:
```python
closes_all = side == "sell" and quantity == held
if amount <= 0 and not closes_all:
    raise DomainError("Order value is too small")
```
Update the contract (check 5) and add a test where the price drops after a minimal buy and the full sell succeeds. A full sell for $0.00 pays nothing but frees the user's dust, which is not an exploit because the inventory is removed.

### WR-07: The post-failure watchlist refresh can overwrite a newer result

**File:** `frontend/src/components/WatchlistPanel.tsx:82-88`
**Issue:** `mutate` clears `busy` in its `finally`, then `remove` fires an un-awaited `getWatchlist()`. Until it resolves the controls are enabled again. If the user adds or removes another ticker in that window and that response arrives first, the older refresh then calls `setView` and replaces the newer list. The panel shows a state that does not match the server, and it is the same stale-row symptom WR-05 fixed. There is also no guard against the component unmounting.
**Fix:** Keep the panel busy through the refresh by doing it inside the mutation's busy window:
```ts
async function remove(ticker: string) {
  if (busy) return;
  const ok = await mutate("Removing " + ticker + "...", () => removeTicker(ticker), refreshOnFail);
```
or, more simply, have `mutate` accept an `onFail` callback that is awaited before `setBusy(false)`.

## Info

### IN-01: Rejected buys of unknown tickers still hit the market source (carried forward)

**File:** `backend/app/trading.py:114-116`
**Issue:** Unchanged. `place_trade` calls `source.add_ticker(ticker)` before the quantity is validated. A zero, negative or sub-micro quantity still adds the ticker and then removes it. With `MassiveDataSource`, `add_ticker` polls, which spends one of the free tier's 5 calls per minute. The same applies to the new "Order value is too small" rejection, which can only be detected after the price is fetched.
**Fix:** Round and check the quantity in `place_trade` before `add_ticker`.

### IN-04: Effect dependency list is incomplete (carried forward)

**File:** `frontend/src/components/WatchlistPanel.tsx:41-43`
**Issue:** Unchanged. The effect reads `view.kind` and calls `load` but lists only `[status]`. An error that happens while already "connected" never retries automatically, and the effect fails an exhaustive-deps rule.
**Fix:** Add `view.kind` to the dependencies, or comment that the effect is deliberately status-triggered.

### IN-06: Cancellation can run the final sync while the trade thread is still committing

**File:** `backend/app/trading.py:112-118`
**Issue:** If the request task is cancelled while awaiting `asyncio.to_thread(run_trade, ...)`, the worker thread keeps running. The `finally` then runs `sync_ticker`, which may read the DB before the trade commits and evict the ticker, and the lock is released. A buy can then commit with an untracked, unpriced position. This is narrow: Starlette normally does not cancel a non-streaming handler on client disconnect, so I did not prove it.
**Fix:** Shield the worker call (`await asyncio.shield(asyncio.to_thread(...))`) so `finally` runs after the thread completes, or accept the narrow risk and document it.

---

_Reviewed: 2026-10-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
