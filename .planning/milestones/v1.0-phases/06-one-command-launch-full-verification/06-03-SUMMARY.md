---
phase: 06-one-command-launch-full-verification
plan: 03
subsystem: testing
tags: [playwright, e2e, sse, docker, data-testid]
status: complete

requires:
  - phase: 06-one-command-launch-full-verification
    provides: "npm --prefix test run e2e wrapper exporting E2E_CONTAINER and E2E_FRESH_DB (06-02); 06-TEST-AUDIT.md with TEST-04 and TEST-05 (06-05)"
provides:
  - "Real server-drop reconnect spec (docker restart, container mode only)"
  - "Sell, heatmap color and mocked AI chat E2E specs"
  - "TEST-06 scenario matrix and PUI-08 data-testid hook audit in 06-TEST-AUDIT.md"
affects: [06-04, phase 6 verification]

actuals:
  tokens: 3800
  tasks: 3
  commits: 3
plan_head_before: eb75053b31d05510e255359c3c56a1aa3231d137
commits: 3
plan_head_after: b0a73dae6da265fbc729b026b664cba2ac2ed7b7

tech-stack:
  added: []
  patterns:
    - "Delta assertions: read state through page.request first, assert changes relative to it, end flat for the specs' tickers"
    - "Spec file names fix run order: trade-chat, trade-sell, trade, watchlist, zz-reconnect"
    - "Transition capture with a MutationObserver on the connection dot instead of polling a short window"

key-files:
  created:
    - test/zz-reconnect.spec.ts
    - test/trade-sell.spec.ts
    - test/trade-chat.spec.ts
  modified:
    - test/portfolio-charts.spec.ts
    - .planning/phases/06-one-command-launch-full-verification/06-TEST-AUDIT.md

key-decisions:
  - "Reconnect test flattens the shared portfolio first and compares cash and total value on a flat book, since the simulator restarts from seed prices"
  - "Chat action text is asserted with toContainText, not an anchored regex, because a chat-action element renders the Done or Failed tag beside the sentence"

patterns-established:
  - "Container-only specs guard with test.skip(!process.env.E2E_CONTAINER) and use only that container id for docker commands"

requirements-completed: [TEST-06, PUI-08]

coverage:
  - id: D1
    description: "SSE reconnection after a real docker restart: dot leaves connected and returns without a reload, portfolio is refetched, AAPL ticks again, cash and total value unchanged, database cash unchanged"
    requirement: "TEST-06"
    verification:
      - kind: e2e
        ref: "test/zz-reconnect.spec.ts::the stream reconnects after a server restart without a reload and the data survives (npm --prefix test run e2e: passed 20, skipped 0, failed 0, flaky 0)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Sell raises cash by the fill, reduces then removes the position"
    requirement: "TEST-06"
    verification:
      - kind: e2e
        ref: "test/trade-sell.spec.ts::selling raises cash by the fill and reduces then removes the position"
        status: pass
    human_judgment: false
  - id: D3
    description: "Heatmap tile fill matches P&L direction (up green, down red)"
    requirement: "TEST-06"
    verification:
      - kind: e2e
        ref: "test/portfolio-charts.spec.ts::the heatmap tiles held positions by weight"
        status: pass
    human_judgment: false
  - id: D4
    description: "Mocked AI chat buys inline, shows a failed Insufficient cash line, restores history after reload and sells back"
    requirement: "TEST-06"
    verification:
      - kind: e2e
        ref: "test/trade-chat.spec.ts::the AI copilot trades from chat and the conversation survives a reload"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every getByTestId id used by the specs exists in frontend/src"
    requirement: "PUI-08"
    verification:
      - kind: other
        ref: "hook audit script: 54 hooks used, missing: none"
        status: pass
    human_judgment: false
  - id: D6
    description: "The two full container runs (after Task 1 and after Task 3) stay green and leave the user's finally-data volume, finally:* images and any finally-test container, volume or network untouched"
    requirement: "TEST-06"
    verification:
      - kind: other
        ref: "volume and image listings identical before and after both container runs; no finally-test containers, volumes or networks afterwards"
        status: pass
    human_judgment: false

duration: 25 min
completed: 2026-10-10
---

# Phase 6 Plan 03: Remaining E2E Scenarios and Hook Audit Summary

**The Playwright suite now proves every PLAN.md section 12 E2E scenario in the container, including SSE reconnection after a real `docker restart`, sell with cash deltas, heatmap colors by P&L and mocked AI chat trading inline.**

