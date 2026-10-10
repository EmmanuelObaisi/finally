---
phase: 01-walking-skeleton
plan: 07
subsystem: frontend
tags: [fetch, playwright, nextjs, gap-closure, health]

requires:
  - phase: 01-walking-skeleton
    provides: typed getHealth() client and api-status placeholder page (01-04), host Playwright smoke and local static serving (01-05)
provides:
  - getHealth() rejects on any non-2xx response, so the page shows "down" instead of an empty status
  - Host Playwright spec proving 404/500/503 health responses render "down"
affects: [phases 2-5 typed API calls copied from api.ts]

actuals:
  tokens: 700
  tasks: 2
  commits: 3
plan_head_before: 8b821bc90cb2f23209ff8ec615e47377f77e41eb
plan_head_after: f83c1e11badd62140cda52c2b32ef040a9d90639

tech-stack:
  added: []
  patterns:
    - "Typed API calls check res.ok and throw before parsing the body"
    - "Browser-level error paths tested with page.route fulfilling the contract error envelope"

key-files:
  created:
    - test/health-status.spec.ts
  modified:
    - frontend/src/lib/api.ts
    - .planning/phases/01-walking-skeleton/01-REVIEW-DISPOSITION.md

key-decisions:
  - "getHealth() throws Error('health STATUS') on non-2xx; page.tsx left unchanged because its existing catch already sets down"

requirements-completed: [FND-03]

coverage:
  - id: D1
    description: "A non-2xx /api/health response (404, 500, 503 with the contract error envelope) renders api-status as down"
    requirement: FND-03
    verification:
      - kind: e2e
        ref: "test/health-status.spec.ts#api status shows down when /api/health returns 404|500|503"
        status: pass
    human_judgment: false
  - id: D2
    description: "A healthy 200 {status: ok} response still renders api-status as ok"
    requirement: FND-03
    verification:
      - kind: e2e
        ref: "test/smoke.spec.ts#placeholder page loads and reaches the API"
        status: pass
    human_judgment: false
  - id: D3
    description: "Rebuilding the frontend leaves the tracked tree clean and WR-04 is recorded fixed in the review disposition"
    verification:
      - kind: other
        ref: "npm --prefix frontend run build && test -z \"$(git status --porcelain frontend test)\" && npm --prefix test run smoke"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-10-08
status: complete
---

# Phase 1 Plan 07: WR-04 Health Status Check Summary

**getHealth() now throws on any non-2xx response, so a 404/500/503 health error renders "down" instead of an empty status, proven by a host Playwright spec with mocked responses.**

## Performance

- **Duration:** 8 min
- **Tasks:** 2
- **Files modified:** 3 (one created)

## Accomplishments
- `getHealth()` checks `res.ok` and throws `Error("health STATUS")`, so the error envelope is never cast to `Health`; later typed calls copied from it inherit the check.
- New `test/health-status.spec.ts` mocks `/api/health` with `page.route` for 404, 500 and 503 and asserts `api-status` reads "down"; the existing smoke still reads "ok" (4 passed).
- Clean rebuild verified: `npm --prefix frontend run build` leaves `git status --porcelain frontend test` empty.
- WR-04 marked `fixed (63f1589)` in the review disposition; `open: 5`.

## Task Commits

1. **Task 1 (tracer, TDD):** RED `0f3d760` (test), GREEN `63f1589` (fix)
2. **Task 2:** `f83c1e1` (docs)

## TDD notes

- **RED:** `test/health-status.spec.ts` ran against the unfixed client: 3 failed, smoke passed. Each failure was the planned assertion on the target test (`Expected: "down"`, `Received: ""`), with the page loaded and the span resolved, so it is not a setup, import or load fault. Semantic assessment: valid RED. The Playwright list reporter is not one of the formats `gsd check tdd-red-evidence` parses, so the assessment is from the real run output, not the classifier.
- **GREEN:** one-line `res.ok` check; all 4 tests pass.
- **REFACTOR:** none needed.

## Files Created/Modified
- `frontend/src/lib/api.ts` - getHealth() throws on non-2xx
- `test/health-status.spec.ts` - three mocked non-2xx tests
- `.planning/phases/01-walking-skeleton/01-REVIEW-DISPOSITION.md` - WR-04 fixed, open count 5

## Decisions Made
- Left `frontend/src/app/page.tsx` untouched (still `c6458af`); its existing `.catch(() => setApi("down"))` handles the new rejection.

## Deviations from Plan

None - plan executed exactly as written. The `updated:` date in the disposition already read today's date (2026-10-08), so it needed no change.

## Issues Encountered
None. LF/CRLF warnings from git are cosmetic.

## Threat Flags
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
WR-04 closed. Remaining open review items: WR-01, WR-02, IN-01, IN-02, IN-03.

## Self-Check: PASSED
- `test/health-status.spec.ts` present; commits `0f3d760`, `63f1589`, `f83c1e1` are in HEAD history; verify commands for both tasks exit 0 (4 passed; disposition checks OK).

---
*Phase: 01-walking-skeleton*
*Completed: 2026-10-08*
