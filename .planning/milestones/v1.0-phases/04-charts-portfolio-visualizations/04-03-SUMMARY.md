---
phase: 04-charts-portfolio-visualizations
plan: 03
subsystem: ui
tags: [react, zustand, lightweight-charts, portfolio-history, area-series, vitest, playwright, tracer]

requires:
  - phase: 04-charts-portfolio-visualizations
    provides: "04-01 GET /api/portfolio/history; 04-02 ChartOverlay, baseChartOptions, toData, CHART_COLORS, fmtClock/fmtDay/fmtDateTime, four-panel workspace grid"
  - phase: 03-trading-watchlist-management
    provides: portfolioStore ticket guard, liveTotals, trade bar
provides:
  - getPortfolioHistory() and the HistoryPoint type
  - historyStore (history, failed, load, isHistoryInFlight, resetHistoryStore) with a ticket guard
  - buildPnlSeries(history, nowSeconds, liveTotal): strictly ascending points, same-second collapse, display-only live point
  - STARTING_CASH = 10_000
  - PnlChartPanel with loading, error+Retry, never-traded empty and populated states, 30 s refetch, title-bar total and delta
  - Four-row workspace grid with a mid row (PnlChartPanel on the left half until 04-04 adds the heatmap)
affects: [04-04 heatmap goes before PnlChartPanel in the mid row, 05 chat panel re-flow]

requirements-completed: [PUI-04, PORT-07, PUI-07]

actuals:
  tokens: 8500
  tasks: 3
  commits: 4
plan_head_before: 5310d4bcb74f43de91cd1e22e67174be76b6b346
plan_head_after: f523b8ae605f431885f937fb8bba5175c814ad6b
commits: 4

tech-stack:
  added: []
  patterns:
    - "Store with a ticket guard plus an in-flight counter so a poll tick can skip while a GET is pending"
    - "Refetch triggers: mount, 30 s interval, portfolio identity change (effect on the portfolio object), Retry"
    - "Live chart point is derived at render (display-only); the frontend only ever GETs the history route"

key-files:
  created:
    - frontend/src/lib/historyStore.ts
    - frontend/src/lib/historyStore.test.ts
    - frontend/src/lib/pnlSeries.ts
    - frontend/src/lib/pnlSeries.test.ts
    - frontend/src/components/PnlChartPanel.tsx
    - frontend/src/components/PnlChartPanel.test.tsx
  modified:
    - frontend/src/lib/types.ts
    - frontend/src/lib/api.ts
    - frontend/src/lib/api.test.ts
    - frontend/src/lib/totals.ts
    - frontend/src/app/page.tsx
    - test/portfolio-charts.spec.ts

key-decisions:
  - "The chart series memo depends on liveTotal as well as the current second, so the live point always matches the header total instead of lagging up to a second behind price ticks"
  - "A failed refetch after history exists leaves failed=true in the store; the panel shows pnl-error only when history is null, so stale data stays visible with no error UI"
  - "Empty means never traded (no positions and at most one history point) or fewer than 2 points; a closed-out portfolio with traded history keeps its chart (UI-SPEC Decision 8)"

patterns-established:
  - "Overlay precedence in a chart panel: loading, error, empty, then none; the chart box stays mounted and carries the pnl-chart testid only when no overlay shows"

