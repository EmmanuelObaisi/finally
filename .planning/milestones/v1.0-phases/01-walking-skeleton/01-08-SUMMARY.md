---
phase: 01-walking-skeleton
plan: 08
subsystem: infra
tags: [docker, dockerfile, uv, non-root, gap-closure, buildkit]

requires:
  - phase: 01-walking-skeleton
    provides: three-stage Dockerfile and container smoke (01-05), empty-env and unknown-API-method fixes (01-06), health-status spec (01-07)
provides:
  - docker build fails when uv sync --locked fails (set -e in the backend-build RUN)
  - runtime container runs uvicorn as non-root user app, with /app/db owned by app so a fresh named volume is writable
  - whole container re-proven with the 01-06 and 01-07 fixes inside the image
affects: [phase 2 database path under /app/db, phase 6 compose and named-volume launch, DB_PATH empty-string handling]

actuals:
  tokens: 300
  tasks: 2
  commits: 2
plan_head_before: 99d627a29e7f56bf59198af7b297d62d75895b19
plan_head_after: 139ab9deb370988db3f3f487babf231996d67be4

tech-stack:
  added: []
  patterns:
    - "Build RUN steps that end in cleanup start with set -e so the cleanup cannot mask a failure"
    - "Runtime stage: app code and venv root-owned and read-only, only /app/db owned by the app user"

key-files:
  created: []
  modified:
    - Dockerfile
    - .planning/phases/01-walking-skeleton/01-SKELETON.md
    - .planning/phases/01-walking-skeleton/01-REVIEW-DISPOSITION.md

key-decisions:
  - "Non-root user is a system user app created with useradd --system --user-group; only /app/db is chowned to it"
  - "Image still builds with no BuildKit secret (no TLS interception inside Docker); TLS verification untouched (D-04)"

requirements-completed: [PKG-01]

coverage:
  - id: D1
    description: "A failed uv sync --locked fails docker build (unparseable lock builds with non-zero exit naming that step)"
    requirement: PKG-01
    verification:
      - kind: integration
        ref: "docker build --target backend-build with unparseable uv.lock exits 1; 'uv sync --locked' did not complete successfully"
        status: pass
    human_judgment: false
  - id: D2
    description: "Runtime runs as non-root app; fresh named volume at /app/db is writable and files are owned by app; boots with empty SIM_EVENT_PROBABILITY and SIM_SEED"
    requirement: PKG-01
    verification:
      - kind: integration
        ref: "docker image inspect Config.User=app; docker run with -v finally-gap-db:/app/db -e SIM_EVENT_PROBABILITY= -e SIM_SEED=: health 200, id -u != 0, touch+test -O /app/db/probe"
        status: pass
    human_judgment: false
  - id: D3
    description: "Container serves page and /api/health with one uvicorn process, reports healthy, OPTIONS /api/nope is 404 JSON, host Playwright 4 passed, no CA material in image or history"
    requirement: PKG-01
    verification:
      - kind: e2e
        ref: "BASE_URL=http://localhost:8000 npm --prefix test run smoke (4 passed)"
        status: pass
      - kind: integration
        ref: "docker inspect Health.Status=healthy; docker history and grep -rF of PEM line under /etc/ssl and /app find nothing"
        status: pass
    human_judgment: false
  - id: D4
    description: "WR-01 and WR-02 recorded fixed with the Dockerfile commit; open: 3; SKELETON deployment row states non-root runtime"
    verification:
      - kind: other
        ref: "disposition and SKELETON check script (V5)"
        status: pass
    human_judgment: false

duration: 2min
completed: 2026-10-08
status: complete
---

# Phase 1 Plan 08: Non-root, fail-fast Docker image Summary

**Dockerfile now fails the build on a bad `uv sync --locked` (`set -e`) and runs uvicorn as non-root `app` owning `/app/db`, with the full container re-proven including the 01-06 and 01-07 fixes.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-10-07T23:28:49Z
- **Completed:** 2026-10-07T23:31:30Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- WR-01: `set -e;` ahead of `uv sync --locked` in the backend-build RUN. An unparseable `uv.lock` now exits the build non-zero and BuildKit names the `uv sync --locked` step (before, the trailing `rm -f` forced exit 0).
- WR-02: runtime stage creates system user/group `app`, makes and chowns `/app/db`, then `USER app`. Image `Config.User` is `app`; `id -u` is non-zero in the container; `touch` under a fresh named volume at `/app/db` succeeds and the file is owned by `app`.
- CR-01 inside the image: the non-root container answers `/api/health` 200 with `SIM_EVENT_PROBABILITY=` and `SIM_SEED=` empty.
- Container re-proof: page has `app-title`, exactly one uvicorn process, Docker health `healthy` (HEALTHCHECK now as `app`), `OPTIONS /api/nope` is 404 `{"error":"Not found"}`, host Playwright `4 passed` (smoke plus health-status, no Playwright container), no interception CA in image filesystem (grep as root) or `docker history`.
- Records: WR-01 and WR-02 `fixed (85f71e1)`, `open: 3` (IN-01..IN-03 untouched); SKELETON deployment row states the non-root runtime and the Phase 6 out-of-scope bullet for it is removed.

## Task Commits

1. **Task 1: Non-root image that fails fast (tracer)** - `85f71e1` (fix)
2. **Task 2: Record WR-01/WR-02 fixed, SKELETON update** - `139ab9d` (docs)

**Plan metadata:** committed separately (docs: complete plan)

## Files Created/Modified
- `Dockerfile` - `set -e` in backend-build RUN; runtime `useradd`, `mkdir`, `chown`, `USER app`
- `.planning/phases/01-walking-skeleton/01-SKELETON.md` - deployment row notes non-root `app`; stale out-of-scope bullet removed
- `.planning/phases/01-walking-skeleton/01-REVIEW-DISPOSITION.md` - WR-01/WR-02 fixed, `open: 3`, updated date

## Decisions Made
- Kept the optional `extra_ca` secret plumbing unchanged; the build ran without it (no interception inside Docker, per 01-05).
- Left `/app/.venv`, `/app/app`, `/app/static` root-owned (least privilege); only `/app/db` is writable by `app`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- During startup polling `curl` printed `(52) Empty reply from server` once before the app was ready; `--retry-all-errors` absorbed it and the checks passed. Not a defect.

## Known Stubs

None.

## Threat Flags

None. Threat register mitigations T-01-24 (USER app), T-01-25 (set -e, failing-lock build), T-01-26 (chown /app/db, volume write as app) are all applied and verified.

## Open observation (carried from plan, not fixed here)
A `.env` copied from `.env.example` would pass `DB_PATH=` as an empty string, overriding the image `ENV DB_PATH`. Under the 01-06 rule the app falls back to `ROOT_DIR/db/finally.db`, which is `/db/finally.db` in the image (outside the `/app/db` volume, not writable by `app`). Harmless in Phase 1 (no database); Phase 2 (DB-01) or Phase 6 (PKG-02) must resolve it.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 1 gap-closure plans 01-06, 01-07, 01-08 are complete; image is non-root and lockfile-guarded.
- The interrupted-build backstop truth from 01-05 remains with human verification (01-VERIFICATION.md).

## Self-Check: PASSED

- Dockerfile contains `USER app`, `chown app:app /app/db`, `set -e` before `uv sync --locked`: FOUND
- Commits `85f71e1` and `139ab9d` are ancestors of HEAD: FOUND
- No containers named `finally-*` and no `finally-gap-db` volume remain: confirmed

---
*Phase: 01-walking-skeleton*
*Completed: 2026-10-08*
