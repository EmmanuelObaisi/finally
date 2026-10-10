---
phase: 03-trading-watchlist-management
plan: 03
subsystem: ui
tags: [react, zustand, trade-bar, portfolio-store, vitest, playwright]

requires:
  - phase: 03-trading-watchlist-management
    provides: POST /api/portfolio/trade with 400 {error} envelopes (plan 03-01)
provides:
  - TradeBar (ticker, quantity, Buy, Sell, inline message) mounted in the workspace column
  - usePortfolioStore with a ticket guard shared by Header and the trade bar
  - send / postTrade / NETWORK_ERROR and the Trade type
  - FormMessage, the reserved 24px message line (reused by plan 03-05)
affects: [03-04 positions table, 03-05 watchlist controls, 05 chat]

actuals:
  tokens: 7500
  tasks: 3
  commits: 5
plan_head_before: ea9edd5ea5f8bf6f4a9775c3ea3de33513231bee
plan_head_after: 027deed29cfb9c32812043a46bfd3765a61eae44
commits: 5

tech-stack:
  added: []
  patterns:
    - "Mutation results are authoritative: applyTrade takes the newest ticket, a GET takes its ticket at start and is dropped if older"
    - "Mutations show the server error text; GET helpers keep fixed strings and never echo the body"
    - "Client validation runs before any request or pending state"

key-files:
  created:
    - frontend/src/components/FormMessage.tsx
    - frontend/src/components/TradeBar.tsx
    - frontend/src/components/TradeBar.test.tsx
    - frontend/src/lib/portfolioStore.ts
    - frontend/src/lib/portfolioStore.test.ts
    - frontend/src/lib/api.test.ts
    - test/trade.spec.ts
  modified:
    - frontend/src/lib/types.ts
    - frontend/src/lib/api.ts
    - frontend/src/components/Header.tsx
    - frontend/src/components/Header.test.tsx
    - frontend/src/app/page.tsx

key-decisions:
  - "Header keeps its mount and reconnect loads but goes through usePortfolioStore.load, closing the Header half of 02-REVIEW IN-01"
  - "TradeBar applies response.portfolio before it sets the success message, so header and message change in one render"
  - "Quantity validation is a pure checkInput function in TradeBar.tsx; the 7+ decimals check runs first so it gets its own copy"
  - "WatchlistPanel's h-full and body overflow classes are left for plan 03-05 (not in this plan's files_modified)"

requirements-completed: [PUI-01]

coverage:
  - id: D1
    description: "Trade bar sends Buy and Sell market orders, locks while in flight, and confirms or rejects inline with the server text"
    requirement: "PUI-01"
    verification:
      - kind: unit
        ref: "frontend/src/components/TradeBar.test.tsx#TradeBar request lifecycle"
        status: pass
      - kind: e2e
        ref: "test/trade.spec.ts#buying from the trade bar fills the order"
        status: pass
    human_judgment: false
  - id: D2
    description: "Header cash and total follow a fill in the same render, and a stale GET never overwrites a newer trade result"
    requirement: "PUI-01"
    verification:
      - kind: unit
        ref: "frontend/src/lib/portfolioStore.test.ts#a load started before applyTrade is ignored when it resolves afterwards"
        status: pass
      - kind: unit
        ref: "frontend/src/components/Header.test.tsx#keeps a newer applied portfolio when the older mount fetch resolves afterwards"
        status: pass
    human_judgment: false
  - id: D3
    description: "Malformed ticker and quantity input gets inline guidance with no request; Enter never submits"
    requirement: "PUI-01"
    verification:
      - kind: unit
        ref: "frontend/src/components/TradeBar.test.tsx#TradeBar client validation"
        status: pass
      - kind: unit
        ref: "frontend/src/components/TradeBar.test.tsx#never submits from Enter or a form submit"
        status: pass
    human_judgment: false
  - id: D4
    description: "A rejected oversell shows the server reason inline and leaves header cash unchanged in a real browser"
    requirement: "PUI-01"
    verification:
      - kind: e2e
        ref: "test/trade.spec.ts#a rejected oversell shows the reason inline and leaves cash unchanged"
        status: pass
    human_judgment: false
  - id: D5
    description: "No layout shift as trade messages appear and clear (reserved 72px block, 24px h-6 line)"
    requirement: "PUI-01"
    verification:
      - kind: unit
        ref: "frontend/src/components/TradeBar.test.tsx#starts empty with enabled buttons and an idle reserved message"
        status: pass
    human_judgment: true
    rationale: "Classes are asserted, but visual smoothness while prices tick is a UAT judgment (backstop truth in the plan)"