coverage:
  - id: D1
    description: "P&L chart plots history from GET /api/portfolio/history plus a live point equal to the header total; a buy in a real browser takes the chart from pnl-empty to at least 3 points, and selling everything keeps it visible"
    requirement: PUI-04
    verification:
      - kind: e2e
        ref: "test/portfolio-charts.spec.ts#a trade adds points to the portfolio value chart"
        status: pass
      - kind: unit
        ref: "frontend/src/components/PnlChartPanel.test.tsx#plots history plus one live point equal to the header total, then fits"
        status: pass
    human_judgment: false
  - id: D2
    description: "Series rules: same-second points collapse to the last, strictly ascending, live point only when newer, 2000 points"
    requirement: PUI-04
    verification:
      - kind: unit
        ref: "frontend/src/lib/pnlSeries.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "History store applies only the newest result, reports in-flight fetches; getPortfolioHistory never echoes the response body"
    requirement: PORT-07
    verification:
      - kind: unit
        ref: "frontend/src/lib/historyStore.test.ts"
        status: pass
      - kind: unit
        ref: "frontend/src/lib/api.test.ts#GET helpers"
        status: pass
    human_judgment: false
  - id: D4
    description: "Refetch only on mount, every 30 s while mounted (skipped while in flight), on a portfolio change and on Retry; nothing after unmount"
    requirement: PORT-07
    verification:
      - kind: unit
        ref: "frontend/src/components/PnlChartPanel.test.tsx#PnlChartPanel refetch cadence"
        status: pass
    human_judgment: false
  - id: D5
    description: "Panel states: loading skeleton, error with Retry, never-traded empty (also proven on a fresh real run), stale chart kept on a failed refetch"
    requirement: PUI-07
    verification:
      - kind: unit
        ref: "frontend/src/components/PnlChartPanel.test.tsx#PnlChartPanel states"
        status: pass
      - kind: e2e
        ref: "test/portfolio-charts.spec.ts#a trade adds points to the portfolio value chart"
        status: pass
    human_judgment: false
  - id: D6
    description: "Title bar total and delta from the $10,000 start in toneClass, dimmed while disconnected, one-line at $1,000,000,000.00"
    requirement: PUI-04
    verification:
      - kind: unit
        ref: "frontend/src/components/PnlChartPanel.test.tsx#PnlChartPanel title bar"
        status: pass
    human_judgment: false
  - id: D7
    description: "Canvas appearance: blue area line ending at the header total, HH:mm and Oct 9 axis labels, crosshair label, no TradingView logo, layout at desktop and tablet widths"
    verification: []
    human_judgment: true
    rationale: "Canvas contents and visual styling cannot be asserted from jsdom or the DOM; the plan's human-check is an end-of-phase human verification item and was not performed by the executor"

duration: 5 min
completed: 2026-10-09
status: complete
---

# Phase 4 Plan 03: Portfolio Value (P&L) Chart Summary

**A Lightweight Charts v5 area chart of portfolio value built from `GET /api/portfolio/history` plus a display-only live point equal to the header total, refetched on mount, every 30 s, on every portfolio change and on Retry, with loading, error, never-traded empty and populated states and a title-bar delta against the $10,000 start.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-10-09T08:30:00Z
- **Completed:** 2026-10-09T08:36:00Z
- **Tasks:** 3 (1 tracer, 2 TDD)
- **Files modified:** 12 (6 created, 6 modified)
- **Commits:** 4 (measured from the plan ledger)

## Accomplishments

- Tracer proven in a real browser against the static export: buying one AAPL share takes the panel to a chart of at least 3 points (seed, trade snapshot, live point), and selling it back leaves the run clean for later specs.
- `buildPnlSeries` collapses history points that share a UTC second to the last one in server order, keeps the output strictly ascending, and appends the live point only when its second is newer than the last history second.
- `historyStore` copies the portfolio store's ticket rule (a result applies only if its ticket is newer than the last applied) and adds an in-flight counter so the 30 s poll skips a tick while a GET is pending.
- `PnlChartPanel` renders exactly one overlay per state over an always-mounted chart box: `pnl-loading` (aria-busy), `pnl-error` with `pnl-retry`, `pnl-empty` ("No portfolio history yet") only before the first trade, otherwise the chart. A fresh run shows `pnl-empty`, `$10,000.00` and `0.00 (0.00%)`; after a trade and a full sell the chart stays (Decision 8).
- Title bar: `pnl-value`, `pnl-delta` (`fmtSigned(delta) (fmtPct(delta / STARTING_CASH * 100))` in `toneClass`), a "since start" label hidden below 640px, both numbers `opacity-60` only while disconnected.
- Chart config: area series in `#209dd7` with the 0.28 to 0 gradient, `attributionLogo: false`, no pan or zoom, `HH:mm` ticks within a day and `Oct 9` day ticks, `fmtDateTime` crosshair label, `fitContent()` after each `setData`.
- Workspace grid is now `lg:grid-rows-[minmax(0,5fr)_minmax(0,4fr)_auto_minmax(0,4fr)]` with the mid-row wrapper holding the panel; 04-04 inserts the heatmap first.

