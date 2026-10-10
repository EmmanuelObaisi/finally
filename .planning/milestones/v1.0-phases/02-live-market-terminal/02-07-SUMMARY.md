---
phase: 02-live-market-terminal
plan: 07
subsystem: ui
tags: [react, zustand, lightweight-charts, css-animation, vitest, playwright, docker]

requires:
  - phase: 02-live-market-terminal
    provides: SSE frames and store (02-01, 02-05), connection state and footer attribution (02-06), watchlist row shell with the sparkline placeholder (02-05)
provides:
  - Price flash (UI-05) - store flash sequence, keyed PriceCell restarting a CSS-only 500 ms fade, data-flash attribute
  - Per-row Lightweight Charts v5 sparkline fed by a per-second, 300-point store buffer
  - chartTheme CHART_COLORS for canvas charts (Phase 4 reuses it)
  - Container proof - rebuilt image serves the full terminal, all Playwright specs pass against it, docker stop with an open SSE client takes 4 s
  - README Phase 2 status and the shutdown-safe dev command; two research docs corrected
affects: [phase-3-trading, phase-4-charts, phase-6-e2e]

actuals:
  tokens: 7500
  tasks: 3
  commits: 4
plan_head_before: 7517bd58531eb0f6677accc2a7e5e7ce9d3d6c71
plan_head_after: 4d009b938d9b4cd9f41b1422972fd7a4b57eff16

tech-stack:
  added: []
  patterns:
    - flash restart by React key (key=flash.seq on the returned span), no JS timers
    - sparkline buffer lives in the store (applyFrame is pure and takes nowSeconds), the chart component only mirrors it via setData then update
    - canvas library is mocked per test file (jsdom has no matchMedia or canvas); WatchlistPanel.test mocks it with a no-op chart

key-files:
  created:
    - frontend/src/components/PriceCell.tsx
    - frontend/src/components/PriceCell.test.tsx
    - frontend/src/components/Sparkline.tsx
    - frontend/src/components/Sparkline.test.tsx
    - frontend/src/lib/chartTheme.ts
    - test/motion.spec.ts
  modified:
    - frontend/src/lib/store.ts
    - frontend/src/lib/store.test.ts
    - frontend/src/components/WatchlistRow.tsx
    - frontend/src/components/WatchlistPanel.test.tsx
    - README.md
    - .planning/research/PITFALLS.md
    - .planning/research/STACK.md

key-decisions:
  - "applyFrame computes flash and sparkline state purely from (state, frame, nowSeconds); receiveFrame passes Date.now()/1000 so tests control time"
  - "PriceCell takes a dim prop now (Task 1) so the existing disconnected-dimming behavior from 02-06 survives moving the price span out of WatchlistRow"
  - "Sparkline reads the buffer at mount with useMarketStore.getState() and subscribes to the buffer with a selector for update(); a mount-time duplicate update of the newest point is harmless"

patterns-established:
  - "Per-ticker store slices (flash, spark) selected by ticker so only the changed row re-renders"
  - "Task-scoped vi.mock of lightweight-charts with vi.hoisted spies"

requirements-completed: [UI-01, UI-04, UI-05, UI-08, MKT-10]

