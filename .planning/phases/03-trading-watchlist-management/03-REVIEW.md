---
phase: 03-trading-watchlist-management
reviewed: 2026-10-08T00:00:00Z
depth: standard
files_reviewed: 33
files_reviewed_list:
  - backend/app/db.py
  - backend/app/errors.py
  - backend/app/main.py
  - backend/app/market/interface.py
  - backend/app/tracking.py
  - backend/app/trading.py
  - backend/app/watchlist.py
  - backend/tests/conftest.py
  - backend/tests/test_tracking.py
  - backend/tests/test_trading.py
  - backend/tests/test_watchlist.py
  - frontend/src/app/page.tsx
  - frontend/src/components/FormMessage.tsx
  - frontend/src/components/Header.test.tsx
  - frontend/src/components/Header.tsx
  - frontend/src/components/PositionRow.tsx
  - frontend/src/components/PositionsTable.test.tsx
  - frontend/src/components/PositionsTable.tsx
  - frontend/src/components/TradeBar.test.tsx
  - frontend/src/components/TradeBar.tsx
  - frontend/src/components/WatchlistPanel.test.tsx
  - frontend/src/components/WatchlistPanel.tsx
  - frontend/src/components/WatchlistRow.tsx
  - frontend/src/lib/api.test.ts
  - frontend/src/lib/api.ts
  - frontend/src/lib/portfolioStore.test.ts
  - frontend/src/lib/portfolioStore.ts
  - frontend/src/lib/positions.test.ts
  - frontend/src/lib/positions.ts
  - frontend/src/lib/types.ts
  - planning/API_CONTRACT.md
  - test/trade.spec.ts
  - test/watchlist.spec.ts
findings:
  critical: 0
  warning: 5
  info: 5
  total: 10
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-10-08
**Depth:** standard
**Files Reviewed:** 33
**Status:** issues_found

## Summary

I reviewed the trading and watchlist backend (atomic trade fill, ticker tracking, error envelope), the trade bar, positions table and watchlist panel, the shared portfolio store, and their unit and E2E tests. I checked behavior against `planning/API_CONTRACT.md`.

No injection or auth problems turned up. All SQL is parameterized, ticker input is validated by a strict regex, and the React UI renders server text as text. The trade transaction (`BEGIN IMMEDIATE`, rollback on any error) is sound, and the check order matches the contract.

The defects are in accounting rounding, the tracking rule's concurrency, one frontend fallback that disagrees with the server, and a few contract-adjacent message and recovery gaps. I ran one probe against the real app to prove WR-01 and WR-04. Structural (fallow) findings were not supplied for this review.

## Warnings

### WR-01: Sub-cent fills move no cash, so shares can be acquired for free

**File:** `backend/app/trading.py:52-59`
**Issue:** The cash movement is `round(price * quantity, 2)`, but the position quantity is updated from the unrounded `quantity` (6 dp). When `price * quantity < 0.005`, the buy costs `$0.00` and still adds shares and a trade row.

I confirmed this with the real app. At AAPL = 190.00, five buys of 0.000026 shares left cash at `10000.0` while the portfolio showed a position of 0.00013 shares. The position's `avg_cost` is computed from the unrounded price, so the ledger is inconsistent: `total_value` rises with no cash spent.

Selling has the mirror problem. A tiny sell deletes shares for `$0.00`. A script, or an LLM auto-executing trades in Phase 5, can repeat tiny buys and then sell the accumulated position in one order, which is rounded once. That nets a few dollars of free cash per thousand requests.

The contract states "cash moves by `round(price x quantity, 2)`", but it does not intend free inventory.
**Fix:** Reject orders whose rounded amount is zero, and add the message to the contract (the contract is the only place the API may change). For example, after computing `amount`:
```python
if amount <= 0:
    raise DomainError("Order value is too small")
```
Place this after the "No price available" check and before the cash check, or compute amount first. Add a test for a sub-cent buy and a sub-cent sell.

