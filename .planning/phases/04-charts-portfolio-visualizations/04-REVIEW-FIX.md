---
phase: 04-charts-portfolio-visualizations
fixed_at: 2026-10-09T00:00:00Z
review_path: .planning/phases/04-charts-portfolio-visualizations/04-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 04: Code Review Fix Report

**Fixed at:** 2026-10-09
**Source review:** .planning/phases/04-charts-portfolio-visualizations/04-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2
- Fixed: 2
- Skipped: 0

## Fixed Issues

### WR-01: Selection tests assert effect-derived state right after `findByTestId`, so they can fail intermittently

**Files modified:** `frontend/src/components/WatchlistPanel.test.tsx`
**Commit:** 4dab4b6
**Applied fix:** Wrapped the effect-derived assertions in `waitFor`: the first-row `data-selected` check, a wait for `selected()` to be `"AAPL"` before the remove-button click, and a wait for `status` to be `"ready"` in the empty-list test. Verified by running the file three times (38/38 passing each run).

### WR-02: `portfolio-charts.spec.ts` only passes on a pristine database, so it is not re-runnable against a long-lived server

**Files modified:** `test/portfolio-charts.spec.ts`
**Commit:** bd76a60
**Applied fix:** Added `test.skip(!!process.env.BASE_URL, "needs a pristine database")` to the portfolio value chart test and the heatmap test, plus a comment recording the file-ordering and throwaway-DB assumption. Verified the spec still loads and lists 5 tests via `playwright test --list`; not run against a live server.

## Verification environment

The fixes were edited, tested and committed in the main checkout (no isolated worktree). A worktree has no `node_modules`, so the vitest gate could not run there, and the caller asked for the vitest run. Only the two files above were staged; the unrelated uncommitted changes in `.planning/` were left alone.

---

_Fixed: 2026-10-09_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
