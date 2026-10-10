---
phase: 02-live-market-terminal
plan: 05
subsystem: ui
tags: [nextjs, react, zustand, eventsource, tailwind, vitest, testing-library, playwright]

requires:
  - phase: 02-live-market-terminal
    provides: GET /api/stream/prices SSE (02-01), GET /api/watchlist and GET /api/portfolio (02-02)
provides:
  - Dark terminal shell (header with FinAlly wordmark, watchlist column, reserved 1fr workspace) using the UI-SPEC theme tokens
  - Single EventSource hook feeding a zustand store (prices replaced per frame, connection status)
  - WatchlistPanel (loading, error, empty, populated) and WatchlistRow (per-row store slice) joined to GET /api/watchlist order
  - format.ts (fmtMoney, fmtQty, fmtSigned, fmtPct, toneClass, MISSING) as the only number formatter
  - Vitest 5 harness (jsdom, Testing Library, jest-dom, FakeEventSource) and 36 frontend unit tests
  - Phase 2 E2E smoke spec (10 seeded rows, live AAPL price, dark body, two concurrent pages)
affects: [02-06, 02-07, phase-3-trading, phase-4-charts]

actuals:
  tokens: 8300
  tasks: 3
  commits: 4
plan_head_before: ead4da6807dc04a7f4f3febfb9fa54551f842736
plan_head_after: 80c00e1543fb4c8b8fee8550f0d5c35d83d749d8

tech-stack:
  added: [lightweight-charts 5.2.1, zustand 5.0.15, vitest 5.0.3, vite 8.3.3, "@vitejs/plugin-react 6.1.2", jsdom 30.1.2, "@testing-library/react 16.3.3", "@testing-library/dom 10.4.2", "@testing-library/jest-dom 7.0.1"]
  patterns:
    - rows join GET /api/watchlist membership and order with the store price map, never SSE keys
    - each SSE frame replaces the price map (applyFrame), so removed tickers disappear
    - one EventSource in app code, created and closed in a single empty-deps effect (StrictMode safe)
    - panel shows only fixed copy for errors, never the server body or status

key-files:
  created:
    - frontend/src/lib/types.ts
    - frontend/src/lib/format.ts
    - frontend/src/lib/store.ts
    - frontend/src/lib/useMarketStream.ts
    - frontend/src/components/WatchlistPanel.tsx
    - frontend/src/components/WatchlistRow.tsx
    - frontend/vitest.config.ts
    - frontend/vitest.setup.ts
    - frontend/src/test/fakeEventSource.ts
    - frontend/src/lib/format.test.ts
    - frontend/src/lib/store.test.ts
    - frontend/src/lib/useMarketStream.test.ts
    - frontend/src/components/WatchlistPanel.test.tsx
  modified:
    - frontend/package.json
    - frontend/package-lock.json
    - frontend/src/lib/api.ts
    - frontend/src/app/page.tsx
    - frontend/src/app/layout.tsx
    - frontend/src/app/globals.css
    - test/smoke.spec.ts
  deleted:
    - test/health-status.spec.ts

key-decisions:
  - "All Phase 2 npm packages installed here with exact pins (approved list from 02-01) so 02-06 and 02-07 never touch package.json"
  - "Phase 1 api-status element, getHealth helper and test/health-status.spec.ts removed together; the connection dot (02-06) replaces them"
  - "fmtPct uses the decimal signed formatter plus a literal % because change_percent is already in percent units"
  - "useMarketStream test file kept as .ts (no JSX needed: StrictMode is passed as the renderHook wrapper)"

patterns-established:
  - "FakeEventSource with open(), emit(data), fail(readyState) stubbed as the global EventSource in vitest.setup.ts"
  - "State bodies (Skeleton, ErrorState, EmptyState) as small private components in WatchlistPanel.tsx"

requirements-completed: [UI-01, UI-03, UI-04, UI-08, WL-01]