coverage:
  - id: D1
    description: "A price cell flashes green or red for 500 ms on a newer-timestamp up or down tick only; flat, same-timestamp and first-ever values never flash; restart under rapid ticks remounts the span"
    requirement: UI-05
    verification:
      - kind: unit
        ref: "frontend/src/lib/store.test.ts#applyFrame flash"
        status: pass
      - kind: unit
        ref: "frontend/src/components/PriceCell.test.tsx#PriceCell flash"
        status: pass
      - kind: e2e
        ref: "test/motion.spec.ts#prices flash on ticks"
        status: pass
    human_judgment: false
  - id: D2
    description: "Each row draws a Lightweight Charts v5 sparkline from SSE frames since load - one point per second, capped at 300, blue stroke, no logo, axes, grid, crosshair or interaction; empty below 2 points"
    requirement: UI-04
    verification:
      - kind: unit
        ref: "frontend/src/lib/store.test.ts#applyFrame sparkline buffer"
        status: pass
      - kind: unit
        ref: "frontend/src/components/Sparkline.test.tsx"
        status: pass
      - kind: e2e
        ref: "test/motion.spec.ts#sparklines draw from the stream"
        status: pass
    human_judgment: false
  - id: D3
    description: "Price and change cells dim at 60% while disconnected and recover on connect; ticker cell and sparkline never dim"
    requirement: UI-08
    verification:
      - kind: unit
        ref: "frontend/src/components/WatchlistPanel.test.tsx#WatchlistPanel reconnect > dims price and change cells while disconnected"
        status: pass
      - kind: unit
        ref: "frontend/src/components/PriceCell.test.tsx#PriceCell dimming"
        status: pass
    human_judgment: false
  - id: D4
    description: "The rebuilt Docker image serves the terminal on port 8000: health ok, a priced NFLX watchlist item, all 6 Playwright specs pass against the container, docker stop with an open SSE client took 4 s"
    requirement: MKT-10
    verification:
      - kind: command
        ref: "docker build -t finally:phase2 . ; docker run + curl health/watchlist + BASE_URL=http://localhost:8000 npm --prefix test run smoke + timed docker stop"
        status: pass
    human_judgment: false
  - id: D5
    description: "Flash smoothness under rapid ticks and the visual quality of sparklines (thin blue line, fills cell width, grows smoothly)"
    requirement: UI-05
    verification: []
    human_judgment: true
    rationale: "Animation feel cannot be asserted in jsdom; a full-page screenshot against the container showed cell-only green and red tints, blue lines filling the trend column, no TradingView logo and the footer link, but a 30 s live watch was not done"

duration: 7 min
completed: 2026-10-08
status: complete
---

# Phase 2 Plan 07: Price Flash, Sparklines and Container Proof Summary

**CSS-only 500 ms price flash (keyed `PriceCell`, newer-timestamp rule in `applyFrame`), a per-row Lightweight Charts v5 sparkline from a 300-point per-second store buffer, and a rebuilt Docker image proven to serve the whole terminal and stop in 4 s with an open stream.**

## Performance

- **Duration:** about 7 min (start 2026-10-08T14:03Z, end 14:10Z)
- **Tasks:** 3 (Task 1 tracer, Task 2 `tdd="true"`, Task 3 container proof and docs)
- **Files:** 13 touched (6 created, 7 modified); 4 task commits

## Accomplishments

- Tracer: SSE frame to `applyFrame` flash sequence to keyed `PriceCell` to a Playwright assertion of `data-flash` up or down plus an `animate-flash-*` class, passing in a real browser.
- `applyFrame(state, frame, nowSeconds)` now carries `flash` and `spark`; `SPARK_CAP = 300`, per-second floor dedupe, earlier seconds ignored so chart time stays strictly ascending.
- `Sparkline` mirrors the buffer into the chart (`setData` once at mount, `update` plus `fitContent` per new point, `chart.remove()` on cleanup so StrictMode double-mount is safe).
- Frontend suite grew from 63 to 86 tests in 8 files; Playwright has 6 specs (smoke, connection, motion), all passing locally and against the container.
- Container proof: backend 109 tests pass with no warnings summary, image builds with TLS verification on and no `extra_ca` secret, `GET /api/health` ok, NFLX priced in `GET /api/watchlist`, **docker stop took 4s** with a curl client holding `GET /api/stream/prices` open; container removed afterwards.
- README now lists Phase 1 and 2 deliverables, what is not built, `npm test`, and `--timeout-graceful-shutdown 2` in the dev command (77 lines). PITFALLS Pitfall 4 and STACK (table row and verification note) corrected per 02-RESEARCH.md.
- The 02-05 broken-windows stub (placeholder sparkline cell, ledger id 1) is fixed and marked so in `.planning/WINDOWS.md`.

## Task Commits

1. **Task 1: price flash end to end (tracer)** - `c8f55d0` (feat)
2. **Task 2 RED: failing sparkline buffer, Sparkline and dimming tests** - `746d7ef` (test)
3. **Task 2 GREEN: sparklines with per-second 300-point buffer** - `47d1152` (feat)
4. **Task 3: README, PITFALLS and STACK corrections** - `4d009b9` (docs)

**Plan metadata:** committed with this SUMMARY (docs: complete plan)

## Tracer Gate

