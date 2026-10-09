---
phase: 04-charts-portfolio-visualizations
plan: 04
subsystem: ui
tags: [react, zustand, d3-hierarchy, treemap, heatmap, vitest, playwright, tracer]

requires:
  - phase: 04-charts-portfolio-visualizations
    provides: "04-01 approved d3 pins; 04-02 ChartOverlay and the panel shell; 04-03 PnlChartPanel, mid-row wrapper, four-row workspace grid"
  - phase: 03-trading-watchlist-management
    provides: portfolioStore ticket guard, livePosition, trade bar, positions table
provides:
  - d3-hierarchy 3.1.2 (dependency) and @types/d3-hierarchy 3.1.7 (devDependency), exact pins
  - heatmap.ts (pnlDir, tileFill, heatmapLeaves, buildTiles) with a squarified treemap
  - useElementSize hook and a FakeResizeObserver jsdom stand-in registered globally
  - HeatmapTile and HeatmapPanel with loading, error+Retry, empty and populated states
  - portfolioStore.load() clears failed when it starts, so every Retry shows its loading skeleton
  - E2E proof of all five empty states together, with fetches stubbed
affects: [05 chat panel re-flows the mid row]

requirements-completed: [PUI-03, PUI-07]

actuals:
  tokens: 14000
  tasks: 3
  commits: 4
plan_head_before: ca3e96882f2a5982f6828f9771dbdd2e9c0ca82f
plan_head_after: 17a0fd0eefe849f25a585381da3b3a777071a94a
commits: 4

tech-stack:
  added: [d3-hierarchy 3.1.2, "@types/d3-hierarchy 3.1.7"]
  patterns:
    - "Measured box always mounted (ResizeObserver hook), tiles computed by a pure function from store state at render"
    - "Overlay precedence in a panel: loading, error, empty, then none; the measured box stays mounted underneath"
    - "Global jsdom stand-in registered in vitest.setup.ts and cleared in the shared beforeEach, mirroring FakeEventSource"

key-files:
  created:
    - frontend/src/lib/heatmap.ts
    - frontend/src/lib/heatmap.test.ts
    - frontend/src/lib/useElementSize.ts
    - frontend/src/components/HeatmapTile.tsx
    - frontend/src/components/HeatmapPanel.tsx
    - frontend/src/components/HeatmapPanel.test.tsx
    - frontend/src/test/fakeResizeObserver.ts
  modified:
    - frontend/package.json
    - frontend/package-lock.json
    - frontend/vitest.setup.ts
    - frontend/src/app/page.tsx
    - frontend/src/lib/portfolioStore.ts
    - frontend/src/lib/portfolioStore.test.ts
    - test/portfolio-charts.spec.ts

key-decisions:
  - "buildTiles uses the node returned by the treemap call (HierarchyRectangularNode) instead of the input root, which TypeScript 7 types without x0/y0/x1/y1"
  - "The root hierarchy datum is typed as HeatLeaf and given a children property at runtime, so no cast to an extended type is needed"
  - "The empty-state check uses heatmapLeaves().length === 0, independent of the measured size, so the empty overlay shows before the box is measured"

patterns-established:
  - "Retry shows loading: a load() that sets failed:false on start makes the same ChartOverlay precedence render the skeleton while pending and the error again on a second failure"

