---
phase: 06-one-command-launch-full-verification
plan: 04
subsystem: testing
tags: [docker-compose, persistence, powershell, bash, e2e, readme]
status: complete

requires:
  - phase: 06-one-command-launch-full-verification
    provides: "start/stop scripts, docker-compose.yml and test/compose.e2e.yml (06-01); e2e wrapper (06-02); full E2E scenarios (06-03); unit-test audit (06-05)"
provides:
  - "npm --prefix test run persist: real start/stop scripts driven under project finally-persist on port 8002, both shells"
  - "test/compose.broken.yml: override that makes startup fail"
  - "README Phase 6 status line and Testing section"
  - "Green Phase 6 gate on the final code"
affects: [phase 6 verification]

actuals:
  tokens: 6500
  tasks: 3
  commits: 3
plan_head_before: 62ed2a4c87c3ac63df74304852bbd7f0d65d4338
commits: 3
plan_head_after: 901c1f589a6a3a0d09996cf1673cb4fe7d9cef17

tech-stack:
  added: []
  patterns:
    - "Private-project launch check: COMPOSE_PROJECT_NAME, FINALLY_PORT, COMPOSE_FILE and COMPOSE_PATH_SEPARATOR (path.delimiter) in the env of the real scripts; always-run cleanup with down -v on its own project only"
    - "Host-side secret presence is tested in memory and compared with a container-side test -n; only booleans are ever printed"

key-files:
  created:
    - test/persist.mjs
    - test/compose.broken.yml
  modified:
    - test/package.json
    - README.md

key-decisions:
  - "The env_file mismatch message prints the two booleans (host has key, container has key), never a value"
  - "Broken-start proof uses a malformed SIM_SEED layered over the e2e override; verified separately that the container exits with ValueError from int('not-a-number')"

requirements-completed: [PKG-02, PKG-03, PKG-04]

coverage:
  - id: D1
    description: "Real start script builds, waits healthy, prints http://localhost:8002 and /api/health answers; stop removes the container and keeps finally-persist_finally-data"
    requirement: "PKG-04"
    verification:
      - kind: other
        ref: "npm --prefix test run persist (powershell and bash): 'started at http://localhost:8002', 'stop removed the container and kept the volume'"
        status: pass
    human_judgment: false
  - id: D2
    description: "Cash, MSFT 2 and AAPL 1 positions and both chat message ids are identical after stop and start"
    requirement: "PKG-02"
    verification:
      - kind: other
        ref: "persist: cash, positions and chat history survived stop and start (both shells)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Second start keeps the same container and URL; second stop exits 0"
    requirement: "PKG-03"
    verification:
      - kind: other
        ref: "persist: second start kept the same container; persist: second stop is harmless (both shells)"
        status: pass
    human_judgment: false
  - id: D4
    description: "env_file delivers OPENROUTER_API_KEY into the container when the root .env has one (value never printed); mock pins verified inside the container before any chat call"
    requirement: "PKG-02"
    verification:
      - kind: other
        ref: "persist: env_file delivered OPENROUTER_API_KEY to the container; persist: LLM_MOCK=true and MASSIVE_API_KEY empty inside the container"
        status: pass
    human_judgment: false
  - id: D5
    description: "A start that cannot become healthy exits non-zero and prints no URL, in both shells"
    requirement: "PKG-04"
    verification:
      - kind: other
        ref: "persist: a broken start exits non-zero and prints no URL (both shells)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Phase gate: pytest 329 passed, no warnings summary; Vitest 345 passed; export build; smoke 19 passed 1 skipped; container e2e passed 20, skipped 0, failed 0, flaky 0; persist passes in both shells"
    requirement: "PKG-02"
    verification:
      - kind: other
        ref: "gate commands from Task 3 run on the final code"
        status: pass
    human_judgment: false
  - id: D7
    description: "Real launch on the default port 8000 with the browser opening on the user's own project (start, second start, buy, stop, volume listing, start)"
    requirement: "PKG-04"
    verification: []
    human_judgment: true
    rationale: "Plan queues this as a human check: it opens the desktop browser on the user's default project and port, which automated checks must never touch"

duration: 30 min
completed: 2026-10-10
---

# Phase 6 Plan 04: Persistence Check, README Testing and Phase Gate Summary