## Performance

- **Duration:** about 25 min
- **Completed:** 2026-10-10
- **Tasks:** 3 (1 tracer, 2 auto)
- **Files:** 6 (3 created, 3 modified including the audit file)

## Accomplishments

- `test/zz-reconnect.spec.ts` (tracer): flattens the shared portfolio over `page.request`, records the dot with a MutationObserver, restarts only `E2E_CONTAINER` with an async `execFile`, and asserts a non-connected status then connected again, the `GET /api/portfolio` refetch, `window.__marker` intact (no reload), AAPL ticking, header cash and total value text unchanged and the API cash equal to the flat cash. Skipped when `E2E_CONTAINER` is absent. Passed on the first run in about 7 s.
- `test/trade-sell.spec.ts`: MSFT buy 3, sell 1 (cash up by the parsed fill, quantity q0 + 2), sell the rest (row removed), ending flat.
- `test/portfolio-charts.spec.ts`: after the area-ratio poll, waits for a tile to leave flat, then polls one `evaluateAll` that checks up tiles are green over red and down tiles red over green. Still 5 tests.
- `test/trade-chat.spec.ts`: "please buy some apple" shows Done and "Buying 1 AAPL now.", cash drops by the parsed fill and the AAPL row appears; "broke" shows a Failed line containing "Insufficient cash" with cash unchanged; after a reload the conversation and the Bought line are restored; "now sell it" sells back to the starting quantity.
- PUI-08: the audit script finds 54 distinct hook ids in the specs and none missing; no `data-testid` was added. `06-TEST-AUDIT.md` gained `## TEST-06 E2E scenarios` and `## PUI-08 data-testid hooks`.
- Final `npm --prefix test run e2e`: `passed 20, skipped 0, failed 0, flaky 0`; the user's `finally-data` volume and all `finally:*` image ids identical before and after; no `finally-test` container, volume or network left. `npm --prefix test run smoke`: 19 passed, 1 skipped (the container-only reconnect test).

## Task Commits

1. **Task 1 (tracer): reconnect after a real server restart** - `8a2cff3`
2. **Task 2: sell scenario and heatmap colors** - `f610fa0`
3. **Task 3: mocked AI chat, TEST-06 matrix, PUI-08 audit** - `b0a73da`

## Deviations from Plan

**1. [Rule 1 - Bug in plan text] Chat action text is not exactly "Bought 1 AAPL at $..."**
- **Found during:** Task 3
- **Issue:** `chat-action` renders a "Done" or "Failed" tag span and the sentence span, so an element-level anchored regex `^Bought 1 AAPL at ...$` (as the plan describes) cannot match.
- **Fix:** assert with `toContainText` and parse the price from an unanchored match; `data-ok` is asserted separately.
- **Files modified:** test/trade-chat.spec.ts
- **Commit:** `b0a73da`

**2. [Minor] Trade helper selects the buy or sell hook with literals**
- Task 2's acceptance greps `trade-sell` in `trade-sell.spec.ts`; the helper uses `side === "buy" ? "trade-buy" : "trade-sell"` instead of string concatenation. Same behavior; the hook audit sees real literals.

**Total deviations:** 1 auto-fixed (Rule 1 in the plan's assertion wording), 1 cosmetic. **Impact:** none on scope.

## Known Stubs

None.

## Threat Flags

None. T-06-08: the reconnect spec restarts only `process.env.E2E_CONTAINER` and is skipped without it; user volumes and images were compared before and after each container run (identical). T-06-09: the new specs end flat for MSFT and AAPL and file order is fixed by name.

## Issues Encountered

None.

## Next Phase Readiness

Plan 06-04 (persistence check) can reuse the same wrapper. D-06 "total value matches" is asserted on a flat portfolio only (RESEARCH Pitfall 3); position persistence across a stop and start belongs to 06-04. The heatmap check proves direction-to-hue agreement, not the exact tint scale (pinned by the heatmap unit tests).

## Self-Check: PASSED

- Files exist: test/zz-reconnect.spec.ts, test/trade-sell.spec.ts, test/trade-chat.spec.ts, test/portfolio-charts.spec.ts, 06-TEST-AUDIT.md
- Commits reachable from HEAD: 8a2cff3, f610fa0, b0a73da
- Acceptance greps for all three tasks re-run and passing; hook audit prints "missing: none"