### WR-02: Header total values missing-stream positions at avg_cost, not the server's current_price

**File:** `frontend/src/lib/totals.ts:5-8` (used at `frontend/src/components/Header.tsx:25`)
**Issue:** `liveTotals` falls back to `p.avg_cost` when `prices[p.ticker]` is absent. The server values positions at the cached price and returns it as `current_price` and `total_value`. The two agree only when the position is flat versus cost.

On page load, before the first SSE frame arrives (or whenever the stream is down), the header total shows every position at cost, hiding all unrealized P&L. It then jumps once frames arrive. `PositionRow` correctly falls back to `position.current_price` (`PositionRow.tsx:14,31`), so the header and the table disagree on the same data.

The Header tests miss this because their fixtures use `avg_cost === current_price` (180 and 180).
**Fix:** Use the server's own price as the fallback:
```ts
(sum, p) => sum + p.quantity * (prices[p.ticker]?.price ?? p.current_price),
```
Add a Header test where `avg_cost !== current_price` and no frame has arrived.

### WR-03: The tracking rule is check-then-act with no serialization

**File:** `backend/app/tracking.py:30-35`, `backend/app/watchlist.py:68-79`, `backend/app/trading.py:104-112`
**Issue:** `sync_ticker` reads the DB in a worker thread (`is_wanted`), then adds or removes the ticker from the source. Between the read and the action, a concurrent request can change the answer. Every mutation path pre-adds the ticker and calls `sync_ticker` in a `finally`, so overlapping requests interleave in ways that evict a wanted ticker. Two cases:

1. A failed request for ticker X (rejected buy, or add that raised "Unknown ticker") runs `sync_ticker` while a concurrent successful add or buy of X is still inside its thread and uncommitted. `is_wanted` returns false and `remove_ticker(X)` drops X from the cache. The successful request then reads "No price available", or commits a position with no price. Its own final sync re-adds X, but on the simulator that resets the price to the seed and resets `session_start_price`, so a held position jumps in price.
2. `MassiveDataSource.add_ticker` inserts the ticker into `_tickers` before `await self._poll()` (`massive_client.py:77-83`). A second concurrent add of the same symbol sees it as already tracked, returns immediately, finds no cached price, and gets a spurious `400 Unknown ticker`. Its `finally` then removes the ticker the first request is still polling for.

The UI locks controls while a request is in flight, so this is narrow for a single user. It is reachable from two tabs, from the Phase 5 chat path (which calls the same helpers concurrently with the UI), and from scripts. The existing concurrency tests only exercise the simulator, where `add_ticker` never awaits.
**Fix:** Serialize ticker lifecycle changes with a single `asyncio.Lock` on app state that covers `add_ticker`, the DB read in `sync_ticker`, and `remove_ticker`. Hold it from the pre-add through the final sync in `place_trade` and `add_to_watchlist`. This is a small change and keeps the current structure.

### WR-04: Body-level validation errors produce malformed messages

**File:** `backend/app/errors.py:29-31`
**Issue:** The handler builds the message as `"{loc}: {msg}"` with `loc` stripped of `"body"`. For errors at the body root, `loc` is empty or a bare index. I confirmed with the real app:

- `POST /api/portfolio/trade` with an empty body returns `{"error": ": Field required"}`.
- With invalid JSON, `{"error": "1: JSON decode error"}`.

Both show up verbatim in the UI error line. A client that omits the body, or any non-browser caller, gets an unreadable message. This contradicts the contract's "human-readable message string".
**Fix:** Omit the prefix when it is empty or numeric:
```python
loc = ".".join(str(p) for p in first["loc"] if p != "body" and not isinstance(p, int))
message = f"{loc}: {first['msg']}" if loc else first["msg"]
return JSONResponse({"error": message}, status_code=400)
```

### WR-05: A failed remove leaves a stale row that can never be cleared

