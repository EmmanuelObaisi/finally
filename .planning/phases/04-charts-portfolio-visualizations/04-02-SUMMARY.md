---
phase: 04-charts-portfolio-visualizations
plan: 02
subsystem: ui
tags: [react, zustand, lightweight-charts, selection, vitest, playwright, tracer]

requires:
  - phase: 02-live-market-terminal
    provides: per-ticker spark buffer in the market store, Sparkline chart lifecycle, format.ts formatters
  - phase: 03-trading-watchlist-management
    provides: WatchlistPanel/WatchlistRow, workspace section with TradeBar and PositionsTable
provides:
  - selectionStore (status, selected, select, sync) that keeps the charted ticker in step with the watchlist
  - Clickable and keyboard-selectable watchlist rows (data-selected, select-{TICKER}, aria-current)
  - MainChartPanel: title bar plus a Lightweight Charts v5 price line fed by the sparkline buffer
  - ChartOverlay (skeleton, heading/body, optional Retry) for the other chart panels to reuse
  - chartTheme baseChartOptions(), shared toData, CHART_COLORS border/raised, CHART_FONT
  - fmtClock, fmtDay, fmtDateTime local-time formatters
  - Workspace grid with the main chart as the first row
affects: [04-03 heatmap and layout mid row, 04-04 P&L chart, 05 chat panel re-flow]

actuals:
  tokens: 7100
  tasks: 3
  commits: 5
plan_head_before: 7e8c5c3f6d4c7450ea67a1954998f5990d4314f0
plan_head_after: 90906a9d5b8d5f6be362beffb48c2736ab65a130
commits: 5

tech-stack:
  added: []
  patterns:
    - "Chart instance created once in a mount effect and fed by a second effect on [selected, buffer]; the chart box is always mounted and state overlays sit over it"
    - "Partial vi.mock of lightweight-charts via importOriginal for new chart tests; enum reads stay inside functions so the old full-replacement mocks keep working"
    - "Watchlist panel pushes its view into a zustand selection store from an effect; the store owns the keep/fall-back/empty rules"

key-files:
  created:
    - frontend/src/lib/selectionStore.ts
    - frontend/src/lib/selectionStore.test.ts
    - frontend/src/components/MainChartPanel.tsx
    - frontend/src/components/MainChartPanel.test.tsx
    - frontend/src/components/ChartOverlay.tsx
    - test/portfolio-charts.spec.ts
  modified:
    - frontend/src/lib/chartTheme.ts
    - frontend/src/lib/format.ts
    - frontend/src/lib/format.test.ts
    - frontend/src/components/Sparkline.tsx
    - frontend/src/components/WatchlistRow.tsx
    - frontend/src/components/WatchlistPanel.tsx
    - frontend/src/components/WatchlistPanel.test.tsx
    - frontend/src/components/Footer.tsx
    - frontend/src/app/page.tsx

key-decisions:
  - "The chart testid main-chart requires selection status ready as well as a selected ticker and 2 or more points, so a watchlist reload (loading state) never exposes a stale chart as live"
  - "Selection is kept in a separate zustand store rather than WatchlistPanel state so MainChartPanel needs no prop wiring and later panels can read it"
  - "Only toData moved out of Sparkline; its options stay as they were, so its full-replacement test mock is untouched"

patterns-established:
  - "ChartOverlay: one absolute inset-0 block per panel state with a fixed test id; heatmap and P&L panels reuse it"
  - "Time formatters join day and clock with a space (one combined Intl format would add a comma)"

requirements-completed: [UI-07]

coverage:
  - id: D1
    description: "First watchlist ticker is selected and charted on load; clicking a row or pressing Enter on its select button switches the main chart; remove never selects"
    requirement: UI-07
    verification:
      - kind: e2e
        ref: "test/portfolio-charts.spec.ts#the main chart shows the first watchlist ticker and follows a row click"
        status: pass
      - kind: e2e
        ref: "test/portfolio-charts.spec.ts#keyboard Enter on a ticker selects it"
        status: pass
      - kind: unit
        ref: "frontend/src/components/WatchlistPanel.test.tsx#WatchlistPanel selection"
        status: pass
    human_judgment: false
  - id: D2
    description: "Selection rules: keep while listed, fall back to first remaining on removal, null for empty list, loading/error keep the selection"
    requirement: UI-07
    verification:
      - kind: unit
        ref: "frontend/src/lib/selectionStore.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Main chart state overlays (loading, error, empty, waiting, populated), chart configuration, single chart instance across ticker switches, disconnected dimming, long-ticker truncation"
    requirement: UI-07
    verification:
      - kind: unit
        ref: "frontend/src/components/MainChartPanel.test.tsx"
        status: pass
    human_judgment: false
  - id: D4
    description: "Local-time formatters fmtClock, fmtDay, fmtDateTime"
    verification:
      - kind: unit
        ref: "frontend/src/lib/format.test.ts#time formatters"
        status: pass
    human_judgment: false
  - id: D5
    description: "Canvas appearance: crosshair price and time labels on raised backgrounds, local-time axis, TradingView logo on the main chart only, layout at desktop width"
    verification: []
    human_judgment: true
    rationale: "Canvas contents and visual styling cannot be asserted from jsdom or the DOM; the plan's human-check was not run by the executor (end-of-phase human verify)"

duration: 8 min
completed: 2026-10-09
status: complete
---

# Phase 4 Plan 02: Main Price Chart and Watchlist Selection Summary

