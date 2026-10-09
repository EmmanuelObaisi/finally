---
phase: 03
fixed_at: 2026-10-09T02:10:00Z
review_path: .planning/phases/03-trading-watchlist-management/03-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 3: Code Review Fix Report

**Fixed at:** 2026-10-09
**Source review:** .planning/phases/03-trading-watchlist-management/03-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2 (WR-06, WR-07; IN-* left alone)
- Fixed: 2
- Skipped: 0

Verification ran in the main checkout (the worktree lacks .venv and node_modules), so the numbers are reproducible from the working tree. Backend: `uv run python -m pytest` 185 passed. Frontend: `npx vitest run` 162 passed (13 files), `npx tsc --noEmit` clean. Each new test was confirmed to fail with the source change stashed.

## Fixed Issues

### WR-06: The sub-cent guard makes dust positions permanently unsellable

**Files modified:** `backend/app/trading.py`, `backend/tests/test_trading.py`, `planning/API_CONTRACT.md`
**Commit:** ee9cd7a
**Applied fix:** The "Order value is too small" guard is skipped when the order is a sell of the whole held quantity (`closes_position = side == "sell" and quantity == held`). Buys and partial sells are still rejected at a sub-cent value, so shares cannot be acquired for free and a series of partial sells cannot drain shares for $0.00; only the final close of a position can pay $0.00, and that just frees the user's own dust. New regression test: 0.000027 AAPL bought at $190 (charged $0.01), price falls to $150, a partial sell of 0.000013 is still rejected with nothing changed, and the full sell succeeds, deletes the position and leaves cash at 9999.99. `planning/API_CONTRACT.md` check 5 now documents the exception.
**Status:** fixed: requires human verification (logic change to the trade validation rule).

### WR-07: The post-failure watchlist refresh can overwrite a newer result

**Files modified:** `frontend/src/components/WatchlistPanel.tsx`, `frontend/src/components/WatchlistPanel.test.tsx`
**Commit:** 3f93afb
**Applied fix:** `mutate` takes an optional `onFail` callback that is awaited in its catch block, before `finally` clears `busy`. `remove` passes a new `refresh()` helper (fetch the watchlist, `setView`, swallow a refresh error), so the add input, Add button and remove buttons stay disabled until the refresh settles and no later add/remove can race it. The un-awaited `getWatchlist().then(...)` is gone. New test: after a 404 remove, the controls stay disabled while the refresh is pending and re-enable once it resolves with the refreshed list.

---

_Fixed: 2026-10-09_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