`HUMAN_VERIFY_MODE` is `end-of-phase` and the tracer `<verify>` is automated-only, so the build and Playwright suite were run after the Task 1 changes (5 specs passed) before expansion: "Tracer verified end-to-end, expanding".

## Decisions Made

- `PriceCell` takes `dim` from Task 1 onward (plan interface lists `{ ticker, price, dim }`), otherwise moving the price span out of `WatchlistRow` would have dropped the 02-06 disconnected dimming and broken its test.
- `Sparkline` reads the initial buffer imperatively and subscribes with a selector for updates. The first run of the update effect re-sends the newest point already in `setData`, which the chart treats as a same-time replace.
- Container proof used the image as built (no `SIM_SEED`), so specs rely only on shapes, not exact prices.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] jsdom cannot run the real lightweight-charts**
- **Found during:** Task 2 GREEN
- **Issue:** once `WatchlistRow` rendered `Sparkline`, `WatchlistPanel.test.tsx` threw `this._window.matchMedia is not a function` from the real chart library and one test failed.
- **Fix:** `WatchlistPanel.test.tsx` mocks `lightweight-charts` with a no-op chart (the library's own behavior is covered in `Sparkline.test.tsx`).
- **Files modified:** `frontend/src/components/WatchlistPanel.test.tsx`
- **Commit:** `47d1152`

**2. [Rule 2 - Missing critical] README target of 80 lines**
- **Found during:** Task 3
- **Issue:** the first README edit made the file 87 lines, failing the plan's under-80 check.
- **Fix:** condensed the Phase 1 and Phase 2 status into paragraphs; final length 77 lines with all required strings.
- **Files modified:** `README.md`
- **Commit:** `4d009b9`

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical). **Impact:** one test file edited outside the plan's Task 2 files list for the mock (it is in `files_modified` only through the shared pattern); no scope growth.

### TDD notes (Task 2)

- RED commit `746d7ef`: 6 store tests failed on the planned behavior (`spark` undefined, initial state shape) and `Sparkline.test.tsx` failed at import because `./Sparkline` did not exist. The Sparkline file therefore shows a load failure, not an assertion failure, as its RED evidence; the store tests are the valid assertion-level RED. The `gsd_run check tdd-red-evidence` classifier was not run because the plan type is `execute`, not `tdd`, and no `workflow.tdd_mode` gate applies.
- GREEN commit `47d1152` passed all 86 tests. No refactor commit.

## Issues Encountered

- `E2E sparklines draw from the stream` asserts that a `canvas` exists inside `sparkline-AAPL`; Lightweight Charts creates its canvas at mount, so this proves the chart mounts under the real browser, not that a line has drawn. The drawn line was confirmed by one screenshot of the container (blue lines in all 10 rows after 8 s), not by an assertion.
- Not done: the 30 s manual watch from the Task 2 human-check, and visual confirmation of flash smoothness under fast ticks (UAT backstop item per the UI-SPEC).

## Known Stubs

None. The sparkline placeholder from 02-05 is replaced (ledger id 1 marked fixed).

## Threat Flags

None. No new endpoints, auth paths or schema changes; the client sparkline buffer is capped (T-02-20), `.dockerignore` unchanged (T-02-21), `docker stop` measured at 4 s (T-02-22), the build ran with verification on and no secret needed (T-02-23), and the image installed only from lockfiles (T-02-SC).

## Authentication Gates

None.

## Next Phase Readiness

Phase 2 plans are all executed; the phase is ready for verification and the UAT items above (flash smoothness, 30 s live watch of sparklines). `.claude/CLAUDE.md` still mirrors the old STACK httpx row and is left for the user to regenerate.

## Self-Check: PASSED

- Created files exist: store.ts, chartTheme.ts, PriceCell.tsx, Sparkline.tsx, both new test files, test/motion.spec.ts (FOUND)
- Commits `c8f55d0`, `746d7ef`, `47d1152`, `4d009b9` are ancestors of HEAD (FOUND); `commits: 4` measured from the plan ledger
- Task acceptance criteria re-run: all grep checks printed their expected lines; backend 109 passed, frontend 86 passed, Playwright 6 passed locally and against the container; `docker ps -a --filter name=finally-p2 -q` printed nothing