**Selectable watchlist rows drive a Lightweight Charts v5 main price chart (default first ticker, click and Enter selection, five explicit chart states) via a zustand selection store, with shared chart theme helpers and local-time formatters for the later charts.**

## Performance

- **Duration:** 8 min
- **Tasks:** 3 (1 tracer, 2 TDD)
- **Files modified:** 15 (6 created, 9 modified)
- **Commits:** 5 (measured from the plan ledger)

## Accomplishments

- Tracer proven in a real browser against the static export: AAPL is selected and charted on load, and clicking the MSFT change cell switches the line, the title and `data-selected` on both rows.
- `selectionStore.sync` implements the UI-SPEC rules (keep when listed, else first ticker, else null; loading/error keep the selection); `WatchlistPanel` syncs from an effect on its view, so removing the selected ticker falls back in the same render cycle.
- `WatchlistRow` is fully clickable with a `select-{TICKER}` button (truncating, `aria-label "Show {TICKER} chart"`, `aria-current`), a 2px primary left border and `bg-raised` when selected, and `stopPropagation` on remove (verified by temporarily removing it: the guard test fails).
- `MainChartPanel` renders exactly one overlay per state through `ChartOverlay`, keeps one chart instance across ticker switches, calls `fitContent()` after each `setData`, and dims price and change at `opacity-60` only while disconnected.
- `chartTheme.ts` now owns `baseChartOptions()`, `toData`, `CHART_FONT` and the border/raised colors for plans 04-03 and 04-04; `format.ts` gained `fmtClock`/`fmtDay`/`fmtDateTime`.
- Workspace is a grid with rows `minmax(0,5fr) / auto / minmax(0,4fr)` and the main chart first; 04-03 adds the mid row.

## Task Commits

1. **Task 1 (tracer): click a watchlist row and the main chart draws that ticker** - `74e4f63` (feat)
2. **Task 2 (TDD): selection rules pinned** - `591935d` (test), `2876c5b` (test, selection-store reset in `beforeEach`)
3. **Task 3 (TDD): main chart states and labels** - `88381de` (test, RED: 6 failing), `90906a9` (feat, GREEN)

Task 2 needed no production change: the tracer already satisfied the rules, so its tests passed on first run; the `stopPropagation` guard was mutation-checked to prove the test discriminates.

## Verification

- `npm --prefix frontend test`: 15 files, 194 tests passed.
- `npm --prefix frontend run build`: export build and type-check passed.
- `npm --prefix test run smoke`: 14 of 14 passed (connection, motion, portfolio-charts, smoke, trade, watchlist).
- All three tasks' acceptance greps pass (counts as specified; `grep -c 'it('` gives 6, 13).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test used a bare object where the API helper needs a Promise**
- **Found during:** Task 2
- **Issue:** the removal-fallback test queued `ok(...)` (a plain object) for the DELETE; `send()` calls `.catch` on the fetch result, so the remove failed with "fetch(...).catch is not a function"
- **Fix:** queue `reply(...)` (a resolved Promise) for mutation responses, as the existing remove tests do
- **Files modified:** frontend/src/components/WatchlistPanel.test.tsx
- **Commit:** 591935d

**2. [Rule 1 - Bug] `resetSelectionStore()` missing from the WatchlistPanel `beforeEach`**
- **Found during:** Task 2 acceptance check (a multi-line string replace silently missed because the file has CRLF endings)
- **Issue:** selection state could leak between tests
- **Fix:** added the call after the market-store reset
- **Files modified:** frontend/src/components/WatchlistPanel.test.tsx
- **Commit:** 2876c5b

**3. [Rule 2 - Missing critical] `main-chart` testid now also requires status ready**
- **Found during:** Task 3
- **Issue:** with a ticker still selected, a watchlist reload (status loading) would still expose the `main-chart` hook beneath the skeleton, contradicting the "loading: no main-chart testid" contract
- **Fix:** `ready = status === "ready" && selected !== null && points >= 2`
- **Files modified:** frontend/src/components/MainChartPanel.tsx
- **Commit:** 90906a9

**Total deviations:** 3 auto-fixed (2 bug, 1 missing critical). **Impact:** none on scope or files.

## Issues Encountered

None blocking. The Task 3 `<human-check>` (hover crosshair labels, local-time axis, TradingView logo on the main chart only, instant switching) was not performed by the executor; it is an end-of-phase human verification item (coverage D5).

## Known Stubs

None. No hardcoded empty values or placeholder text flow to the UI.

## Threat Flags

None. No new endpoints, auth paths or trust-boundary file access. Ticker text reaches the DOM only as React text and attributes (T-04-06); overlay copy is fixed (T-04-07); a test asserts one `createChart` call across a ticker switch (T-04-08); `grep dangerouslySetInnerHTML frontend/src` finds nothing.

## Next Phase Readiness

Plans 04-03 and 04-04 can reuse `ChartOverlay`, `baseChartOptions()`, `toData`, `CHART_COLORS`, the time formatters and the workspace grid (04-03 inserts the mid row between `MainChartPanel` and `TradeBar`, and must change the grid rows to the four-row template).

## Self-Check: PASSED

- Created files exist: selectionStore.ts, selectionStore.test.ts, MainChartPanel.tsx, MainChartPanel.test.tsx, ChartOverlay.tsx, test/portfolio-charts.spec.ts (FOUND).
- Commits 74e4f63, 591935d, 2876c5b, 88381de, 90906a9 are ancestors of HEAD.
