---
phase: 02-live-market-terminal
plan: 06
subsystem: ui
tags: [react, zustand, eventsource, reconnect, header, tailwind, vitest, playwright]

requires:
  - phase: 02-live-market-terminal
    provides: GET /api/portfolio (02-02), store, useMarketStream and WatchlistPanel shell (02-05)
provides:
  - Header with live Total value and Cash from GET /api/portfolio (liveTotals), "--" until loaded, 60% opacity while disconnected
  - ConnectionDot (role=status, data-status, UI-SPEC aria-label and title) driven by the store status
  - useMarketStream state machine - 5 s red timer, CLOSED recreate with 1/2/4/10 s capped backoff, one EventSource at a time
  - Re-fetch of the portfolio (Header) and the watchlist in its error state (WatchlistPanel) on each transition to connected
  - Footer with the lightweight-charts attribution and a safe TradingView link
affects: [02-07, phase-3-trading, phase-6-e2e]

actuals:
  tokens: 7400
  tasks: 3
  commits: 5
plan_head_before: bee6f4c2f180897624bba04dd09f54083f36d83c
plan_head_after: 6d74de26e0b5334f7f59d74c79e6a193e94ca924

tech-stack:
  added: []
  patterns:
    - liveTotals is a pure function of the portfolio and the price map, so arrival order of REST and SSE cannot change the header total
    - refetch-on-connected is a status transition check (previous ref) so the first load does not fetch twice
    - the red timer, not readyState, turns the dot red when the server dies (Chromium stays CONNECTING)

key-files:
  created:
    - frontend/src/lib/totals.ts
    - frontend/src/lib/totals.test.ts
    - frontend/src/components/Header.tsx
    - frontend/src/components/Header.test.tsx
    - frontend/src/components/ConnectionDot.tsx
    - frontend/src/components/Footer.tsx
    - test/connection.spec.ts
  modified:
    - frontend/src/lib/api.ts
    - frontend/src/lib/useMarketStream.ts
    - frontend/src/lib/useMarketStream.test.ts
    - frontend/src/components/WatchlistPanel.tsx
    - frontend/src/components/WatchlistPanel.test.tsx
    - frontend/src/components/WatchlistRow.tsx
    - frontend/src/app/page.tsx

key-decisions:
  - "Footer attribution uses the NOTICE text quoted in the UI-SPEC because the installed lightweight-charts 5.2.1 package ships no NOTICE file"
  - "Watchlist price and change cells also dim at opacity-60 when disconnected (UI-SPEC Connection indicator bullet), not only the header numbers"
  - "A spent red timer handle is kept (not reset) so later CONNECTING errors cannot re-arm it; only open or a CLOSED error clears it"

patterns-established:
  - "Status-transition effects: compare against a ref of the previous status instead of keying on the new value alone"
  - "Playwright simulates a dead stream with a fulfilled HTTP 500 route (CLOSED at once), never an aborted route"

requirements-completed: [UI-01, UI-02, UI-03, UI-08, PORT-01]

coverage:
  - id: D1
    description: "Header shows the FinAlly wordmark, Total value and Cash from GET /api/portfolio; a fresh database reads $10,000.00 for both, with -- (muted) before load and after a failed fetch (no error text)"
    requirement: UI-02
    verification:
      - kind: e2e
        ref: "test/connection.spec.ts#fresh start shows $10,000 and a live connection"
        status: pass
      - kind: unit
        ref: "frontend/src/components/Header.test.tsx#Header totals states"
        status: pass
    human_judgment: false
  - id: D2
    description: "liveTotals = cash + sum(qty * (live price ?? avg_cost)); the header total is identical whether the portfolio or the first price frame arrives first; a $1,000,000,000.00 value renders with whitespace-nowrap"
    requirement: PORT-01
    verification:
      - kind: unit
        ref: "frontend/src/lib/totals.test.ts"
        status: pass
      - kind: unit
        ref: "frontend/src/components/Header.test.tsx#shows the same total whether prices arrive before or after the portfolio"
        status: pass
    human_judgment: false
  - id: D3
    description: "Connection dot is yellow on load, red after exactly 5000 ms without an open or at once on a CLOSED error, green on open; repeated CONNECTING errors neither restart the timer nor turn red back to yellow"
    requirement: UI-03
    verification:
      - kind: unit
        ref: "frontend/src/lib/useMarketStream.test.ts#connection state machine"
        status: pass
      - kind: e2e
        ref: "test/connection.spec.ts#a failing stream shows Offline and dims the header"
        status: pass
    human_judgment: false
  - id: D4
    description: "CLOSED sources are closed and replaced after 1, 2, 4, then 10 s (capped), an open resets the backoff, at most one EventSource is open, unmount stops everything"
    requirement: UI-03
    verification:
      - kind: unit
        ref: "frontend/src/lib/useMarketStream.test.ts#recreates the source after 1, 2, 4, 10 and 10 s with at most one open"
        status: pass
    human_judgment: false
  - id: D5
    description: "Each transition to connected re-fetches GET /api/portfolio, and GET /api/watchlist only while the panel is in its error state; stale header and row numbers dim at 60% only while disconnected"
    requirement: UI-02
    verification:
      - kind: unit
        ref: "frontend/src/components/Header.test.tsx and frontend/src/components/WatchlistPanel.test.tsx#WatchlistPanel reconnect"
        status: pass
    human_judgment: false
  - id: D6
    description: "Footer carries the lightweight-charts attribution with TradingView linking to https://www.tradingview.com/ (target _blank, rel noopener noreferrer)"
    requirement: UI-01
    verification:
      - kind: unit
        ref: "frontend/src/components/Header.test.tsx#Footer"
        status: pass
    human_judgment: false
  - id: D7
    description: "Real kill-and-restart of the backend: dot goes yellow at once, red about 5 s later with dimmed numbers, green again within seconds of restart with no reload"
    requirement: UI-03
    verification: []
    human_judgment: true
    rationale: "Plan marks this a human-check (killing a server from Playwright on Windows is brittle); Phase 6 owns the automated SSE-reconnection scenario"