coverage:
  - id: D1
    description: "With positions held the heatmap draws one tile per position with area proportional to live value, up/down tint from tileFill, ordered by cost basis; verified in a real browser by buying AAPL and MSFT"
    requirement: PUI-03
    verification:
      - kind: e2e
        ref: "test/portfolio-charts.spec.ts#the heatmap tiles held positions by weight"
        status: pass
      - kind: unit
        ref: "frontend/src/lib/heatmap.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Tile thresholds, accessible sentence (title and aria-label), data-pnl/data-weight, geometry and classes; tiles recolor when a price frame changes P&L direction"
    requirement: PUI-03
    verification:
      - kind: unit
        ref: "frontend/src/components/HeatmapPanel.test.tsx#HeatmapTile"
        status: pass
      - kind: unit
        ref: "frontend/src/components/HeatmapPanel.test.tsx#HeatmapPanel tiles"
        status: pass
    human_judgment: false
  - id: D3
    description: "Heatmap states: loading skeleton, error with Retry that shows loading while pending and the error again on a second failure, empty (no positions, or all worth 0), single tile filling the box"
    requirement: PUI-07
    verification:
      - kind: unit
        ref: "frontend/src/components/HeatmapPanel.test.tsx#HeatmapPanel states"
        status: pass
      - kind: unit
        ref: "frontend/src/lib/portfolioStore.test.ts#portfolio store load start"
        status: pass
    human_judgment: false
  - id: D4
    description: "Watchlist, main chart, positions table, heatmap and P&L chart each show their explicit empty state together in a real browser with stubbed empty responses"
    requirement: PUI-07
    verification:
      - kind: e2e
        ref: "test/portfolio-charts.spec.ts#every panel shows its empty state"
        status: pass
    human_judgment: false
  - id: D5
    description: "Pins d3-hierarchy 3.1.2 and @types/d3-hierarchy 3.1.7 installed exactly as approved in 04-01; the static export bundles d3-hierarchy and type-checks"
    verification:
      - kind: other
        ref: "npm --prefix frontend ls d3-hierarchy @types/d3-hierarchy; npm --prefix frontend run build"
        status: pass
    human_judgment: false
  - id: D6
    description: "Visual result: green/red tint legibility with white text, 300 ms glide as prices move, and the layout at 1920x1080, 1280x800, 1024x768 and 768x1024 with no document scroll at 1024px and wider"
    verification: []
    human_judgment: true
    rationale: "Appearance and layout at several viewport sizes cannot be asserted from jsdom or DOM attributes; the plan's human-check is an end-of-phase human verification item and was not performed by the executor"

duration: 20 min
completed: 2026-10-09
status: complete
---

# Phase 4 Plan 04: Portfolio Heatmap and Empty-State Proof Summary

**A d3-hierarchy squarified treemap heatmap of held positions (area by live market value, up/down tint by P&L %, ordered by cost basis) with loading, error+Retry and empty states, plus a real-browser test showing all five panels' empty states together.**

## Performance

- **Duration:** 20 min
- **Tasks:** 3 (1 tracer, 2 TDD)
- **Files modified:** 14 (7 created, 7 modified)
- **Commits:** 4 (measured from the plan ledger)

## Accomplishments

- Installed exactly the user-approved `d3-hierarchy@3.1.2` and `@types/d3-hierarchy@3.1.7` (lockfile diff: only those two packages, 18 added lines). TLS verification stayed on throughout.
- Tracer proven in a real browser: buying 3 AAPL and 2 MSFT through the trade bar draws two tiles whose bounding-box area ratio matches the `data-weight` ratio within 10%; selling both leaves a clean run.
- `buildTiles` follows the UI-SPEC contract: leaves ordered by cost basis then ticker, `treemapSquarify`, `paddingInner(0)`, `round(true)`, no minimum size (tiny tiles kept), nothing drawn for value 0 or less, no tiles for an unmeasured box.
- `tileFill`: `rgb(63 185 80 / a)` / `rgb(248 81 73 / a)` with `a = 0.15 + 0.35 * min(|pnl%| / 10, 1)`; neutral `var(--color-raised)` when the percent rounds to 0.00.
- Direction is never color alone: every tile has the title/aria-label sentence; the ticker shows at 48x24 and above and the P&L % at 48px tall and above.
- `useElementSize` plus `FakeResizeObserver` (global in `vitest.setup.ts`) let jsdom tests measure the always-mounted tiles box.
- `portfolioStore.load()` now sets `failed: false` when it starts, so the heatmap's Retry shows `heatmap-loading` until the fetch settles (and the P&L chart's Retry follows the same rule through its own store).
- `every panel shows its empty state` stubs `/api/watchlist`, `/api/portfolio` and `/api/portfolio/history` with `page.route`; the shared E2E database is never altered.

## Task Commits

