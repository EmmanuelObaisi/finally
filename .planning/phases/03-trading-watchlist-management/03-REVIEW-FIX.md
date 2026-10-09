---
phase: 03-trading-watchlist-management
fixed_at: 2026-10-09T01:55:00Z
review_path: .planning/phases/03-trading-watchlist-management/03-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 3: Code Review Fix Report

**Fixed at:** 2026-10-09
**Source review:** .planning/phases/03-trading-watchlist-management/03-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (fix_scope critical_warning; the 5 Info findings were out of scope)
- Fixed: 5
- Skipped: 0

**Verification:** Backend (`uv run python -m pytest`, 184 passed) and frontend (`npx vitest run`, 161 passed; `npx tsc --noEmit` clean) suites ran in the main checkout, not an isolated worktree, so the numbers are reproducible from the working tree. The main checkout was used because the project's gates need the existing `.venv` and `node_modules`, which a fresh worktree lacks.

## Fixed Issues

### WR-01: Sub-cent fills move no cash, so shares can be acquired for free

**Files modified:** `backend/app/trading.py`, `backend/tests/test_trading.py`, `planning/API_CONTRACT.md`
**Commit:** 0c62954
**Applied fix:** `execute_trade` rejects an order whose `round(price x quantity, 2)` is zero with `400 {"error": "Order value is too small"}`, after the price check and before the cash check. The contract lists it as new check 5 (cash check becomes 6). Added sub-cent buy and sell tests; two existing micro-quantity tests were moved to a higher price so they still fill.

### WR-02: Header total values missing-stream positions at avg_cost, not the server's current_price

**Files modified:** `frontend/src/lib/totals.ts`, `frontend/src/lib/totals.test.ts`, `frontend/src/components/Header.test.tsx`
**Commit:** 8ed8386
**Applied fix:** `liveTotals` falls back to `p.current_price` instead of `p.avg_cost`. Tests use a position whose `avg_cost` differs from `current_price`, both in `liveTotals` and in the Header before any SSE frame.

### WR-03: The tracking rule is check-then-act with no serialization

**Files modified:** `backend/app/main.py`, `backend/app/trading.py`, `backend/app/watchlist.py`, `backend/tests/test_tracking.py`
**Commit:** 5945d2a
**Status:** fixed: requires human verification (concurrency change)
**Applied fix:** One `asyncio.Lock` (`app.state.tracking_lock`, created in the lifespan) is held across the pre-add, the DB work and the final `sync_ticker` in `place_trade`, `add_to_watchlist` and `remove_from_watchlist`. `sync_ticker` itself does not lock, so there is no re-entry. Two new tests use a Massive-like slow source (ticker counted as tracked before it is priced); both failed before the lock and pass after: concurrent adds of the same slow ticker, and a rejected buy racing an add.

### WR-04: Body-level validation errors produce malformed messages

**Files modified:** `backend/app/errors.py`, `backend/tests/test_trading.py`
**Commit:** 853cbbc
**Applied fix:** The validation handler drops integer location parts and omits the `loc: ` prefix when nothing is left. An empty body now gives `Field required` and invalid JSON gives `JSON decode error`. Both cases are added to the route rejection test table.

### WR-05: A failed remove leaves a stale row that can never be cleared

**Files modified:** `frontend/src/components/WatchlistPanel.tsx`, `frontend/src/components/WatchlistPanel.test.tsx`
**Commit:** 13778ca
**Applied fix:** After a failed remove, `remove` calls `getWatchlist()` and replaces the list. The error message stays visible and the loading skeleton is not shown. The 404 test now asserts the stale row disappears and the message remains.

---

_Fixed: 2026-10-09_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