duration: 5 min
completed: 2026-10-08
status: complete
---

# Phase 2 Plan 06: Terminal Header, Connection State Machine and Footer Summary

**Header with live total and cash from `GET /api/portfolio` via a pure `liveTotals`, an honest connection dot driven by a 5 s red timer and capped CLOSED reconnect backoff, refetch-on-connected, 60% stale dimming, and the lightweight-charts footer attribution.**

## Performance

- **Duration:** about 5 min (start 2026-10-08T13:57Z, end 14:02Z)
- **Tasks:** 3 (Task 1 tracer, Tasks 2 and 3 `tdd="true"`)
- **Files:** 14 touched (7 created, 7 modified); 5 task commits

## Accomplishments

- Tracer: `GET /api/portfolio` to `liveTotals` to `Header` and `ConnectionDot` on the page to a Playwright run reading `$10,000.00` twice and a `Live` dot.
- `useMarketStream` is now a state machine with exported `RED_AFTER_MS = 5000` and `BACKOFF_MS = [1000, 2000, 4000, 10000]`; 8 fake-timer tests pin the 4999/5000 ms edge, the no-restart and no-flicker rules, the 1/2/4/10/10 s spacing, the backoff reset on open, the single-open invariant and unmount cleanup.
- Header and WatchlistPanel re-fetch on the transition to connected (previous-status ref, so first load fetches once); header numbers and watchlist price/change cells dim only while disconnected.
- Footer with the attribution sentence and a `rel="noopener noreferrer"` TradingView link.
- Frontend suite is now 63 tests in 6 files (was 36); Playwright has 4 passing tests including a fulfilled-500 stream that reaches Offline and a dimmed `$10,000.00`.

## Task Commits

1. **Task 1: Header totals end to end (tracer)** - `7b7cad1` (feat)
2. **Task 2 RED: failing state machine, refetch and dimming tests** - `63f9bb0` (test)
3. **Task 2 GREEN: state machine, refetch on connected, stale dimming** - `0bf94a1` (feat)
4. **Task 3 RED: failing footer, header-state and liveTotals tests** - `9b92b5f` (test)
5. **Task 3 GREEN: footer attribution** - `6d74de2` (feat)

**Plan metadata:** committed with this SUMMARY (docs: complete plan)

## Tracer Gate

`HUMAN_VERIFY_MODE` is `end-of-phase` and the tracer `<verify>` is automated-only, so `npm --prefix frontend run build && npm --prefix test run smoke` was re-run end to end after the commit and passed (3 tests): "Tracer verified end-to-end, expanding".

## Decisions Made