**`npm --prefix test run persist` drives the real start and stop scripts (PowerShell and bash) under a private project and proves data survives a restart on the named volume, idempotency, `.env` delivery and a loud failed start; the whole Phase 6 gate is green.**

## Performance

- **Duration:** about 30 min
- **Completed:** 2026-10-10
- **Tasks:** 3 (1 tracer, 2 auto)
- **Files:** 4 (2 created, 2 modified)

## Accomplishments

- `test/persist.mjs` (tracer): project `finally-persist`, port 8002, mock pins layered through `COMPOSE_FILE` with `path.delimiter`. Start with build, URL and `/api/health` check, mock pins verified inside the container, a manual MSFT buy and a mock chat buy, snapshot of cash, positions and chat ids, real stop (container gone, volume kept), real restart, field-by-field comparison. Cleanup runs in `finally` with `down -v` on its own project only.
- Task 2 additions: second start keeps the container id and URL, second stop exits 0, OPENROUTER_API_KEY presence compared host versus container with only booleans printed, and a broken start (`test/compose.broken.yml`, malformed `SIM_SEED`) must exit non-zero with no URL. Confirmed separately that the broken container dies on `int('not-a-number')` in `config.py`, so the failure is for the intended reason.
- README: Status names Phase 6 and drops "Not built yet"; new `## Testing` section lists backend, frontend, e2e, smoke and persist (the old smoke paragraph moved there).
- Gate on final code: pytest 329 passed (no warnings summary); Vitest 345 passed; export build green; smoke 19 passed, 1 skipped (container-only reconnect); e2e `passed 20, skipped 0, failed 0, flaky 0`; persist `all checks passed (powershell)` and `(bash)`.
- The user's `finally-data` volume and all `finally:*` image ids were identical before and after each run; no `finally-test` or `finally-persist` container or volume remains; the working tree shows only the three pre-existing uncommitted `.planning` files.

## Task Commits

1. **Task 1 (tracer): persistence check end to end** - `934dbc3`
2. **Task 2: idempotency, env delivery, broken start, bash pair** - `b7db50c`
3. **Task 3: README Status and Testing** - `901c1f5`

## Deviations from Plan

**1. [Rule 3 - Blocker] Host-side `.env` clause of the Task 2 verify command not run**
- **Found during:** Task 2
- **Issue:** The verify command greps the root `.env` from the shell; a PreToolUse secret-read guard blocks any shell command that names `.env`.
- **Fix:** The same host-versus-container agreement is asserted inside `persist.mjs` itself (the check the plan describes in action step 2b), and the run printed `env_file delivered OPENROUTER_API_KEY to the container`. All other clauses of that verify command ran.
- **Files modified:** none
- **Commit:** n/a

**2. [Rule 1 - Bug in my own first draft] Host `.env` regex and mismatch message**
- **Found during:** Task 2
- **Issue:** A mangled regex (`s*S` instead of `\s*\S`) made the host report no key while the container had one. The error message also gave no hint which side disagreed.
- **Fix:** Restored the regex and made the mismatch message print both booleans (no values).
- **Files modified:** test/persist.mjs
- **Commit:** `b7db50c`

**Total deviations:** 1 blocker workaround (verify clause), 1 self-introduced bug fixed before commit. **Impact:** none on scope.

## Known Stubs

None.

## Threat Flags

None. T-06-10: all compose calls pass `-p finally-persist`, the real scripts only run `down`, volumes and `finally:*` image ids compared before and after (identical). T-06-11: neither side prints the key; acceptance grep prints 0. T-06-12: mock pins asserted inside the container before the chat call.

## Issues Encountered

None beyond the deviations above.

## Next Phase Readiness

Phase 6 is ready for verification. Outstanding for the user: the end-of-phase human check (real `start_windows.ps1` launch on port 8000 with the browser, second start, buy, stop, `docker volume ls` showing `finally_finally-data`, start again). Assumption A5 (real macOS/Linux behavior) remains unverified; the `.sh` pair was exercised through Git Bash only.

## Self-Check: PASSED

- Files exist: test/persist.mjs, test/compose.broken.yml, test/package.json, README.md
- Commits reachable from HEAD: 934dbc3, b7db50c, 901c1f5
- Acceptance greps for all three tasks re-run and passing; all five Task 3 automated verify commands exit 0
