---
phase: 04-charts-portfolio-visualizations
reviewed: 2026-10-09T00:00:00Z
depth: standard
files_reviewed: 41
files_reviewed_list:
  - backend/app/db.py
  - backend/app/history.py
  - backend/app/main.py
  - backend/tests/test_history.py
  - frontend/package.json
  - frontend/src/app/page.tsx
  - frontend/src/components/ChartOverlay.tsx
  - frontend/src/components/Footer.tsx
  - frontend/src/components/HeatmapPanel.test.tsx
  - frontend/src/components/HeatmapPanel.tsx
  - frontend/src/components/HeatmapTile.tsx
  - frontend/src/components/MainChartPanel.test.tsx
  - frontend/src/components/MainChartPanel.tsx
  - frontend/src/components/PnlChartPanel.test.tsx
  - frontend/src/components/PnlChartPanel.tsx
  - frontend/src/components/Sparkline.tsx
  - frontend/src/components/WatchlistPanel.test.tsx
  - frontend/src/components/WatchlistPanel.tsx
  - frontend/src/components/WatchlistRow.tsx
  - frontend/src/lib/api.test.ts
  - frontend/src/lib/api.ts
  - frontend/src/lib/chartTheme.ts
  - frontend/src/lib/format.test.ts
  - frontend/src/lib/format.ts
  - frontend/src/lib/heatmap.test.ts
  - frontend/src/lib/heatmap.ts
  - frontend/src/lib/historyStore.test.ts
  - frontend/src/lib/historyStore.ts
  - frontend/src/lib/pnlSeries.test.ts
  - frontend/src/lib/pnlSeries.ts
  - frontend/src/lib/portfolioStore.test.ts
  - frontend/src/lib/portfolioStore.ts
  - frontend/src/lib/selectionStore.test.ts
  - frontend/src/lib/selectionStore.ts
  - frontend/src/lib/totals.ts
  - frontend/src/lib/types.ts
  - frontend/src/lib/useElementSize.ts
  - frontend/src/test/fakeResizeObserver.ts
  - frontend/vitest.setup.ts
  - planning/API_CONTRACT.md
  - test/portfolio-charts.spec.ts
findings:
  critical: 0
  warning: 2
  info: 5
  total: 7
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-10-09
**Depth:** standard
**Files Reviewed:** 41
**Status:** issues_found

## Summary

The backend history endpoint, the three stores, the chart panels and the heatmap are sound. I traced
`record_if_due` (single `BEGIN IMMEDIATE` transaction, parameterized SQL, rounding consistent with the
trade path), the ticket-ordering rules in `portfolioStore` and `historyStore`, `buildPnlSeries`
(strictly ascending, same-second collapse), `buildTiles` (d3 children accessor handled), and the
lightweight-charts v5 usage. I found no security issue and no correctness bug in production code that
reaches users.

The intermittent failures the 04-04 executor reported are real in design: several assertions in
`WatchlistPanel.test.tsx` run immediately after `findByTestId` without retrying, and what they check is
only set by a passive effect (WR-01). I could not reproduce the failure locally (6 runs of the selection
block, 6 runs of the full 254-test suite, all green), so the cause below comes from reading the code,
not from a captured failure.

## Warnings

### WR-01: Selection tests assert effect-derived state right after `findByTestId`, so they can fail intermittently

**File:** `frontend/src/components/WatchlistPanel.test.tsx:398-404, 430, 445-447`
**Issue:** The rows appear when `setView({kind:"ready"})` commits. The values the tests then check are
written by `WatchlistPanel`'s sync effect (`WatchlistPanel.tsx:48-50`), which is a passive effect:
`selectionStore.sync(...)` sets `selected` and `status`, and a second render then sets `data-selected`.
A `findBy*` resolves from a MutationObserver callback as soon as the row exists in the DOM. A promise-driven
update is not wrapped in `act`, so React runs the passive effect in a later scheduler task. The
resolution race is between that task and the `setTimeout(0)` that RTL's async wrapper uses to drain
microtasks; the two have no guaranteed order. When the `findBy` wins, these one-shot assertions see the
pre-effect state:

- line 399-404: `expect(aapl).toHaveAttribute("data-selected", "true")` and the `aria-current` / `border-primary` checks (first row not yet marked selected).
- line 430: `expect(selected()).toBe("AAPL")` (store still `null`).
- line 446-447: `expect(useSelectionStore.getState().status).toBe("ready")` (store still `"loading"`). The `selected()` `toBeNull` on line 446 is trivially true either way.

The other selection tests are safe: they act through `fireEvent` (wrapped in `act`, which flushes effects) or through `waitFor`.
Production behaviour is unaffected; only the test is racy, and the failure would be `expected null to be "AAPL"` or
`expected "false" to be "true"`.

**Fix:** Retry the effect-derived assertions instead of reading them once:

```tsx
const aapl = await screen.findByTestId("watchlist-row-AAPL");
await waitFor(() => expect(aapl).toHaveAttribute("data-selected", "true"));
expect(screen.getByTestId("watchlist-row-GOOGL")).toHaveAttribute("data-selected", "false");
// ...
// "does not select a row whose remove button is clicked"
await waitFor(() => expect(selected()).toBe("AAPL"));
fireEvent.click(screen.getByTestId("watchlist-remove-MSFT"));
expect(selected()).toBe("AAPL");
// "selects nothing for an empty list"
await waitFor(() => expect(useSelectionStore.getState().status).toBe("ready"));
expect(selected()).toBeNull();
```