- Footer attribution text is the NOTICE line quoted in the UI-SPEC ("Lightweight Charts(TM) Copyright (c) 2025 TradingView, Inc. https://www.tradingview.com/") with the leading word TradingView as the link, because the installed package has no NOTICE file (see deviation 1).
- A spent red-timer handle is deliberately kept until an open or CLOSED error clears it, so a later CONNECTING error cannot re-arm it or turn a red dot yellow.
- Refetch on connect compares against the previous status, so a page that loads already connected fetches once, and reconnecting to disconnected to reconnecting never fetches.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] lightweight-charts NOTICE file is not in the installed package**
- **Found during:** Task 3 (read_first asked for `frontend/node_modules/lightweight-charts/NOTICE`)
- **Issue:** version 5.2.1 ships only `LICENSE`, `README.md`, `package.json` and `dist/`; there is no `NOTICE` to copy verbatim. The README only says to add the "attribution notice from the NOTICE file" plus a tradingview.com link.
- **Fix:** used the upstream text the UI-SPEC quotes for exactly this case ("TradingView Lightweight Charts(TM) Copyright (c) 2025 TradingView, Inc. https://www.tradingview.com/"), rendered with TradingView as the link. If a later release ships a NOTICE, compare and update the one string in `Footer.tsx`.
- **Files modified:** `frontend/src/components/Footer.tsx`
- **Commit:** `6d74de2`

**2. [Rule 2 - Missing critical] Watchlist rows did not dim when disconnected**
- **Found during:** Task 2
- **Issue:** the UI-SPEC Connection indicator bullet and the plan's human-check require row prices to dim at 60% while disconnected, but `WatchlistRow.tsx` is not in the plan's `files_modified` and the plan's tasks only dim the header, so stale row prices would look live. This is the plan prohibition "must not make a dead price stream look live".
- **Fix:** `WatchlistRow` adds `opacity-60` to the price span and the change cell while `status === "disconnected"` (own store selector); one WatchlistPanel test covers it.
- **Files modified:** `frontend/src/components/WatchlistRow.tsx`, `frontend/src/components/WatchlistPanel.test.tsx`
- **Commit:** `0bf94a1`

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical). **Impact:** one extra file touched outside `files_modified`; no scope growth beyond the UI-SPEC.

### TDD notes

- Task 2 had a true RED (`63f9bb0`): 10 tests failed for the missing exports, timers, refetch and `opacity-60`, then GREEN `0bf94a1` passed all 50. No refactor commit.
- Task 3 RED (`9b92b5f`) failed on the missing `./Footer` module, which hid whether the Header-state tests themselves would pass. After adding the footer all 63 passed, including those Header and `liveTotals` tests that exercise the tracer code unchanged, so they are regression pins and no production fix was needed for them. Plan type is `execute`, so no plan-level TDD gate applies.

## Issues Encountered

- The first attempt to write the Task 2 tests in one large shell command failed on a shell parse error before running anything; nothing was written and the work was redone in smaller steps.
- Not verified here: the plan's human-check (kill and restart the backend with the browser open). Machine evidence covers the same transitions (fake-timer state machine tests and the fulfilled-500 E2E), but a real restart was not exercised; Phase 6 owns the automated scenario.
- Not measured: that the page still never scrolls with the new 32 px footer at 1920x1080, 1280x800 and 768x1024. The layout is `h-dvh flex-col` with `main min-h-0 flex-1`, so it should hold, but no size measurement was run after adding the footer.

## Authentication Gates

None.

## Known Stubs

None added. The existing `sparkline-{TICKER}` placeholder from 02-05 is still owned by 02-07.

## Threat Flags

None. T-02-17 (footer link has `target="_blank"` with `rel="noopener noreferrer"`, asserted by a test), T-02-18 (capped backoff and single open EventSource, asserted by tests) and T-02-19 (failed portfolio fetch keeps `--` with no error text, asserted by a test) are mitigated as planned. No packages were installed.

## Open Items for the User

- Run the plan's human-check once at the end of the phase: with the app open, stop the backend, wait 10 s, restart it, and confirm yellow, then red with dimmed numbers about 5 s later, then green with no reload.
- Confirm the footer attribution wording is acceptable, since it comes from the UI-SPEC quote rather than a shipped NOTICE file.

## Next Phase Readiness

- Ready for 02-07 (sparklines and price flash): `WatchlistRow` keeps the `sparkline-{TICKER}` cell and the `price-{TICKER}` span (now with the stale-opacity class); the footer already carries the licence notice so sparklines can keep `attributionLogo: false`.

---
*Phase: 02-live-market-terminal*
*Completed: 2026-10-08*

## Self-Check: PASSED

All 7 created files exist on disk; commits 7b7cad1, 63f9bb0, 0bf94a1, 9b92b5f, 6d74de2 are ancestors of HEAD (5 commits measured from the ledger base). Plan-level checks re-run green: `npm --prefix frontend test` (6 files, 63 tests), `npm --prefix frontend run build`, `npm --prefix test run smoke` (4 passed). All acceptance greps for Tasks 1 to 3 were re-run with the expected output.
