---
phase: 06-one-command-launch-full-verification
plan: 01
subsystem: infra
tags: [docker-compose, powershell, bash, volume, healthcheck]
status: complete

requires:
  - phase: 01-walking-skeleton
    provides: Dockerfile with HEALTHCHECK on /api/health, non-root user, DB_PATH=/app/db/finally.db
provides:
  - docker-compose.yml run definition (project finally, loopback port from FINALLY_PORT, optional .env, project-scoped volume)
  - test/compose.e2e.yml additive override with literal mock pins and image finally-e2e
  - Four idempotent start/stop wrappers (Windows PowerShell, macOS/Linux bash)
  - README Run section
affects: [06-02, 06-03, 06-04, 06-05]

actuals:
  tokens: 1800
  tasks: 3
  commits: 3
plan_head_before: e5085cc9b1e3ba9168e14d8300b979560c5518d6
commits: 3
plan_head_after: 88c196a849047c767a80aa9c6108523080e3ca45

tech-stack:
  added: []
  patterns:
    - "Compose file layering for tests: base file first, test/compose.e2e.yml second, literals beat env_file and the caller's shell"
    - "Scripts stay thin: docker compose up -d --wait plus docker compose port finally 8000 for the real URL"

key-files:
  created:
    - docker-compose.yml
    - test/compose.e2e.yml
    - scripts/start_windows.ps1
    - scripts/stop_windows.ps1
    - scripts/start_mac.sh
    - scripts/stop_mac.sh
  modified:
    - README.md

key-decisions:
  - "Compose project name finally with unprefixed volume finally-data gives finally_finally-data by default and a private volume per COMPOSE_PROJECT_NAME"
  - "Port published on 127.0.0.1 only; DB_PATH pinned literally so an empty DB_PATH from .env cannot move the database off the volume"
  - "E2E override uses image finally-e2e so automated builds never retag the user's finally image"

patterns-established:
  - "Private-project probes: COMPOSE_PROJECT_NAME, FINALLY_PORT and COMPOSE_FILE with COMPOSE_PATH_SEPARATOR=';' drive the real scripts without touching user data"

requirements-completed: [PKG-02, PKG-03, PKG-04]

coverage:
  - id: D1
    description: "docker-compose.yml: loopback port from FINALLY_PORT, optional env_file, literal DB_PATH, named volume at /app/db"
    requirement: "PKG-02"
    verification:
      - kind: other
        ref: "docker compose config -q; merged-config JSON check printed 'pins and loopback ok'"
        status: pass
    human_judgment: false
  - id: D2
    description: "Windows start/stop pair builds on demand, waits for health, prints the real URL, removes the container and keeps the volume"
    requirement: "PKG-04"
    verification:
      - kind: other
        ref: "start_windows.ps1 -Build -NoOpen then stop_windows.ps1 under project finally-probe06 on port 8011 (exit 0, URL printed, /api/health ok, volume survived, user volumes and finally:* image ids unchanged)"
        status: pass
    human_judgment: false
  - id: D3
    description: "macOS/Linux start/stop pair behaves the same; second start keeps the container, second stop exits 0, unknown flag exits 2; mode 100755 and LF in the index"
    requirement: "PKG-03"
    verification:
      - kind: other
        ref: "bash start_mac.sh --no-open twice, stop_mac.sh twice, --bogus under project finally-probe06 on port 8012; git ls-files -s and --eol"
        status: pass
    human_judgment: false
  - id: D4
    description: "README Run section covering start, stop, rebuild, no-open, FINALLY_PORT, optional .env, fresh start, Unblock-File, old volume note"
    requirement: "PKG-03"
    verification:
      - kind: other
        ref: "grep chain from Task 3 verify"
        status: pass
    human_judgment: false
  - id: D5
    description: "Real macOS/Linux behavior of open, xdg-open and docker compose port output, and the Docker-not-running message path"
    requirement: "PKG-04"
    verification: []
    human_judgment: true
    rationale: "Only Git Bash on Windows was available; the Docker-not-running branch needs Docker stopped and was verified by reading the script only"

duration: 12 min
completed: 2026-10-09
---

# Phase 6 Plan 01: One-Command Launch Summary

**Compose run definition plus four thin start/stop wrappers that build on demand, wait for the image healthcheck, print the real published URL and keep the data volume across stops.**

## Performance

- **Duration:** about 12 min
- **Completed:** 2026-10-09T23:30Z
- **Tasks:** 3 (1 tracer, 2 auto)
- **Files:** 7 (6 created, 1 modified)

## Accomplishments

- `docker-compose.yml`: service `finally`, `build: .`, loopback-only port `127.0.0.1:${FINALLY_PORT:-8000}:8000`, optional `.env`, literal `DB_PATH`, project-scoped volume. This closes the STATE.md Phase 6 blocker (empty `DB_PATH` from a copied `.env`) for the compose path.
- `test/compose.e2e.yml`: literal pins for `LLM_MOCK`, `SIM_SEED`, `SIM_EVENT_PROBABILITY`, `MASSIVE_API_KEY`, image `finally-e2e`. Verified to beat a hostile shell (`LLM_MOCK=false`, `MASSIVE_API_KEY=shellkey`).
- Tracer proven end to end on a real container (project `finally-probe06`, port 8011): start script built the image, waited for Healthy, printed the URL, `/api/health` returned ok, stop script removed the container and kept `finally-probe06_finally-data`. The user's `finally-data` volume and `finally:*` image ids were identical before and after.
- Bash pair proven through Git Bash on port 8012: second start kept the same container id and printed the same URL, second stop exited 0, unknown argument exited 2. Index mode 100755, LF.
- README gains a `## Run` section; the Development "Docker:" block now points to it and keeps the `extra_ca` TLS line.

## Task Commits

1. **Task 1 (tracer): compose, override, Windows pair** - `7fc256f`
2. **Task 2: macOS/Linux pair with exec bit** - `c2f685e`
3. **Task 3: README Run section** - `88c196a`

## Deviations from Plan

None - plan executed exactly as written.

Notes (not deviations):
- `test/compose.e2e.yml` is not matched by the `.gitattributes` pattern `docker-compose*.yml`, so with `core.autocrlf=true` git warns that the working copy will become CRLF. The index copy is LF and compose parses either; no `.gitattributes` change was made because it is outside this plan's file list.
- The scripts were written with LF on disk; git converts `*.ps1` to CRLF via `.gitattributes`. PowerShell 5.1 ran them fine as written.

## Known Stubs

None.

## Threat Flags

None. T-06-01 (loopback bind), T-06-02 (no env values echoed), T-06-03 (hostile shell does not beat pins) and T-06-04 (private project, explicit `-p`, user volumes and images unchanged) are all covered by the passing verify commands.

## Issues Encountered

None.

## Next Phase Readiness

Plans 06-02 to 06-05 can layer `test/compose.e2e.yml` under project `finally-test` with `FINALLY_PORT=8001`. Unverified here: real macOS/Linux behavior and the Docker-not-running message path (flagged assumption A5).

## Self-Check: PASSED

- Files exist: docker-compose.yml, test/compose.e2e.yml, scripts/start_windows.ps1, scripts/stop_windows.ps1, scripts/start_mac.sh, scripts/stop_mac.sh, README.md
- Commits reachable from HEAD: 7fc256f, c2f685e, 88c196a
- All task verify commands and acceptance criteria re-run and passing; no `finally-probe06` containers or volumes remain.