duration: 6min
completed: 2026-10-08
status: complete
---

# Phase 3 Plan 03: Trade Bar Summary

**Trade bar (Buy/Sell market orders with inline confirmation) on a shared portfolio store whose ticket guard lets the header follow each fill in the same render and ignores a stale GET.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-08T21:09:45Z
- **Completed:** 2026-10-08T21:16Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments
- Tracer: typed `send`/`postTrade`, `FormMessage`, `TradeBar`, workspace column; host Playwright proves a real buy fills against the static export.
- `portfolioStore` with `load`/`applyTrade` tickets: overlapping loads resolve to the later-started one, a trade response beats an older GET; Header now reads the store and still re-fetches on every transition to connected.
- Strict client validation before any request (empty ticker, quantity regex, 6 dp limit); every UI-SPEC E1/E2 state (empty, pending, 400, network failure, success, Enter, long text, layout classes) pinned by unit tests.

## Task Commits

1. **Task 1: Buy end to end (tracer)** - `b177460` (feat)
2. **Task 2: Shared portfolio store** - `7a2c45a` (test, RED: 8 failed on assertions) and `815a586` (feat, GREEN)
3. **Task 3: Input guidance and state tests** - `29f0e12` (test, RED: 13 failed on assertions) and `027deed` (feat, GREEN)

**Plan metadata:** committed with this SUMMARY (docs).

## Files Created/Modified
- `frontend/src/components/TradeBar.tsx` - form, `checkInput`, submit lifecycle
- `frontend/src/components/FormMessage.tsx` - reserved `h-6` message line with `data-kind`
- `frontend/src/lib/portfolioStore.ts` - zustand store, ticket guard, reset helper
- `frontend/src/lib/api.ts`, `types.ts` - `NETWORK_ERROR`, `send`, `postTrade`, `Trade`
- `frontend/src/components/Header.tsx` - reads the shared store
- `frontend/src/app/page.tsx` - scrolling `<main>` below 1024px, `workspace` section with `TradeBar`
- Tests: `TradeBar.test.tsx` (17 cases incl. `it.each` rows), `portfolioStore.test.ts` (7), `api.test.ts` (5), `Header.test.tsx` (+1, store reset), `test/trade.spec.ts` (2)

## Decisions Made
- Header stays a thin consumer: `useEffect(load, [load])` for mount and the status-transition effect call the store's `load`.
- `applyTrade` runs before the success message is set, so cash, total and confirmation update together.
- `WatchlistPanel` layout classes (`lg:h-full`, `lg:overflow-y-auto`) belong to plan 03-05, which already rewrites that component.

## TDD Notes

Task 1 was the tracer (code and E2E together, by plan design). Task 2 RED: a no-behavior `portfolioStore.ts` skeleton was committed with the tests so they fail on assertions rather than on a missing module (7 store tests plus the Header stale-fetch test failed; the other 13 Header tests passed), then GREEN. Task 3 RED: 13 validation and edit-clears-message tests failed on assertions (message text and `data-kind`), 19 passed; the `api.test.ts` cases and the lifecycle cases already held from Task 1 and are pinned as regression tests. `gsd_run check tdd-red-evidence` was not run: the plan is `type: execute` and the Vitest default reporter output is not a supported report format; the failure lists above were inspected by hand. No REFACTOR commit was needed.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- An accidental stray `python -` in a shell command hung on stdin and was moved to the background before any file was written; it had no effect on the tree. Files were then written with the Write/Edit tools.
- Pre-existing unrelated changes (`.planning/config.json`, `.planning/state.json`, `.planning/milestone.lock`) were left unstaged.

## Known Stubs
None.

## Threat Flags
None. Mitigations T-03-12 (React text node only, `grep dangerouslySetInnerHTML frontend/src` prints nothing), T-03-13 (type=button, preventDefault, pending guard), T-03-14 (ticket guard) and T-03-15 (GET helpers unchanged, `secret detail` test) are in place and tested.

## Next Phase Readiness
Ready for 03-04 (positions table reads `usePortfolioStore` and `failed`) and 03-05 (reuses `send` and `FormMessage`).

## Self-Check: PASSED
Files verified present; commits b177460, 7a2c45a, 815a586, 29f0e12, 027deed are ancestors of HEAD. Plan verification: `npm --prefix frontend test` 127 passed (11 files); `npm --prefix frontend run build` exits 0 and writes `frontend/out/index.html`; `npm --prefix test run smoke` 8 passed (connection, motion, smoke, trade). All task acceptance greps re-run and passing.
