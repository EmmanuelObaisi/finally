---
phase: 03-trading-watchlist-management
plan: 04
subsystem: ui
tags: [react, zustand, positions-table, live-pnl, vitest, playwright]

requires:
  - phase: 03-trading-watchlist-management
    provides: usePortfolioStore with load/applyTrade/failed and the workspace column with TradeBar (plan 03-03)
provides:
  - PositionsTable panel (loading, error, empty, populated) mounted below TradeBar
  - PositionRow with a per-ticker SSE price selector and position-* testids
  - livePosition(position, price) with cost basis from the server's own rounded values
affects: [03-05 watchlist controls (E2E held-ticker proof), 04 charts and heatmap]

actuals:
  tokens: 4000
  tasks: 2
  commits: 3
plan_head_before: 48ccd11b05a361872f86b9870a96d54ba8bdf980
plan_head_after: d3d0f3904426f3be1c79551bbeaf3d58ece4639f
commits: 3

tech-stack:
  added: []
  patterns:
    - "Position cells use their own position-* testids; price-{TICKER} stays unique to the watchlist"
    - "Live P&L is recomputed client-side from cost = market_value - unrealized_pnl, so it matches the server within a cent"
    - "A later failed refetch keeps stale rows: the error state shows only when no portfolio was ever loaded"

key-files:
  created:
    - frontend/src/lib/positions.ts
    - frontend/src/lib/positions.test.ts
    - frontend/src/components/PositionRow.tsx
    - frontend/src/components/PositionsTable.tsx
    - frontend/src/components/PositionsTable.test.tsx
  modified:
    - frontend/src/app/page.tsx
    - test/trade.spec.ts

key-decisions:
  - "PositionRow does not reuse PriceCell: plain td cells, no flash, so the duplicate price-AAPL testid never appears"
  - "PositionsTable has no mount-time load: Header already loads the shared store, rows only read it"

requirements-completed: [PUI-02, MKT-08]

coverage:
  - id: D1
    description: "A buy adds a position row whose price, P&L and P&L % follow the SSE stream; a full sell removes the row"
    requirement: "PUI-02"
    verification:
      - kind: e2e
        ref: "test/trade.spec.ts#buying from the trade bar fills the order"
        status: pass
      - kind: unit
        ref: "frontend/src/components/PositionsTable.test.tsx#follows the stream: price, P&L and P&L % move with a frame"
        status: pass
    human_judgment: false
  - id: D2
    description: "A bought unwatched ticker (IBM) streams in its position row without joining the watchlist"
    requirement: "MKT-08"
    verification:
      - kind: e2e
        ref: "test/trade.spec.ts#buying an unwatched ticker adds a streaming position row"
        status: pass
    human_judgment: false
  - id: D3
    description: "Loading, error (Retry), empty and stale-rows states render the UI-SPEC copy"
    requirement: "PUI-02"
    verification:
      - kind: unit
        ref: "frontend/src/components/PositionsTable.test.tsx#PositionsTable states"
        status: pass
    human_judgment: false
  - id: D4
    description: "Live P&L stays within a cent of the server; rounded zero is neutral; missing stream price falls back to current_price with no NaN"
    requirement: "PUI-02"
    verification:
      - kind: unit
        ref: "frontend/src/lib/positions.test.ts#livePosition"
        status: pass
      - kind: unit
        ref: "frontend/src/components/PositionsTable.test.tsx#renders a rounded-zero loss in the neutral color"
        status: pass
    human_judgment: false
  - id: D5
    description: "Price, P&L and P&L % dim while disconnected and recover on reconnect; no layout overflow at the three design widths"
    requirement: "PUI-02"
    verification:
      - kind: unit
        ref: "frontend/src/components/PositionsTable.test.tsx#dims price, P&L and P&L % while disconnected, not qty or avg cost"
        status: pass
    human_judgment: true
    rationale: "The class is asserted; the visual dimming within ~5 s of stopping the backend and the no-document-scroll check at 1920x1080, 1280x800 and 768x1024 are UAT judgments (backstop truth in the plan)"

