# Phase 6: One-Command Launch & Full Verification - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md. This log preserves the alternatives considered.

**Date:** 2026-10-09
**Phase:** 6-one-command-launch-full-verification
**Areas discussed:** E2E test container, SSE reconnect test, Start script behavior, Persistence proof

---

## E2E test container

| Option | Description | Selected |
|--------|-------------|----------|
| Throwaway test container | Same image, separate compose project, mock env, fresh DB each run | ✓ |
| The normal run container | Tests hit whatever `start` launched; mutates user data | |
| You decide | Claude picks during planning | |

| Option | Description | Selected |
|--------|-------------|----------|
| One npm script wraps it | compose up, wait for health, run Playwright with BASE_URL, always tear down | ✓ |
| Playwright globalSetup/teardown | Docker lifecycle in playwright.config | |
| Manual two-step | Documented commands only | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep both | Local uvicorn mode stays as dev loop; container run is the official proof | ✓ |
| Container only | Drop webServer from the config | |

| Option | Description | Selected |
|--------|-------------|----------|
| Shared DB, assert deltas | No new API surface; tests set up their own state | ✓ |
| Test-only reset endpoint | `POST /api/test/reset` under LLM_MOCK | |
| Fresh container per spec file | Full isolation, slower | |

**Notes:** Later isolation choice (project name + port env vars) refines "no named volume": the test project gets its own project-scoped volume, removed with `down -v` at teardown.

---

## SSE reconnect test

| Option | Description | Selected |
|--------|-------------|----------|
| Restart the test container | Real server-side drop via `docker restart`; container mode only | ✓ |
| Block the stream in the browser | page.route abort then unroute | |
| Both | Browser-level plus container restart | |

| Option | Description | Selected |
|--------|-------------|----------|
| Dot cycle + ticks + data intact | Dot leaves and returns to green without reload, prices tick, header cash/total unchanged | ✓ |
| Dot cycle + ticks only | Literal §12 wording | |

---

## Start script behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Only if missing, --build forces it | `compose up -d`; `--build` / `-Build` rebuilds | ✓ |
| Always `compose up -d --build` | Never stale, slower starts | |

| Option | Description | Selected |
|--------|-------------|----------|
| Run anyway, warn | env_file `required: false`, one-line note about OPENROUTER_API_KEY | ✓ |
| Copy .env.example, then run | Creates .env on first run | |
| Fail with a message | Block launch until .env exists | |

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, after health is green | Wait for /api/health, print URL, open; `--no-open` skips | ✓ |
| Print URL only | Never opens a browser | |
| Open immediately | May load before the server is up | |

| Option | Description | Selected |
|--------|-------------|----------|
| No, leave it to manual docker build | Compose builds without secrets; README keeps the manual line | ✓ |
| Yes, opt-in via env var | Compose passes a CA build secret when set | |

---

## Persistence proof

| Option | Description | Selected |
|--------|-------------|----------|
| Scripted check in the phase gate | Real start/stop scripts under its own project; asserts trade, cash, chat survive | ✓ |
| Playwright E2E test | Drive stop/start from TypeScript | |
| Manual UAT only | By hand during verify-work | |

| Option | Description | Selected |
|--------|-------------|----------|
| Document the command only | README gives `docker compose down -v` | ✓ |
| Stop script --reset flag | Destructive option on the stop script | |
| Nothing | Not needed | |

| Option | Description | Selected |
|--------|-------------|----------|
| Project name + port env vars | One compose file, project-scoped volume, `FINALLY_PORT` | ✓ |
| Separate compose files | `test/docker-compose.e2e.yml` | |

---

## Claude's Discretion

- File layout for the e2e wrapper and the persistence check, env var names, ports and timeouts
- Mechanism for pinning the mock env in the test project (precedence must be verified)
- Which start script(s) the persistence check drives on this machine
- New spec split, and the depth of the TEST-04/TEST-05 gap audit

## Deferred Ideas

None.
