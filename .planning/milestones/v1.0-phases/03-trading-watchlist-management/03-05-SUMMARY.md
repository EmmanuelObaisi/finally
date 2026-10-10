---
phase: 03-trading-watchlist-management
plan: 05
subsystem: ui
tags: [react, watchlist, add-remove, vitest, playwright, tracer]

requires:
  - phase: 03-trading-watchlist-management
    provides: send() mutation helper and FormMessage (03-03), POST/DELETE /api/watchlist (03-02), position-* testids (03-04)
provides:
  - addTicker and removeTicker API helpers returning the response watchlist
  - Watchlist add block (form, input, Add, reserved message line) rendered in every panel state
  - Always-visible fifth-column remove button per row, with one shared in-flight lock
  - Host Playwright proof that a held ticker removed from the watchlist keeps a live position price
affects: [04 charts and heatmap, phase 3 verification]

actuals:
  tokens: 4300
  tasks: 2
  commits: 3
plan_head_before: dda121bf245a6a8f4b3ae34b562d3aa79bbe70fb
plan_head_after: 525a0d914407e20bf82d099a8737da55ec7ffea6
commits: 3

tech-stack:
  added: []
  patterns:
    - "One mutate(pendingText, run) helper owns busy, the pending/error message and rendering the response list; add and remove both go through it, load() is never re-run"
    - "Focus returns to the add input from an effect on busy turning false, because a disabled input cannot take focus inside the handler"

key-files:
  created:
    - test/watchlist.spec.ts
  modified:
    - frontend/src/lib/api.ts
    - frontend/src/components/WatchlistPanel.tsx
    - frontend/src/components/WatchlistRow.tsx
    - frontend/src/components/WatchlistPanel.test.tsx
    - .planning/phases/02-live-market-terminal/02-REVIEW-DISPOSITION.md

key-decisions:
  - "Add and remove share one busy flag, so a second mutation cannot start and responses cannot arrive out of order (T-03-19)"
  - "Input and Add are disabled whenever the panel is not in the ready state, so a watchlist GET and a mutation never overlap (completes IN-01)"
  - "WatchlistPanel section uses lg:h-full and the body lg:overflow-y-auto: natural height below 1024px"
  - "INPUT/BUTTON class strings are duplicated from TradeBar rather than extracted, to stay inside the plan's files_modified"

requirements-completed: [UI-06]

coverage:
  - id: D1
    description: "Typing a ticker and pressing Enter adds a priced, streaming row from the server's response list; a malformed ticker is rejected inline with the contract text"
    requirement: "UI-06"
    verification:
      - kind: e2e
        ref: "test/watchlist.spec.ts#adding a ticker from the panel streams it"
        status: pass
      - kind: e2e
        ref: "test/watchlist.spec.ts#a malformed ticker is rejected inline"
        status: pass
      - kind: unit
        ref: "frontend/src/components/WatchlistPanel.test.tsx#WatchlistPanel add"
        status: pass
    human_judgment: false
  - id: D2
    description: "A row's remove control sends DELETE with no confirmation and drops the row; failures show the server text and keep the row"
    requirement: "UI-06"
    verification:
      - kind: unit
        ref: "frontend/src/components/WatchlistPanel.test.tsx#WatchlistPanel remove"
        status: pass
      - kind: e2e
        ref: "test/watchlist.spec.ts#adding a ticker from the panel streams it"
        status: pass
    human_judgment: false
  - id: D3
    description: "A held ticker removed from the watchlist keeps its position row and a live, changing price"
    requirement: "UI-06"
    verification:
      - kind: e2e
        ref: "test/watchlist.spec.ts#removing a held ticker keeps its position streaming"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every mutation state (loading and error disabled, in-flight lock, empty input, idempotent re-add, 400 and 404 text, long-text truncation, empty list) is pinned"
    requirement: "UI-06"
    verification:
      - kind: unit
        ref: "frontend/src/components/WatchlistPanel.test.tsx#WatchlistPanel add block states"
        status: pass
    human_judgment: false
  - id: D5
    description: "Visual fit of the 72px add block and 40px remove column in the 480px panel and below 1024px"
    requirement: "UI-06"
    human_judgment: true
    rationale: "Layout and wrapping are class-driven (h-18, flex-1, w-20, w-10) and not asserted by jsdom or the E2E specs; needs a visual check"

duration: 4 min
completed: 2026-10-08
status: complete
---

# Phase 3 Plan 05: Watchlist Add and Remove Summary

**Watchlist add form and always-visible per-row remove button, locked by one shared in-flight flag and rendering the server's response list, with host Playwright proof that a removed-but-held ticker keeps streaming.**

## Accomplishments

- Task 1 (tracer): `addTicker` plus the add block (Enter or Add submits, "Adding PYPL..." pending line, server text verbatim on a 400, input kept on failure). Playwright proved typing `pypl` + Enter yields a priced PYPL row and `PYPL$` shows `Invalid ticker: PYPL$`. Tracer verified end to end before expansion.
- Task 2 (TDD): `removeTicker` (`encodeURIComponent` path), fifth 40px column with an `aria-hidden` x button (`aria-label`/`title` "Remove {T}"), sr-only header, and `remove()` through the shared `mutate()`. 17 new unit tests; the single-row test now expects 5 cells.
- E2E: buying NFLX, removing it from the watchlist, then asserting `position-row-NFLX` stays and `position-price-NFLX` changes within 10 s (roadmap Phase 3 criterion 5).
- IN-01 recorded `fixed` in `02-REVIEW-DISPOSITION.md` (frontmatter entry, table row, `open` 7 to 6).
- Layout: section `lg:h-full`, body `lg:overflow-y-auto` (orchestrator note from 03-03).

## Task Commits

1. Task 1 (tracer): `9a85c00` feat(03-05): add a ticker from the watchlist panel end to end
2. Task 2 RED: `9bc78f0` test(03-05): failing tests for add states and row removal (7 target tests failed on missing remove buttons/cells and the in-flight remove lock)
3. Task 2 GREEN: `525a0d9` feat(03-05): remove watchlist tickers from their row; held ticker keeps streaming

No REFACTOR commit: no change was warranted.

## Verification

- `npm --prefix frontend test`: 13 files, 160 tests passed
- `npm --prefix frontend run build`: exit 0
- `npm --prefix test run smoke`: 12 passed (connection, motion, smoke, trade, watchlist)
- `uv run --directory backend python -m pytest -q`: 178 passed, no warnings summary
- All acceptance greps for both tasks match the expected counts (toHaveLength(4) now 0)

## Deviations from Plan

None - plan executed exactly as written.

Process note: the plan's RED step was recorded from the Vitest console summary (7 failed, all on planned remove/lock assertions); this is not a `type: tdd` plan, so no `tdd-red-evidence` record was produced.

## Known Stubs

None.

## Threat Flags

None. T-03-18 (server text rendered as a React text node via FormMessage), T-03-19 (shared busy lock) and T-03-20 (`encodeURIComponent`) are mitigated as planned; no new network surface.

## Next Phase Readiness

Plan 03-05 is the last plan of phase 3; the phase is ready for verification. Visual fit of the add block and remove column (D5) is the one item needing a human glance.

## Self-Check: PASSED

- test/watchlist.spec.ts present; modified files present
- Commits 9a85c00, 9bc78f0, 525a0d9 are ancestors of HEAD