## Task Commits

1. **Task 1 (tracer): buy, and the portfolio value chart plots the trade** - `60f8d93` (feat)
2. **Task 2 (TDD): history data rules pinned** - `a8bb971` (test)
3. **Task 3 (TDD): states, cadence and title-bar delta** - `0621762` (test, RED: 13 of 18 failing), `f523b8a` (feat, GREEN)

Task 2 needed no production change: the tracer already satisfied the rules, so its tests passed on first run (apart from one over-strict assertion of my own, below).

## Verification

- `npm --prefix frontend test`: 18 files, 228 tests passed.
- `npm --prefix frontend run build`: export build and type-check passed.
- `npm --prefix test run smoke`: 15 of 15 passed (connection, motion, portfolio-charts x3, smoke, trade, watchlist).
- All acceptance greps pass: `it(` counts are 7, 7 and 18; `STARTING_CASH` present; all six testids, `30_000`, `clearInterval` and the empty copy are present in the panel; `pnl-empty` appears twice in the spec; the history route literal appears only in `api.ts` among non-test files (T-04-11).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Series memo could leave the live point behind the header total**
- **Found during:** Task 1
- **Issue:** the plan's memo dependencies `[history, now, portfolio]` do not include the live total, so within one second the chart's last point could differ from the header total after a price tick.
- **Fix:** depend on `liveTotal` instead of `portfolio`; `setData` then runs at the price cadence (about 2 per second, at most 2001 points), which is cheap.
- **Files modified:** frontend/src/components/PnlChartPanel.tsx
- **Commit:** 60f8d93

**2. [Rule 1 - Bug] Test asserted a store state the plan does not specify**
- **Found during:** Task 2
- **Issue:** my first historyStore test expected `failed` to be false after a rejected refetch with history present; the plan says reject sets `failed: true` whenever the ticket is newer.
- **Fix:** removed the assertion; the panel shows `pnl-error` only when history is null, which Task 3 asserts at the panel level.
- **Files modified:** frontend/src/lib/historyStore.test.ts
- **Commit:** a8bb971

**Total deviations:** 2 auto-fixed (2 bug). **Impact:** none on scope or files.

### TDD note

Task 2 followed the tracer, so its tests passed on first run with no RED commit. A planned mutation check of the live-point rule was not run (a shell path error aborted it before any change; the source was verified unchanged). Task 3 has a genuine RED commit (13 failing) followed by GREEN.

## Issues Encountered

None blocking. The Task 3 `<human-check>` (blue area line ending at the header total, HH:mm axis, crosshair label like "Oct 9 14:30:05", no TradingView logo, delta color) was not performed by the executor; it is an end-of-phase human verification item (coverage D7).

## Authentication Gates

None.

## Known Stubs

None. No hardcoded empty values or placeholder text flow to the UI.

## Threat Flags

None. T-04-09 is mitigated and tested (one interval cleaned up on unmount, skipped while in flight), T-04-10 (fixed `history <status>` error, fixed overlay copy, "secret detail" test) and T-04-11 (the live point is display-only; the only reference to the history path is the GET in `api.ts`).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 04-04 inserts `HeatmapPanel` before `PnlChartPanel` in the mid-row wrapper (`grid min-h-0 grid-cols-1 lg:grid-cols-2`), installs d3-hierarchy 3.1.2 and @types/d3-hierarchy 3.1.7 from the 04-01 approved list, and proves all four empty states together for PUI-07.

---
*Phase: 04-charts-portfolio-visualizations*
*Completed: 2026-10-09*

## Self-Check: PASSED

Created files exist (historyStore.ts, historyStore.test.ts, pnlSeries.ts, pnlSeries.test.ts, PnlChartPanel.tsx, PnlChartPanel.test.tsx); commits 60f8d93, a8bb971, 0621762, f523b8a are ancestors of HEAD; unit, build and full smoke suites re-run green.