coverage:
  - id: D1
    description: "Opening the app shows the dark terminal shell with the FinAlly wordmark and exactly 10 watchlist rows in seed order, each with ticker, price and change %"
    requirement: UI-01
    verification:
      - kind: e2e
        ref: "test/smoke.spec.ts#fresh start streams the seeded watchlist"
        status: pass
    human_judgment: false
  - id: D2
    description: "Row prices update from one EventSource on /api/stream/prices that is closed on unmount and exactly one stays open under StrictMode"
    requirement: UI-03
    verification:
      - kind: unit
        ref: "frontend/src/lib/useMarketStream.test.ts"
        status: pass
      - kind: e2e
        ref: "test/smoke.spec.ts#fresh start streams the seeded watchlist (price-AAPL changes within 10 s)"
        status: pass
      - kind: e2e
        ref: "test/smoke.spec.ts#two pages stream at the same time"
        status: pass
    human_judgment: false
  - id: D3
    description: "Store replaces the price map per frame (same frame twice, empty frame, removed ticker) and rows follow GET /api/watchlist order even with reversed frame keys"
    requirement: UI-03
    verification:
      - kind: unit
        ref: "frontend/src/lib/store.test.ts"
        status: pass
      - kind: unit
        ref: "frontend/src/components/WatchlistPanel.test.tsx#renders rows in response order even when frame keys arrive reversed"
        status: pass
    human_judgment: false
  - id: D4
    description: "Formatters render money, quantity, signed values and percent (already in percent units) with Intl en-US and return -- for null, undefined, NaN and Infinity"
    requirement: UI-08
    verification:
      - kind: unit
        ref: "frontend/src/lib/format.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "Watchlist panel loading (10 skeleton rows, aria-busy), error (fixed copy, Retry refetches), empty, partial (muted --), long ticker truncation and the Chg % title"
    requirement: WL-01
    verification:
      - kind: unit
        ref: "frontend/src/components/WatchlistPanel.test.tsx (11 tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Page never scrolls and keeps 48px header, 480px watchlist column at lg, 40px rows, sparkline column hidden below 640px at 1920x1080, 1280x800, 768x1024, 500x800"
    requirement: UI-01
    verification:
      - kind: other
        ref: "temporary Playwright measurement spec (not committed): scrollHeight <= innerHeight at all four sizes, header 48, panel 480 at lg, row 40, sparkline cell display none at 500"
        status: pass
    human_judgment: true
    rationale: "Measured sizes pass, but visual density and look against the UI-SPEC need a human glance (the plan's human-check); deferred to end-of-phase UAT"
  - id: D7
    description: "Vitest harness and the export build both pass (build type-checks test files)"
    verification:
      - kind: other
        ref: "npm --prefix frontend test (36 passed); npm --prefix frontend run build"
        status: pass
    human_judgment: false

duration: 9 min
completed: 2026-10-08
status: complete
---

# Phase 2 Plan 05: Live Watchlist Terminal Shell Summary

**Dark UI-SPEC terminal whose 10 watchlist rows join `GET /api/watchlist` membership with one `EventSource` feeding a zustand store, formatted by a single Intl formatter module, with loading/error/empty panel states and a Vitest 5 harness (36 tests) plus a rewritten Playwright smoke.**

## Performance

- **Duration:** about 9 min (start time was not captured at launch; estimated from tool timestamps)
- **Completed:** 2026-10-08T13:56Z
- **Tasks:** 3 (Task 1 tracer, Tasks 2 and 3 `tdd="true"`)
- **Files:** 21 touched (13 created, 7 modified, 1 deleted), excluding the lockfile

## Accomplishments

- Tracer: browser to `GET /api/watchlist` plus `EventSource` to store to `WatchlistRow` to a Playwright run against the real backend and simulator. `price-AAPL` changed within 10 s; two pages streamed concurrently.
- `format.ts` is the only number formatter; `toneClass` keeps rounded zero neutral and `--` muted.
- `WatchlistPanel` renders loading (10 skeletons, `aria-busy`), error (fixed copy, Retry re-fetches, server detail and status never reach the DOM), empty and populated bodies with a sticky label row and an overflow-y-auto body.
- UI-SPEC `@theme` block (12 colors, type scale, flash keyframes) and body classes applied; no hex values or slate classes in components; no "daily"/"today" wording anywhere.
- Vitest 5 + jsdom + Testing Library + `FakeEventSource`: 36 tests across 4 files. A mutation check (making `applyFrame` merge) failed 3 tests, proving the replace-not-merge tests are not vacuous.

## Task Commits

1. **Task 1: Live watchlist rows (tracer)** - `fcb58ff` (feat)
2. **Task 2: Vitest harness and logic tests** - `27a60c1` (test)
3. **Task 3 RED: failing panel state tests** - `fe3b1f1` (test)
4. **Task 3 GREEN: theme, shell and panel states** - `80c00e1` (feat)

**Plan metadata:** committed with this SUMMARY (docs: complete plan)

## Tracer Gate

`HUMAN_VERIFY_MODE` is `end-of-phase` and the tracer `<verify>` is automated-only, so the verify (`npm --prefix frontend run build && npm --prefix test run smoke`) was re-run after the commit-ready state and passed: "Tracer verified end-to-end, expanding".