**File:** `frontend/src/components/WatchlistPanel.tsx:81-84` (and `mutate`, lines 54-67)
**Issue:** On a failed `DELETE`, `mutate` only sets the error message. If the failure is the contract's `404 Ticker not in watchlist` (the ticker was removed from another tab, or the chat in Phase 5), the row stays. Every further click returns the same 404, and only a page reload fixes it. The panel's local list is the source of truth, but it never reconciles with the server after this kind of failure.
**Fix:** After a failed mutation, refresh the list with `getWatchlist()` and keep the error message, or at least do so for 404 on remove. Keep the message visible while refreshing, and leave `load()`'s skeleton out of this path so the panel does not flash.

## Info

### IN-01: Rejected buys of unknown tickers still hit the market source

**File:** `backend/app/trading.py:107-110`
**Issue:** A buy calls `source.add_ticker(ticker)` before the quantity is validated. A zero, negative or sub-micro quantity (rejected at `trading.py:36`) still adds the ticker and removes it again. With `MassiveDataSource`, `add_ticker` triggers a full snapshot poll (`massive_client.py:77-83`). Each rejected request therefore spends one of the free tier's 5 calls per minute.
**Fix:** Round and check the quantity in `place_trade` before `add_ticker` (the contract order is unchanged: ticker format first, quantity second). `execute_trade` can keep its own check for the chat caller.

### IN-02: Micro positions show a spurious P&L in the table

**File:** `frontend/src/lib/positions.ts:7-12`
**Issue:** The cost basis is derived as `market_value - unrealized_pnl`, both rounded to 2 dp by the server. For positions worth only a few cents (fractional shares are supported), that cost can be off by up to a cent, which is a large fraction of the position. A fresh 0.0005-share position that has no P&L can display about `-0.01` and about `-5%`. The test at `positions.test.ts:29` only covers the case where the basis rounds to exactly zero.
**Fix:** Prefer the server's `pnl_percent` and `unrealized_pnl` until a live price differs from `current_price`, or extend the contract so the server exposes an unrounded cost basis.

### IN-03: The portfolio is fetched twice on every page load

**File:** `frontend/src/components/Header.tsx:17-23`
**Issue:** `useEffect(load, [load])` fetches on mount. The status effect then fetches again when the first SSE open moves the status from "reconnecting" to "connected", because `previous.current` starts as `"reconnecting"`. The first fetch is wasted. The Header test at `Header.test.tsx:28-35` encodes this behavior, so it will need updating with the fix.
**Fix:** Initialize `previous` so the first "connected" does not count as a reconnect (for example, skip when the portfolio is already loaded), or document that the double fetch is intentional.

### IN-04: Effect dependency list is incomplete

**File:** `frontend/src/components/WatchlistPanel.tsx:41-43`
**Issue:** The effect reads `view.kind` and calls `load` but lists only `[status]`. It is correct today because it runs only on status changes, but the missing dependencies mean an error that happens while already "connected" never retries automatically. It would also fail an exhaustive-deps lint rule.
**Fix:** Add `view.kind` to the dependencies, or add a comment saying the effect is deliberately status-triggered.

### IN-05: E2E specs depend on each other and cannot be re-run against a persistent container

**File:** `test/trade.spec.ts:30-44`, `test/watchlist.spec.ts:22-40`
**Issue:** `trade.spec.ts` leaves an IBM position behind. `watchlist.spec.ts` buys NFLX and removes it from the watchlist permanently. With the default `webServer` config each run gets a throwaway DB, so this works. With `BASE_URL` set (the container path in `playwright.config.ts`), the DB persists. A second run fails at `watchlist-remove-NFLX` because NFLX is no longer on the watchlist. Cash also shrinks on every run.
**Fix:** Have the tests clean up in a `finally` or `afterEach` (sell the position, re-add NFLX through the API), or document that `BASE_URL` runs need a fresh volume.

---

_Reviewed: 2026-10-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
