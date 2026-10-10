---
phase: 06-one-command-launch-full-verification
plan: 02
subsystem: testing
tags: [playwright, docker-compose, e2e, node]
status: complete

requires:
  - phase: 06-one-command-launch-full-verification
    provides: docker-compose.yml and test/compose.e2e.yml (literal mock pins, image finally-e2e)
provides:
  - "npm --prefix test run e2e: one command that runs the Playwright suite from the host against a fresh throwaway container"
  - "E2E_CONTAINER and E2E_FRESH_DB exported to specs (container handle for plan 06-03)"
  - "Container-mode run executes the P&L chart and heatmap tests (pristine-database skips lifted)"
affects: [06-03, 06-04, 06-05]

actuals:
  tokens: 2300
  tasks: 2
  commits: 2
plan_head_before: 48021fcd9fedfef94051ad0fc59f8a1826fd6e38
commits: 2
plan_head_after: 927d50d4a29c109d35ee03bd60db18a16bca180f

tech-stack:
  added: []
  patterns:
    - "Wrapper owns the lifecycle: pre-clean down -v, up --build --wait, proof, tests, single finally-block down -v"
    - "Honest pass: exit non-zero on any skipped, flaky or failed test or when nothing passed, using the Playwright JSON report"

key-files:
  created:
    - test/e2e.mjs
  modified:
    - test/package.json
    - test/portfolio-charts.spec.ts

key-decisions:
  - "Every compose call passes -p finally-test explicitly (plus COMPOSE_PROJECT_NAME) so down -v can never reach the default finally project or its volume"
  - "Mock pins are proven inside the running container (printenv LLM_MOCK and empty MASSIVE_API_KEY) before any spec runs; only a fixed status line is printed, never the environment or compose config"
  - "Interrupt handling: SIGINT and SIGTERM handlers only record the signal; the single finally block tears down and the exit code becomes 130"

patterns-established:
  - "E2E_FRESH_DB=1 declares the database fresh, which lifts the BASE_URL-only skips in order-sensitive specs"

requirements-completed: [TEST-06]

coverage:
  - id: D1
    description: "npm --prefix test run e2e builds a fresh mock-pinned container, runs all 17 specs from the host, prints the summary and leaves no finally-test container or volume"
    requirement: "TEST-06"
    verification:
      - kind: other
        ref: "npm --prefix test run e2e: 'e2e summary: passed 17, skipped 0, failed 0, flaky 0', rc 0, no finally-test leftovers, user volumes and finally:* image ids identical before and after"
        status: pass
    human_judgment: false
  - id: D2
    description: "Mock pins verified inside the container before Playwright runs"
    requirement: "TEST-06"
    verification:
      - kind: other
        ref: "run output contains 'e2e: LLM_MOCK=true and MASSIVE_API_KEY empty inside the container'"
        status: pass
    human_judgment: false
  - id: D3
    description: "Local smoke mode unchanged"
    requirement: "TEST-06"
    verification:
      - kind: other
        ref: "npm --prefix test run smoke: 17 passed"
        status: pass
    human_judgment: false
  - id: D4
    description: "An aborted startup exits non-zero and leaves nothing behind; a dirty leftover project is cleaned before the run"
    requirement: "TEST-06"
    verification:
      - kind: other
        ref: "listener on 127.0.0.1:8001 gave 'ports are not available', 'e2e: the test container did not become healthy', rc 1, no containers or volumes; a leftover project with one AAPL buy was pre-cleaned and the next run passed 17"
        status: pass
    human_judgment: false
  - id: D5
    description: "Ctrl+C reaching the wrapper still runs the teardown and exits 130"
    requirement: "TEST-06"
    verification: []
    human_judgment: true
    rationale: "The SIGINT and SIGTERM handlers are present and the teardown lives in the single finally block, but a real interrupt was not delivered to the wrapper on Windows during this run"

duration: 25 min
completed: 2026-10-10
---

# Phase 6 Plan 02: One-Command E2E Summary

**`npm --prefix test run e2e` runs the Playwright suite from the host against a fresh throwaway `finally-test` container, proves the mock pins inside it, fails on any skipped or flaky test, and always tears the project down.**

## Performance

- **Duration:** about 25 min
- **Completed:** 2026-10-10
- **Tasks:** 2 (1 tracer, 1 auto)
- **Files:** 3 (1 created, 2 modified)

## Accomplishments

- `test/e2e.mjs` (Node built-ins only): pre-clean `down -v`, `up -d --build --wait`, host `/api/health` check, in-container mock-pin proof, Playwright via `process.execPath` on `cli.js` with the JSON reporter, summary line, exit rule (Playwright code, else 1 on skipped, flaky, failed or zero passed), `down -v` in `finally`.
- Specs receive `BASE_URL=http://localhost:8001`, `E2E_FRESH_DB=1` and `E2E_CONTAINER=<id>`; the two pristine-database skips in `portfolio-charts.spec.ts` now apply only when `BASE_URL` is set and `E2E_FRESH_DB` is not. The container run now executes 17 of 17 tests, including the P&L chart and heatmap ones, with none weakened.
- Tracer proven end to end: `e2e summary: passed 17, skipped 0, failed 0, flaky 0`, no `finally-test` container, volume or network left, the user's `finally-data` volume and all `finally:*` image ids identical before and after. `npm --prefix test run smoke` still passes 17.
- Failure paths proven: an occupied 127.0.0.1:8001 aborts with Docker's "ports are not available", exit 1, nothing left behind; a leftover project with a bought AAPL position is removed by the pre-clean and the following run passes 17 from a fresh $10,000 database. The e2e command ran several times in a row with the same result.

## Task Commits

1. **Task 1 (tracer): wrapper, npm script, lifted skips** - `e1311d2`
2. **Task 2: explicit SIGINT and SIGTERM handlers, failure paths verified** - `927d50d`

## Deviations from Plan

None - plan executed exactly as written. Task 1's wrapper already contained the try/finally and recorded-signal logic as a loop; Task 2 rewrote it as two explicit `process.on` lines so the plan's acceptance grep matches.

Notes (not deviations):
- A probe listener started for the port check outlived its Git Bash `kill` (a Windows node process); it was found by `netstat`, confirmed to be `node.exe`, and terminated by PID before the final proof runs.
- `.gitattributes` does not cover `test/*`, so git warns about LF to CRLF on commit; the index copies are LF.

## Known Stubs

None.

## Threat Flags

None. T-06-05 (explicit `-p finally-test`, user volumes and images compared before and after), T-06-06 (pins proven in the container) and T-06-07 (no environment or `compose config` output) are covered by the passing checks and acceptance greps.

## Issues Encountered

None.

## Next Phase Readiness

Plans 06-03 to 06-05 can read `process.env.E2E_CONTAINER` and rely on `E2E_FRESH_DB=1`. New spec files must sort after `smoke.spec.ts` (see Pitfall 2 in the research). Not verified: delivering a real Ctrl+C to the wrapper (flagged D5).

## Self-Check: PASSED

- Files exist: test/e2e.mjs, test/package.json, test/portfolio-charts.spec.ts
- Commits reachable from HEAD: e1311d2, 927d50d
- Both verify commands and all acceptance greps from Task 1 and Task 2 re-run and passing.