duration: 3min
completed: 2026-10-08
status: complete
---

# Phase 3 Plan 04: Positions Table Summary

**Positions table under the trade bar: rows come from the shared portfolio store and recompute price, P&L and P&L % per tick from the SSE price map, with loading, error and empty states.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-10-08T21:18:02Z
- **Completed:** 2026-10-08T21:21Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Tracer: `livePosition`, `PositionRow`, `PositionsTable`, workspace mount; host Playwright proves a buy shows the row, a full sell removes it, and a bought unwatched IBM streams in its row while the watchlist gains no IBM row.
- Loading (3 skeleton rows, aria-busy), error (fixed copy plus Retry calling the store's `load`), and empty states; a failed refetch with an existing portfolio keeps stale rows.
- 16 new unit tests pin every UI-SPEC E3/E4 rule: response order, formatting, rounded-zero neutrality, price fallback, dimming of only the three live cells, truncation titles, and no `price-` testid inside the panel.

## Task Commits

1. **Task 1: Positions table end to end (tracer)** - `7433b50` (feat)
2. **Task 2: Positions states and display rules** - `3c42ade` (test, RED: 5 failed on missing state elements) and `d3d0f39` (feat, GREEN)

**Plan metadata:** committed with this SUMMARY (docs).

## Files Created/Modified
- `frontend/src/lib/positions.ts` - `livePosition`, cost basis from `market_value - unrealized_pnl`
- `frontend/src/components/PositionRow.tsx` - one row, selects only its ticker's price, dims live cells
- `frontend/src/components/PositionsTable.tsx` - panel, sticky header, `min-w-144` table, three state components
- `frontend/src/app/page.tsx` - `<PositionsTable />` after `<TradeBar />`
- Tests: `positions.test.ts` (3), `PositionsTable.test.tsx` (13), `test/trade.spec.ts` (+sell step, +IBM case)

## Decisions Made
- Position cells are plain `<td>` with `position-*` testids and no flash animation (UI-SPEC Decision 8); the watchlist keeps the only `price-{TICKER}`.
- The panel does not trigger a load itself; the Header's mount and reconnect loads feed the shared store.

## TDD Notes

Task 2 RED: 5 of the 13 component tests failed with `Unable to find an element by: [data-testid="positions-loading" | "positions-error" | "positions-retry" | "positions-empty"]` (the planned states did not exist yet); the 3 `positions.test.ts` cases and the 8 row-rule tests already held from the Task 1 tracer and are pinned as regression tests. GREEN: all 143 frontend tests pass. `gsd_run check tdd-red-evidence` was not run: the plan is `type: execute` and the Vitest default reporter output is not a supported report format; failure output was inspected by hand. No REFACTOR commit was needed.

## Deviations from Plan

None - plan executed exactly as written. (The Task 1 sell step in `trade.spec.ts` refills the quantity field because the trade bar clears it after a fill; this is part of the planned test, not a plan change.)

## Issues Encountered
- None. Pre-existing unrelated changes (`.planning/config.json`, `.planning/state.json`, `.planning/milestone.lock`) were left unstaged.
- The `human-check` in Task 2 (stop the backend and watch the three cells dim, scroll check at three widths) was not performed by this agent; it is left for UAT.

## Known Stubs
None.

## Threat Flags
None. T-03-16 is mitigated by the `opacity-60` dim while disconnected (unit-tested); T-03-17 and T-03-SC are accepted per plan.

## Next Phase Readiness
Ready for 03-05: position rows persist independently of the watchlist, so its E2E can remove a held ticker from the watchlist and still assert `position-price-{T}` streams.

## Self-Check: PASSED
Created files verified present; commits 7433b50, 3c42ade, d3d0f39 are ancestors of HEAD. Plan verification: `npm --prefix frontend test` 143 passed (13 files); `npm --prefix frontend run build` exits 0 and writes `frontend/out/index.html`; `npm --prefix test run smoke` 9 passed (connection, motion, smoke, trade). All task acceptance greps re-run and passing. No dev server left running.