In the remove-button test, wait for `"AAPL"` before the click so the assertion afterward is meaningful
(today it can pass vacuously only if the effect ran first, and fails if it did not).

### WR-02: `portfolio-charts.spec.ts` only passes on a pristine database, so it is not re-runnable against a long-lived server

**File:** `test/portfolio-charts.spec.ts:30-59, 61-105`
**Issue:** Test 3 asserts `pnl-empty` visible, `pnl-value` of `$10,000.00` and `pnl-delta` of
`0.00 (0.00%)` ("Fresh run"). Test 4 asserts `heatmap-empty` first. All of these require zero positions
and a single seed snapshot. That holds for the default config (`workers: 1`, throwaway `DB_PATH`, and
`portfolio-charts` sorting before `smoke`, `trade` and `watchlist`). `playwright.config.ts` also
supports `BASE_URL` pointing at an already-running container. Against that, a second run, or any run
after another spec has left a position or extra snapshots, fails on the first assertion with no hint
that state leaked. A run that is interrupted between a buy and the closing sell in test 3 or 4 poisons
every later run in the same way.

**Fix:** Make the preconditions explicit instead of assumed. Either route the three GETs through
`page.route` stubs as test 5 does (preferred, keeps the shared DB untouched), or, when `BASE_URL` is set,
skip the "fresh start" assertions:

```ts
test.skip(!!process.env.BASE_URL, "needs a pristine database");
```

Note the dependence on file ordering in a comment next to the assertions.

## Info

### IN-01: Databases created before this phase never receive the seed snapshot

**File:** `backend/app/db.py:92-107`, `backend/app/history.py:27-28`
**Issue:** The seed snapshot is inserted only inside the "no users_profile row" branch. An existing database
(from phases 1-3) that has never traded has no snapshot, and `record_if_due` returns `False` when the table
is empty ("nothing to compare against"). Such a user gets `{"history": []}` until the first trade; the first
trade then produces one point. The UI copes (empty overlay, then a chart from live + trade points), so this
is not a defect for fresh installs, only an upgrade path gap.
**Fix:** Move the snapshot insert out of the profile branch with a guard of its own, for example
`INSERT ... SELECT ... WHERE NOT EXISTS (SELECT 1 FROM portfolio_snapshots WHERE user_id = ?)`.

### IN-02: `PnlChartPanel` fetches history twice at startup and its `useMemo` is ineffective

**File:** `frontend/src/components/PnlChartPanel.tsx:28, 39-40`
**Issue:** `useEffect(load, [portfolio, load])` runs once on mount and again as soon as the header's first
portfolio load lands, so every page load issues two `GET /api/portfolio/history`. Each call opens a
`BEGIN IMMEDIATE` write transaction on the server (`history.py:21`) even when nothing is inserted. Results
are correct because of the ticket rule, but the second call is redundant. Separately,
`now = Math.floor(Date.now() / 1000)` is read during render and is a dependency of `useMemo`, so the memo
recomputes whenever the second changes and `points` changes identity on every price frame, re-running
`setData` and `fitContent` each time.
**Fix:** Skip the mount fetch when `portfolio === null` (the trade/reload refetch covers it), or refetch only
on `portfolio` identity change after the first load. Drop `now` from the memo by building the history part
in the memo and appending the live point outside it.

### IN-03: Live P&L point is dropped when the browser clock is behind the server's

**File:** `frontend/src/lib/pnlSeries.ts:18-21`
**Issue:** The live point is added only if `now > lastHistorySecond`. `recorded_at` is server time and `now` is
the browser clock. With the browser behind the server (or after a trade snapshot stamped in the browser's
future) the final chart point is a stale server snapshot while the header shows the live total. In the
single-container localhost deployment both clocks are the same host, so this is cosmetic.
**Fix:** If matching the header always matters, replace the last point when `now <= lastSecond` instead of
omitting the live value: `points[points.length - 1] = { time: last.time, value: liveTotal }`.

### IN-04: `MainChartPanel` has no REST fallback for the change percent

**File:** `frontend/src/components/MainChartPanel.tsx:26`
**Issue:** `WatchlistRow` shows `live?.change_percent ?? item.change_percent`, but the main chart title uses
only the live SSE value. Until the first frame arrives (or for a held-but-unstreamed moment) the row shows a
percent while the chart header shows `--`.
**Fix:** Have the selection store or the panel fall back to the same watchlist item, or accept and document the
difference.

### IN-05: Test hygiene: fetch stubs leak across tests in two files

**File:** `frontend/src/components/HeatmapPanel.test.tsx:156-186`, `frontend/src/components/WatchlistPanel.test.tsx:37-42`
**Issue:** Both files call `vi.stubGlobal("fetch", ...)` and never `vi.unstubAllGlobals()` (unlike
`PnlChartPanel.test.tsx` and `api.test.ts`). Tests in the same file that do not re-stub inherit the previous
test's stub. Today every test that fetches re-stubs first, so nothing fails, but a new test that forgets to
stub would hit a stale mock instead of failing loudly.
**Fix:** Add `afterEach(() => vi.unstubAllGlobals())` to both files, or `unstubGlobals: true` in
`vitest.config.ts`.

---

_Reviewed: 2026-10-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