## Decisions Made

- Installed every Phase 2 npm package in this plan with `--save-exact` at the 02-01 approved versions; lockfile committed. TLS verification stayed on (only the pre-set `NODE_EXTRA_CA_CERTS`).
- Removed the Phase 1 status element, `getHealth` and `health-status.spec.ts` together (UI-SPEC "Phase 1 hook decision").
- Kept `useMarketStream.test.ts` as `.ts`; `StrictMode` is supplied as the `renderHook` wrapper so no JSX is needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 1 commit initially captured only the staged deletion**
- **Found during:** Task 1 commit
- **Issue:** `git add` listed `test/health-status.spec.ts`, which `git rm` had already staged and removed, so git aborted the whole add; the commit then contained only the deletion.
- **Fix:** staged the remaining files and amended my own just-created, unpushed commit (`83353e7` became `fcb58ff`).
- **Files modified:** none beyond the plan's list
- **Verification:** `git show --stat HEAD` lists all 12 expected files

**Total deviations:** 1 auto-fixed (process slip, no code impact). **Impact:** none.

### TDD notes

- Task 2 (`tdd="true"`) follows a tracer that already built the code, so the 25 tests passed on first run; there was no RED run. The mutation check described above stands in as evidence that the tests detect defects. No defects were found, so no production fix was made.
- Task 3 had a true RED: the 5 state tests (loading, error x3, empty) failed with "Unable to find an element by testid" for exactly the missing bodies, committed as `fe3b1f1`, then GREEN `80c00e1` passed all 36. The 6 row tests already passed against the tracer panel. No `refactor` commit was needed. Plan type is `execute`, so no plan-level TDD gate applies.

## Issues Encountered

- Vitest prints a Vite warning that `vitest.config.ts` uses ESM syntax in a file loaded as CommonJS (`configLoader: 'native'`). It is a warning only; tests and the build pass, and the root cause is `frontend/package.json` having no `"type": "module"`. Left as is to avoid changing how Next loads its config files; fix candidates are renaming to `vitest.config.mts` or setting `VITE_CONFIG_NATIVE_IGNORE_WARNING=true`.
- `next build` type-checked `vitest.config.ts` and all tests without errors, so the planned tsconfig `exclude` fallback was not needed.

## Authentication Gates

None.

## Known Stubs

| File | Line | Reason |
|------|------|--------|
| `frontend/src/components/WatchlistRow.tsx` | 32 | The `sparkline-{TICKER}` div is an intentional empty 24px placeholder; plan 02-07 replaces it with the Lightweight Charts sparkline. Recorded in `.planning/WINDOWS.md`. |

The header holds only the wordmark; total value, cash and the connection dot are 02-06 by plan. The right 1fr workspace column is intentionally empty (UI-SPEC).

## Threat Flags

None. T-02-14 (no `dangerouslySetInnerHTML` anywhere in `frontend/src`, ticker text rendered as React text), T-02-15 (fixed error copy only, asserted by tests) and T-02-16 / T-02-SC (exact pins, committed lockfile, no TLS override) are mitigated as planned.

## Open Items for the User

- Unresolved prohibition from the plan: whether simulator mode needs a visible "simulated data" label. The UI-SPEC defines no such element, so none was built.
- The plan's human-check (visual density at 1920x1080, 1280x800, 768x1024) is only machine-measured here (page never scrolls, 48px header, 480px column, 40px rows, sparkline column hidden at 500px). A visual look is left for end-of-phase UAT.

## Next Phase Readiness

- Ready for 02-06: store has `status` and `setStatus`; `useMarketStream` has the three handlers but no 5 s timer or CLOSED backoff yet; `page.tsx` header is inline and moves into `Header.tsx`.
- Ready for 02-07: `WatchlistRow` keeps the `sparkline-{TICKER}` cell and a `price-{TICKER}` span with `block px-2 rounded-sm` for the flash; `lightweight-charts` is already installed.

---
*Phase: 02-live-market-terminal*
*Completed: 2026-10-08*

## Self-Check: PASSED

All 13 created files exist; commits fcb58ff, 27a60c1, fe3b1f1, 80c00e1 are ancestors of HEAD; plan-level checks re-run green: `npm --prefix frontend test` (4 files, 36 tests), `npm --prefix frontend run build` (exports `frontend/out/index.html`), `npm --prefix test run smoke` (2 passed). All Task 1 to 3 acceptance greps re-run with the expected output.