1. **Task 1 (tracer): buy two tickers and the heatmap tiles them by weight and P&L** - `3debd08` (feat)
2. **Task 2 (TDD): tile geometry, colors and labels pinned** - `34aece2` (test)
3. **Task 3 (TDD): states, Retry-shows-loading, empty-state proof** - `69e6ed1` (test, RED: 8 failing), `17a0fd0` (feat, GREEN)

**Plan metadata:** committed with this SUMMARY (docs: complete plan)

## Verification

- `npm --prefix frontend test`: 20 files, 254 tests passed (one unrelated intermittent failure seen on earlier runs, see Issues Encountered).
- `npm --prefix frontend run build`: export build and type-check passed (bundles d3-hierarchy).
- `npm --prefix test run smoke`: 17 of 17 passed (connection, motion, portfolio-charts x5, smoke, trade, watchlist).
- All acceptance greps for Tasks 1, 2 and 3 pass (pins, `treemapSquarify`, `round(true)`, `livePosition(`, `role="listitem"`, `motion-reduce:transition-none`, HeatmapPanel before PnlChartPanel in `page.tsx`, `it(` count 12, `static trigger`, `stubGlobal("ResizeObserver"`, the four testids, `No positions to map`, `set({ failed: false })`, `page.route` count 3, no `dangerouslySetInnerHTML`).
- A mutation check on `heatmap.ts` (removing the cost-basis sort and the 10% saturation cap) failed 3 tests; the source was then restored with `git checkout`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TypeScript 7 rejected the treemap node types in `buildTiles`**
- **Found during:** Task 1 (`next build` type-check)
- **Issue:** reading `x0/y0/x1/y1` from the input root's `leaves()` fails to compile, because only the node returned by the treemap call is typed as rectangular; typing the root datum as `HeatLeaf & { children }` also broke assignability.
- **Fix:** build the hierarchy as `hierarchy<HeatLeaf>(top)` and read leaves from the value returned by `treemap()(root)`.
- **Files modified:** frontend/src/lib/heatmap.ts
- **Commit:** 3debd08

**Total deviations:** 1 auto-fixed (1 blocking). **Impact:** none on scope or files.

### TDD note

Task 2 follows the tracer, which already built the production code, so its tests passed on first run with no RED commit. A mutation check (see Verification) shows the tests are not vacuous. Task 3 has a genuine RED commit (`69e6ed1`, 8 failing) followed by GREEN (`17a0fd0`). Plan type is `execute`, so no TDD gate applies.

## Issues Encountered

- Two shell slips of my own (a stray `python -` and a stray `cat >` waiting on stdin) hung two commands for their timeouts; the stray processes were identified by command line and killed, and the duplicate test block one of them produced was removed before the RED commit. No project file was affected.
- The Task 3 `<human-check>` (tint and text legibility, 300 ms glide, layout at four viewport sizes) was not performed by the executor; it is an end-of-phase human verification item (coverage D6).
- Intermittent failures in `WatchlistPanel.test.tsx` selection tests (2 of 7 runs; different test each time; green on re-run) are unrelated to this plan and logged in `deferred-items.md`.

## Authentication Gates

None.

## Known Stubs

None. No hardcoded empty values or placeholder text flow to the UI. The E2E route stubs are test-only.

## Threat Flags

None. T-04-12 (React escaping only, no raw-HTML prop anywhere in `frontend/src`), T-04-13 (fixed overlay copy, no response body echoed), T-04-14 and T-04-SC (exact approved pins, committed lockfile, TLS verification never disabled) are mitigated.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 4 plans are complete: the workspace shows the main chart, heatmap and portfolio value chart, trade bar and positions table. The chat panel in Phase 5 will narrow the workspace and owns re-flowing the mid row. Phase 4 end-of-phase human verification items: coverage D7 of 04-03 and D6 here.

---
*Phase: 04-charts-portfolio-visualizations*
*Completed: 2026-10-09*

## Self-Check: PASSED

Created files exist (heatmap.ts, heatmap.test.ts, useElementSize.ts, HeatmapTile.tsx, HeatmapPanel.tsx, HeatmapPanel.test.tsx, fakeResizeObserver.ts); commits 3debd08, 34aece2, 69e6ed1, 17a0fd0 are ancestors of HEAD; unit (254), build and full smoke (17) suites re-run green.
