# Phase 6: One-Command Launch & Full Verification - Research

**Researched:** 2026-10-09
**Domain:** Docker Compose packaging, host-run Playwright E2E against a throwaway container, test-gap closure
**Confidence:** HIGH (every packaging/E2E claim below was run on this machine, not inferred)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**E2E test container**
- **D-01:** The official §12 E2E run targets a **throwaway test container**, never the user's running app. It uses the same image and the same `docker-compose.yml` under its own compose project (e.g. `COMPOSE_PROJECT_NAME=finally-test`) on its own host port (e.g. 8001). Whatever the root `.env` says, it must run with `LLM_MOCK=true`, `SIM_SEED=1`, `SIM_EVENT_PROBABILITY=0` and an empty `MASSIVE_API_KEY`. Its project-scoped volume is removed at teardown (`down -v`), so every run starts from a fresh $10,000 database. Playwright still runs on the host (§13 #23 stands; this is not a Playwright container).
- **D-02:** **One npm script wraps the run**, e.g. `npm --prefix test run e2e`. It brings the test project up with a build, waits for `/api/health`, runs Playwright with `BASE_URL=http://localhost:<test port>`, and **always** tears the project down (`down -v`), including when tests fail. One command proves §12.
- **D-03:** **Keep the local mode.** The existing `webServer` path in `test/playwright.config.ts` (uvicorn plus `frontend/out` on a temp DB, no Docker) stays as the fast dev loop (`npm --prefix test run smoke`). Both modes run the same spec files; only `BASE_URL` differs. The container run is the official proof.
- **D-04:** **Shared database, assert deltas.** All specs share one DB per run, with no test-only reset endpoint and no per-spec container. New tests set up what they need (e.g. buy before sell, or read cash before acting) and assert changes relative to that state. Only the fresh-start test relies on running first, as it does today.

**SSE reconnect test**
- **D-05:** The disconnect is a **real server-side drop**: the test runs `docker restart` on the throwaway test container mid-test. It runs only in the container mode. The e2e wrapper exposes the compose project/container name to the specs (e.g. through an env var), and the test is skipped when that is absent (local mode). The existing browser-level "failing stream shows Offline" test stays as it is.
- **D-06:** The reconnect test must prove all of these: the connection dot leaves `connected` (to `reconnecting` or `disconnected`); it returns to `connected` **without a page reload**; prices tick again afterwards; and header cash and total value match what they were before the restart, which proves refetch-on-reconnect and that the DB survived the restart. `docker restart` keeps the container's volume, so the data must be intact. Order or isolate this test so the restart cannot break other specs.

**Start/stop scripts and compose**
- **D-07:** **Build only if missing.** The start scripts run `docker compose up -d`, which builds automatically the first time. `start_mac.sh --build` / `start_windows.ps1 -Build` passes `--build` to force a rebuild after code changes. Running start twice is harmless.
- **D-08:** **A missing `.env` does not block launch.** Compose declares the env file as optional (`env_file` with `required: false`). The start script prints one note that AI chat needs `OPENROUTER_API_KEY` in `.env`. Prices, trading and charts work, and chat shows its existing "not configured" reply. No file is copied or created for the user.
- **D-09:** **Open the browser after health is green.** The start script waits for `/api/health` (the image already has a HEALTHCHECK), prints `http://localhost:8000` (or the configured port), then opens it (`open` / `xdg-open` / `Start-Process`). `--no-open` / `-NoOpen` skips the open.
- **D-10:** **No CA plumbing in compose.** Phase 1 proved that Docker builds on this machine see no TLS interception. Compose builds without secrets. The README keeps the existing manual `docker build --secret id=extra_ca,src=...` line for machines that need it. TLS verification is never disabled anywhere.
- **D-11:** **Isolation by project name and port env vars.** One `docker-compose.yml`. The SQLite volume is **project-scoped** (no fixed `name:`), so `COMPOSE_PROJECT_NAME` gives each project its own container and volume. The host port comes from an env var (e.g. `FINALLY_PORT`, default 8000). The scripts need no extra code for this. The E2E run and the persistence check use other projects/ports, so the user's app on :8000 and its data are never touched.

**Persistence**
- **D-12:** **A scripted persistence check in the phase gate**, outside the Playwright suite. It runs the real start script under its own compose project and port, makes a trade and a mock chat turn through the API, runs the real stop script, starts again, and asserts that the position, cash and chat history are still present. It then removes its own project and volume. It is automated and repeatable.
- **D-13:** **No reset flag.** The stop script stops and removes the container and never deletes the volume. The README documents one line for a fresh start (`docker compose down -v`).

### Claude's Discretion
- File layout for the e2e wrapper and the persistence check (Node script in `test/`, shell or PowerShell), the exact env var names, test ports and health-wait timeouts.
- How compose pins the mock env for the test project while normal runs follow the root `.env` (interpolation with defaults, a second env file, or similar). Precedence must be verified, not assumed.
- Whether the persistence check drives `start_windows.ps1` on this machine, `start_mac.sh` through Git Bash, or both. Both scripts must exist and stay thin.
- Which new specs to add and how to split them. Gaps found during scouting are listed in `<code_context>`.
- How far TEST-04/TEST-05 need new tests: audit the existing suites against the §12 lists and fill only real gaps.

### Deferred Ideas (OUT OF SCOPE)
None. The discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PKG-02 | SQLite on a named volume at `/app/db`; `.env` reaches the container | Compose named volume + `env_file` (optional) + literal `DB_PATH` pin; persistence across `down`/`up` and `docker restart` proven on this machine (Findings 1, 2, 6) |
| PKG-03 | `docker-compose.yml` + four thin idempotent scripts | Verified prototypes of `start_windows.ps1`, `stop_windows.ps1`, `start_mac.sh`, `stop_mac.sh`; `up -d --wait` is the whole start (Findings 1, 3) |
| PKG-04 | One command launches the app at `http://localhost:8000` | `docker compose up -d --wait` returns when healthy (6-7 s warm); `docker compose port` gives the real port (Finding 3) |
| PUI-08 | Key elements carry stable `data-testid` hooks | Audit: every hook the new specs need already exists; add one hook-contract spec as the guard (Finding 9) |
| TEST-04 | Backend pytest covers API routes | Baseline 327 passed; route coverage audit shows every contract endpoint covered; fill only a matrix-proven gap (Finding 10) |
| TEST-05 | Frontend unit tests cover §12 list | Baseline 345 passed in 26 files; audit maps each §12 bullet to a file; no confirmed gap yet (Finding 10) |
| TEST-06 | Playwright E2E against the container with `LLM_MOCK=true` covers all §12 scenarios | Container run works; two specs are silently skipped in container mode today; sell, chat and reconnect specs verified feasible (Findings 4, 5, 6, 7, 8) |
</phase_requirements>

## Summary

Phase 6 adds no product code. It adds `docker-compose.yml`, four wrapper scripts, an E2E wrapper, a persistence check, three or four new Playwright specs, README updates, and an audit of the existing unit suites. All the risky parts were exercised on this machine (Docker Desktop 29.7.2, Compose v5.4.0, Windows PowerShell 5.1, Git Bash) with throwaway projects named `probe*` and `finally-test`; all of them were removed and the user's `finally-data` volume and `finally:*` images were never touched. The multi-stage build succeeds under Avast with no CA plumbing (`npm ci` added 140 packages, `uv sync --locked` installed 69), which retires the LOW-confidence risk flag in the project CLAUDE.md for Docker builds.

Five findings change what the planner would otherwise write. (1) Two existing specs (P&L chart and heatmap) call `test.skip(!!process.env.BASE_URL, ...)`, so in container mode they are skipped: the official proof of "heatmap and P&L chart" would be vacuous unless the skip condition is changed; with the skip lifted both pass against a fresh container. (2) New specs must sort after the pristine-state specs: Playwright runs files alphabetically, and a file named `chat.spec.ts` would run before `connection.spec.ts` and break the fresh-start and empty-state assertions. (3) D-06 says header total value must match across the restart, but with open positions the restarted simulator resets to its seed prices, so total value only matches exactly when the portfolio is flat; the test should flatten positions through the API first. (4) A `docker restart` with a browser attached takes about 3.5 s and the dot shows `reconnecting` for about 2 s; a blocking `execSync` plus a polled assertion is racy, so record the dot's transitions with a `MutationObserver`. (5) This machine's shell exports `LLM_MOCK` and `OPENROUTER_API_KEY`, and Compose interpolation prefers shell over `.env`; pin the mock env with literal values in an override file rather than `${LLM_MOCK}` interpolation.

**Primary recommendation:** Base `docker-compose.yml` (`name: finally`, `image: finally`, `build: .`, loopback port `127.0.0.1:${FINALLY_PORT:-8000}:8000`, optional `env_file`, literal `DB_PATH`, named volume) plus `test/compose.e2e.yml` with literal mock pins and `image: finally-e2e`; a Node wrapper `test/e2e.mjs` that pre-cleans, brings the project up with `--build --wait`, runs Playwright, and always runs `down -v`; new specs named so they sort after `watchlist` or between the existing groups deliberately.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Launch, stop, build-if-missing | Host tooling (scripts + Compose) | Docker daemon | Scripts stay thin; Compose owns lifecycle and health waiting |
| Persistence (positions, cash, chat) | Database / Storage (SQLite on named volume) | Docker volume driver | Volume survives container removal; `down` without `-v` keeps it |
| Env delivery (`.env`, mock pins) | Compose (`env_file` + `environment`) | Backend `config.py` | Compose decides precedence; backend only reads env and treats empty as unset |
| Port exposure / bind address | Compose `ports` | Host OS firewall | App has no auth, so bind to loopback |
| E2E orchestration (up, wait, test, teardown) | Host Node script | Playwright runner | Host-run Playwright is locked (PLAN §13 #23) |
| SSE drop and reconnect | Browser (`useMarketStream`) | API (SSE endpoint), Docker (`restart`) | Client owns reconnect and refetch; the test injects the failure at the container |
| Test hooks (`data-testid`) | Browser / Client | — | Frontend components own the hooks; specs only consume them |
| Route / unit coverage | API tests (pytest) and Client tests (Vitest) | — | Already written in earlier phases; Phase 6 audits and fills gaps |

## Standard Stack

No new packages. Everything below is already installed and pinned.

### Core
| Library / Tool | Version | Purpose | Provenance |
|----------------|---------|---------|------------|
| Docker Desktop / Engine | 29.7.2 | Build and run | [VERIFIED: `docker --version` and `docker info` on this machine] |
| Docker Compose | v5.4.0 | The run definition (`up -d --wait`, `port`, `down`) | [VERIFIED: `docker compose version`] |
| @playwright/test | 1.63.0 | Host-run E2E | [VERIFIED: `test/package.json` devDependencies `"@playwright/test": "1.63.0"`] |
| Node.js | 26.8.1 on this host (project pins Node 24 in the image) | E2E wrapper, persistence check (built-ins only: `child_process`, global `fetch`) | [VERIFIED: `node --version`] |
| Windows PowerShell | 5.1.26100.9278 (no `pwsh`) | `start_windows.ps1` / `stop_windows.ps1` | [VERIFIED: `$PSVersionTable`] |
| uv | 0.12.17 | Backend tests (`uv run python -m pytest`) | [VERIFIED: `uv --version`] |
| Vitest | 5.0.3 | Frontend unit tests (`npm --prefix frontend test`) | [VERIFIED: run output "RUN v5.0.3"] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `${LLM_MOCK:-}` interpolation in base compose | Literal pins in `test/compose.e2e.yml` | Interpolation lets the user's shell silently override `.env` (this shell exports `LLM_MOCK`); literal pins in an override file are shell-independent. Recommended: override file |
| Shell `sleep`/curl loop for health | `docker compose up -d --wait` | `--wait` uses the image HEALTHCHECK, exits non-zero if unhealthy; no custom loop |
| `restart: unless-stopped` | no restart policy | A restart policy would revive the container after a Docker Desktop restart, surprising for a stop script that promises "removed". Omit |
| Playwright container | Host Playwright | Locked by PLAN §13 #23 |

**Installation:** none.

**Version verification:** no external packages are added, so the registry check is not applicable. [VERIFIED: baseline runs this session: backend 327 passed in 32 s; frontend 26 files / 345 tests passed in 11 s; local Playwright 17 passed in 18 s]

## Package Legitimacy Audit

No external packages are installed in this phase (the planned work uses Docker Compose, Node built-ins, and the already-pinned Playwright 1.63.0). Audit not applicable.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 user                              official proof (npm --prefix test run e2e)
  |                                         |
  | scripts/start_*.sh|ps1                 | test/e2e.mjs  (host Node)
  v                                         v
 docker compose  -f docker-compose.yml      docker compose -p finally-test
   (project "finally", port 8000)             -f docker-compose.yml -f test/compose.e2e.yml
        |                                     (port 8001, mock env pinned, image finally-e2e)
        |  up -d --wait (build if image missing)   |  down -v (pre-clean) -> up -d --build --wait
        v                                          v
  +---------------------------+              +---------------------------+
  | container: uvicorn :8000  |              | container: uvicorn :8000  |
  | env_file .env (optional)  |              | env_file .env (optional)  |
  | DB_PATH=/app/db/...  pin  |              | + LLM_MOCK/SIM_*/MASSIVE  |
  | volume finally_finally-   |              |   literal pins win        |
  |   data -> /app/db         |              | volume finally-test_...   |
  +---------------------------+              +-------------+-------------+
        ^ browser http://localhost:8000                    ^ BASE_URL=http://localhost:8001
                                                           |
                                             playwright test (host, workers 1)
                                               specs in file order:
                                               connection, motion, portfolio-charts (pristine DB)
                                               smoke, [new specs], trade, watchlist, reconnect (last)
                                                  |  reconnect: docker restart <container> mid-test
                                                  v
                                             finally { docker compose ... down -v }  -> exit code of tests
```

### Recommended Project Structure
```
docker-compose.yml            # NEW: name: finally; image: finally; build: .; port; env_file; volume
scripts/
  start_mac.sh                # NEW: thin; --build, --no-open
  stop_mac.sh                 # NEW
  start_windows.ps1           # NEW: -Build, -NoOpen
  stop_windows.ps1            # NEW
test/
  compose.e2e.yml             # NEW: literal mock pins + image: finally-e2e
  e2e.mjs                     # NEW: pre-clean, up --build --wait, playwright, always down -v
  persist.mjs                 # NEW: D-12 persistence check (drives the real start/stop scripts)
  trade-sell.spec.ts          # NEW (sorts before trade.spec.ts; after portfolio-charts and smoke)
  trade-chat.spec.ts          # NEW: mocked AI chat with inline trade
  zz-reconnect.spec.ts        # NEW: runs last; container mode only
  hooks.spec.ts               # NEW (optional): PUI-08 hook-contract guard
  playwright.config.ts        # EDIT: nothing structural; keep webServer switch
  portfolio-charts.spec.ts    # EDIT: change the two BASE_URL skips (Pitfall 1)
  package.json                # EDIT: add "e2e" and "persist" scripts
README.md                     # EDIT: Docker/Development sections, status
```

### Pattern 1: Base compose (verified shape)
**What:** One file defines the run. `name: finally` gives a stable default project name; `COMPOSE_PROJECT_NAME` or `-p` override it.
**Example:**
```yaml
# Source: shape verified by running on this machine; semantics per
# https://github.com/docker/docs/blob/main/content/reference/compose-file/services.md
name: finally
services:
  finally:
    image: finally
    build: .
    ports:
      - "127.0.0.1:${FINALLY_PORT:-8000}:8000"
    env_file:
      - path: .env
        required: false
    environment:
      DB_PATH: /app/db/finally.db
    volumes:
      - finally-data:/app/db
volumes:
  finally-data:
```
Verified behaviours of this shape:
- Project name precedence: `-p` beats `COMPOSE_PROJECT_NAME` beats top-level `name:` [VERIFIED: ran `docker compose config` with all three; printed `name: finally`, `name: finally-test`, `name: xyz`].
- Literal `DB_PATH` in `environment:` beats an empty `DB_PATH=` coming from `.env` via `env_file`: container had `DB_PATH=/app/db/finally.db` [VERIFIED: `docker compose exec finally env` with a `DB_PATH=` line in the env file]. This closes the STATE.md blocker "a `.env` copied from `.env.example` passes an empty `DB_PATH`" for the compose path. The plain `docker run --env-file` path is still affected; the README should say to use compose.
- A missing env file with `required: false` starts fine; chat replies `{"message":"The AI assistant is not configured: OPENROUTER_API_KEY is missing.","actions":[],...}` [VERIFIED: ran with no env file].
- Named volume is created owned by `app:app` (copied from the image dir), so the non-root user can write; `finally.db` is created inside it [VERIFIED: `ls -la /app/db` in the container showed `-rw-r--r-- 1 app app 53248 finally.db`].
- With `image: finally` plus `build: .`: plain `up -d` does NOT build when the tagged image already exists (6 s, no "Building" line), and `up -d --build` rebuilds with cached layers (about 10 s) [VERIFIED: ran both against a tagged image]. This matches D-07 and keeps the README's manual `docker build --secret ... -t finally .` escape hatch working, because compose then uses that image.
- Loopback bind: `127.0.0.1:8007->8000`; `localhost` from Node fetch and from Chromium both reach it [VERIFIED: ran health fetch and the chat spec through `localhost:8007`].

### Pattern 2: E2E override file (literal pins, shell-independent)
```yaml
# test/compose.e2e.yml  -- environment: beats env_file; literals ignore the caller's shell
services:
  finally:
    image: finally-e2e
    environment:
      LLM_MOCK: "true"
      SIM_SEED: "1"
      SIM_EVENT_PROBABILITY: "0"
      MASSIVE_API_KEY: ""
```
Invoke with the base file FIRST so the project directory (and therefore the `.env` read for `${FINALLY_PORT}` interpolation and `build: .`) is the repo root:
`docker compose -p finally-test -f docker-compose.yml -f test/compose.e2e.yml up -d --build --wait` with `FINALLY_PORT=8001` in the child env.
Verified with a deliberately hostile setup (env file with `LLM_MOCK=false`, `SIM_SEED=99`, `MASSIVE_API_KEY=realkey`; shell exporting `LLM_MOCK=false MASSIVE_API_KEY=shellkey`): the merged config showed `LLM_MOCK: "true"`, `SIM_SEED: "1"`, `MASSIVE_API_KEY: ""`, `SIM_EVENT_PROBABILITY: "0"`; the base file alone showed the env-file values and no shell leakage [VERIFIED: `docker compose config` output]. Documented precedence agrees: "`environment` attribute overrides `env_file`" [CITED: github.com/docker/docs/blob/main/content/manuals/compose/how-tos/environment-variables/envvars-precedence.md]. `image: finally-e2e` keeps the E2E rebuild from retagging the user's `finally` image, so the user's app is never recreated by a test run.

### Pattern 3: Start / stop scripts (thin; verified under Windows PowerShell 5.1 and Git Bash)
```powershell
# scripts/start_windows.ps1  (save with CRLF; .gitattributes already has *.ps1 eol=crlf)
param([switch]$Build, [switch]$NoOpen)
Set-Location (Split-Path -Parent $PSScriptRoot)
$flags = @("up", "-d", "--wait")
if ($Build) { $flags += "--build" }
docker compose @flags
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$port = (docker compose port finally 8000) -replace '^.*:', ''
$url = "http://localhost:$port"
if (-not (Test-Path .env)) { Write-Host "No .env found: AI chat needs OPENROUTER_API_KEY in .env." }
Write-Host "FinAlly is running at $url"
if (-not $NoOpen) { Start-Process $url }
```
```bash
# scripts/start_mac.sh  (LF; needs the exec bit: git update-index --chmod=+x scripts/*.sh)
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
flags=(up -d --wait); open_browser=1
for arg in "$@"; do case "$arg" in --build) flags+=(--build) ;; --no-open) open_browser=0 ;; esac; done
docker compose "${flags[@]}"
port=$(docker compose port finally 8000 | head -n1)
url="http://localhost:${port##*:}"
[ -f .env ] || echo "No .env found: AI chat needs OPENROUTER_API_KEY in .env."
echo "FinAlly is running at $url"
if [ "$open_browser" = 1 ]; then
  if command -v open >/dev/null; then open "$url"; elif command -v xdg-open >/dev/null; then xdg-open "$url"; fi
fi
```
Stop scripts: `Set-Location ...; docker compose down; exit $LASTEXITCODE` and `cd ...; docker compose down`.
Verified: start twice is harmless (second run prints "Running"/"Healthy" and the URL, exit 0); stop twice is harmless (second prints nothing, exit 0); the named volume survives stop [VERIFIED: ran both PowerShell scripts and both bash scripts against probe projects on ports 8003/8005; `docker volume ls` showed `probe4_finally-data` after stop]. `docker compose port finally 8000` prints `127.0.0.1:<port>` with the loopback bind and honours `COMPOSE_PROJECT_NAME` and `FINALLY_PORT`, so the scripts need no isolation code (D-11) [VERIFIED]. The exec bit is recordable from Windows with `git update-index --chmod=+x` (index mode went 100644 to 100755 in a scratch repo) [VERIFIED].

### Pattern 4: E2E wrapper (Node, built-ins only)
Behaviour the wrapper must have, in order:
1. Environment for every child: `COMPOSE_PROJECT_NAME=finally-test`, `FINALLY_PORT=8001`.
2. Pre-clean: `docker compose ... down -v` first. A hard-killed earlier run leaves a project volume; without pre-clean the "fresh start" specs would run on a dirty DB.
3. `docker compose -f docker-compose.yml -f test/compose.e2e.yml up -d --build --wait` (cwd repo root). Non-zero exit aborts, but still tears down.
4. Run Playwright without `npx`: `process.execPath` with `test/node_modules/@playwright/test/cli.js test` [VERIFIED: file exists and ran this way], env `BASE_URL=http://localhost:8001`, `E2E_FRESH_DB=1`, `E2E_CONTAINER=<id from docker compose ps -q finally>`.
5. `try/finally` plus `SIGINT`/`SIGTERM` handlers: `down -v`; exit with Playwright's exit code.
6. Cheap precedence proof printed once: `docker compose exec -T finally printenv LLM_MOCK` must be `true`, otherwise abort (guards the "verified, not assumed" requirement).

### Anti-Patterns to Avoid
- **Interpolating `${LLM_MOCK:-}` in the base compose `environment:`** to pass the mock flag: the user's shell silently wins over `.env` (this machine's shell already exports `LLM_MOCK` and `OPENROUTER_API_KEY`) [VERIFIED: first probe printed `LLM_MOCK: "false"` with no env file anywhere, so the value came from the shell].
- **Binding `8000:8000`** (all interfaces): the app has no auth and its chat spends the user's OpenRouter credit. Use `127.0.0.1:`.
- **`$ErrorActionPreference = "Stop"` in the `.ps1` files:** Windows PowerShell 5.1 turns native stderr (Compose prints progress to stderr) into errors under `Stop`. The prototype used the default plus explicit `$LASTEXITCODE` checks and worked [VERIFIED: ran]; `Stop` was not tried. Keep the default.
- **Running the official E2E against `localhost:8000`:** violates D-01 and the fresh-start specs would fail against the user's data.
- **Adding a restart policy** to compose (see Alternatives).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Wait until the app is ready | curl/sleep loop in each script | `docker compose up -d --wait` (uses the image HEALTHCHECK; warm start 6-7 s) | Exits non-zero when the container is unhealthy; identical in sh and PowerShell |
| Finding the published port | parsing `.env` for `FINALLY_PORT` in sh and ps1 | `docker compose port finally 8000` | Reflects the real mapping, honours project name and shell overrides |
| Test isolation per project | reset endpoint or DB-delete code | Compose project name + `down -v` | Decided in D-01/D-04/D-11 |
| Pinning mock env | editing `.env` or generating env files | Override file with literal `environment:` | Verified to beat `env_file` and shell |
| Detecting dot transitions | tight `expect` polling around a blocking restart | `MutationObserver` recording `data-status` in the page | The reconnecting window is about 2 s; observer cannot miss it |
| Running the Playwright CLI cross-platform | `npx` / `.cmd` shims with `shell: true` | `node node_modules/@playwright/test/cli.js` | No shell quoting, works on Windows and mac |

**Key insight:** every piece of this phase is a thin composition of Compose features that already exist; each place a custom loop or parser was tempting, a Compose flag covers it.

## Runtime State Inventory

This is not a rename/refactor phase. Omitted per the protocol. One adjacent fact the planner should know: the user already owns a Docker volume `finally-data` and images `finally:latest`, `finally:phase2`, `finally:int`, `finally:skeleton` from earlier `docker run` work [VERIFIED: `docker volume ls`, `docker images`]. The compose volume is `finally_finally-data` (project-scoped), so it will NOT reuse the old `finally-data` volume. That is acceptable (a fresh DB on first compose launch) but the README may mention it. `image: finally` will reuse the existing `finally:latest` tag if present, which could be stale: the first scripted launch on this machine should use `-Build`/`--build`.

## Common Pitfalls

### Pitfall 1: Two E2E specs are skipped in container mode
**What goes wrong:** `portfolio-charts.spec.ts` lines 32-34 and 64-66 call `test.skip(!!process.env.BASE_URL, "needs a pristine database")`. The container run sets `BASE_URL`, so "P&L chart gets points after a trade" and "heatmap tiles" are skipped; the suite reports green with TEST-06's heatmap and P&L scenarios unproven. [VERIFIED: container run output shows `-` for tests 7 and 8, "2 skipped, 15 passed"]
**How to avoid:** Change the guard to skip only when the DB is not known fresh: `test.skip(!!process.env.BASE_URL && !process.env.E2E_FRESH_DB, ...)`, and have `e2e.mjs` set `E2E_FRESH_DB=1`. With the skip lifted, all five tests in that file pass against a fresh mock container [VERIFIED: ran a copy of the spec without the skips against a fresh container: 5 passed].
**Warning signs:** the wrapper's Playwright summary contains "skipped". Make the wrapper fail if any test is skipped in the official run, except `zz-reconnect` skip logic in local mode (which never goes through the wrapper).

### Pitfall 2: New spec filenames sort before the pristine-state specs
**What goes wrong:** Playwright runs files alphabetically with `workers: 1` (observed order: connection, motion, portfolio-charts, smoke, trade, watchlist). `chat.spec.ts` would run first, buy AAPL and break `connection.spec` ($10,000 cash), the P&L `pnl-empty` assertion, and the heatmap `heatmap-empty` assertion. A chat spec that adds a watchlist ticker before `smoke.spec` breaks its "exactly 10 rows in seed order" check.
**How to avoid:** Name new files so they sort after `smoke.spec.ts`: `trade-sell.spec.ts`, `trade-chat.spec.ts`, `zz-reconnect.spec.ts`. Note `trade-*.spec.ts` sorts before `trade.spec.ts` ('-' is 0x2D, '.' is 0x2E). In chat specs use a ticker other than PYPL for add/remove (e.g. "add AMD", then "remove AMD") so `watchlist.spec.ts` ("pypl") is unaffected, and leave no watchlist residue.
**Warning signs:** a failure in `connection.spec` or `smoke.spec` only when run after adding a spec.

### Pitfall 3: D-06 "total value matches" is only exact for a flat portfolio
**What goes wrong:** After `docker restart`, the simulator restarts from its deterministic seed prices (`SIM_SEED=1`), so positions are revalued and `total_value` differs from before, even though cash and positions persisted. Earlier specs leave IBM and NFLX positions in the shared DB, so total value would not match. [ASSUMED mechanism from the Phase 2 simulator design; the cash-identical result was VERIFIED: cash `$9,429.94` before and after restart while `total_value` was `9999.94` with an open position]
**How to avoid:** In `zz-reconnect.spec.ts`, close all positions first through the API (`page.request.get('/api/portfolio')`, then `POST /api/portfolio/trade` sell for each position), so `total_value == cash` exactly and both can be compared literally as D-06 states. Position persistence across a server restart is proven by the D-12 persistence check, which does keep a position.
**Warning signs:** header total off by cents after reconnect while cash is exact.

### Pitfall 4: Reconnect is a short, fast transition; do not poll it
**What goes wrong:** Measured against a container with one open SSE client: `docker restart` took 3.5 s (the `--timeout-graceful-shutdown 3` waits on the open stream); the dot went `reconnecting` at about +3.5 s and `connected` at about +5.6 s. A blocking `execSync("docker restart ...")` followed by `expect(dot).not.toHaveAttribute(...)` can land after or before the window. [VERIFIED: scratch spec output `history [[3527,"reconnecting"],[5574,"connected"]]`, cash identical before/after]
**How to avoid:** Install a `MutationObserver` on `connection-dot` (as in the probe) that appends `data-status` values to `window.__hist`, run the restart asynchronously (`execFile` promise), wait for `connected`, then assert the history contains a non-`connected` value followed by `connected`. Then assert the price text changes (`price-AAPL` differs from a captured value within 10 s) and that `page.url()` was not navigated (no reload: also set `window.__marker = 1` before and assert it still exists after).
**Warning signs:** intermittent "dot never left connected" on a faster machine.

### Pitfall 5: The chat panel is closed at the default Playwright viewport
**What goes wrong:** `ChatPanel` opens by default only when `matchMedia("(min-width: 1536px)")` matches; Playwright's default viewport is 1280 wide, so `chat-input` is not visible. [VERIFIED: `chat-panel` visible by default: false in the probe; `ChatPanel.tsx` mount effect]
**How to avoid:** Click `chat-toggle` first, then `expect(chat-panel).toBeVisible()`.

### Pitfall 6: Absolute assertions on shared DB after earlier specs
**What goes wrong:** D-04 shares one DB. IBM (unwatched buy) and NFLX (held after removal) positions persist after `trade.spec` and `watchlist.spec`. A new spec asserting "no positions" or an exact cash value fails depending on order.
**How to avoid:** Read cash/quantity before acting and assert deltas. For fills, parse the price out of `trade-message` ("Sold 1 MSFT at $420.13") and assert `cash_after == cash_before + qty * price` (`toBeCloseTo(..., 2)`); this was run and passed [VERIFIED: probe spec: `Sold 1 MSFT at $420.13 cash 8549.59 -> $8,969.72`].

### Pitfall 7: Mock keyword precedence in chat messages
**What goes wrong:** The mock matches "malformed", "broke", `add|remove TICKER`, then "buy", then "sell" by substring, first match wins [CITED: planning/API_CONTRACT.md "Mock LLM" table]. A message like "please add a buy of AAPL" triggers the watchlist rule ("add a" matches `add TICKER` with ticker `a`).
**How to avoid:** Use plain messages: `"please buy some apple"` (buys 1 AAPL, reply "Buying 1 AAPL now.") [VERIFIED: probe], `"I am broke, buy a lot"` is wrong because "broke" wins; use `"broke"` alone for the failure case.

### Pitfall 8: Aborted run leaves a dirty test project
**What goes wrong:** Killing the wrapper (or power loss) leaves `finally-test_finally-data` behind; the next run's "fresh start" specs fail with prior trades.
**How to avoid:** Pre-clean with `down -v` at start (Pattern 4 step 2).

### Pitfall 9: PowerShell 5.1 and execution policy
Scripts created locally run under `RemoteSigned` (Process and CurrentUser scopes) [VERIFIED: `Get-ExecutionPolicy -List`; a scratch `.ps1` ran]. A `.ps1` downloaded as a zip from a browser carries a Mark-of-the-Web and would be blocked; the README should give `powershell -ExecutionPolicy Bypass -File scripts\start_windows.ps1` as the fallback line. [ASSUMED: Mark-of-the-Web behaviour is standard Windows behaviour, not exercised here]

### Pitfall 10: Docker Desktop not running
`docker compose` fails with a daemon-connection error. Add a one-line preflight to each start script (`docker info` quietly, then a clear message). Keep it to two lines; scripts remain thin.

## Code Examples

### Reconnect spec core (verified in a scratch spec; restart made async here)
```typescript
// Source: scratch probe run against a throwaway container on this machine
import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);

test.skip(!process.env.E2E_CONTAINER, "container mode only");

test("the stream reconnects after the server restarts, data intact", async ({ page }) => {
  await page.goto("/");
  const dot = page.getByTestId("connection-dot");
  await expect(dot).toHaveAttribute("data-status", "connected");
  // (flatten positions via page.request first so total_value == cash, see Pitfall 3)
  const cash = await page.getByTestId("header-cash").innerText();
  const total = await page.getByTestId("header-total-value").innerText();
  const price = await page.getByTestId("price-AAPL").innerText();
  await page.evaluate(() => {
    (window as any).__marker = 1;
    (window as any).__hist = [];
    const el = document.querySelector('[data-testid="connection-dot"]')!;
    new MutationObserver(() => (window as any).__hist.push(el.getAttribute("data-status")))
      .observe(el, { attributes: true, attributeFilter: ["data-status"] });
  });
  await run("docker", ["restart", process.env.E2E_CONTAINER!]);
  await expect(dot).toHaveAttribute("data-status", "connected", { timeout: 30_000 });
  const hist = await page.evaluate(() => (window as any).__hist as string[]);
  expect(hist.some((s) => s !== "connected")).toBe(true);
  expect(await page.evaluate(() => (window as any).__marker)).toBe(1); // no reload
  await expect(page.getByTestId("price-AAPL")).not.toHaveText(price, { timeout: 10_000 });
  await expect(page.getByTestId("header-cash")).toHaveText(cash);
  await expect(page.getByTestId("header-total-value")).toHaveText(total);
});
```
`E2E_CONTAINER` is the id from `docker compose -p finally-test ps -q finally`, set by `e2e.mjs`.

### Chat spec core (verified in a scratch spec)
```typescript
// Source: scratch probe run; hooks: chat-toggle, chat-input, chat-send, chat-action, chat-message-*
await page.getByTestId("chat-toggle").click();
await expect(page.getByTestId("chat-panel")).toBeVisible();
const before = num(await cash.innerText());
await page.getByTestId("chat-input").fill("please buy some apple");
await page.getByTestId("chat-send").click();
const action = page.getByTestId("chat-action").last();
await expect(action).toHaveAttribute("data-ok", "true");
await expect(action).toContainText(/Bought 1 AAPL at \$[\d,]+\.\d{2}/);
await expect(page.getByTestId("chat-message-assistant").last()).toContainText("Buying 1 AAPL now.");
await expect.poll(async () => num(await cash.innerText())).toBeLessThan(before);
await page.reload();                       // history restored
await page.getByTestId("chat-toggle").click();
await expect(page.getByTestId("chat-message-user").last()).toContainText("please buy some apple");
```
`chat-message-user` / `chat-message-assistant` repeat per message, so always `.last()`; innerText of a message also contains the role label and time, so use `toContainText`. A failing case: message `"broke"` yields an action with `data-ok="false"` and the server text "Insufficient cash" [CITED: API_CONTRACT mock table].

### Sell spec core (verified)
```typescript
await buy("MSFT", "3");                                  // set up: delta based
const c0 = num(await cash.innerText());
const msg = await sell("MSFT", "1");                      // returns trade-message text
const px = num(msg.match(/at (\$[\d,.]+)$/)![1]);
await expect.poll(async () => num(await cash.innerText())).toBeCloseTo(c0 + px, 2);
await expect(page.getByTestId("position-qty-MSFT")).toHaveText("2");
// then sell the remaining 2 -> position-row-MSFT count 0
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Hand-written health-wait loops | `docker compose up --wait` | One flag; exit code reflects health |
| Fixed `container_name` / fixed volume `name:` | Project-scoped names via `name:` / `-p` / `COMPOSE_PROJECT_NAME` | Free isolation for E2E and persistence check |
| `docker-compose` v1 binary | `docker compose` plugin (v5.4.0 here) | Use the plugin syntax everywhere |

**Deprecated/outdated:** `restart:` policies for dev-tool stacks (omit); `links`, top-level `version:` key (omit).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | After a restart the simulator resets to seed prices, so total value changes while cash is identical (cash equality verified, total-value mechanism inferred from Phase 2 design) | Pitfall 3 | If prices instead resumed, literal total-value equality would hold with positions too; the flatten-first approach is still correct, only unnecessary |
| A2 | A downloaded (zone-marked) `.ps1` is blocked under RemoteSigned | Pitfall 9 | If wrong, the bypass line in the README is merely redundant |
| A3 | `$ErrorActionPreference = "Stop"` breaks PowerShell 5.1 native stderr handling | Anti-Patterns | If wrong, nothing breaks; the recommended default also works (verified) |
| A4 | `start_windows.ps1` exits non-zero when the container ends unhealthy (the prototype's `--wait` printed "container ... is unhealthy"; the exit code was masked by a pipe in the probe) | Pattern 3 | If `docker compose up --wait` returned 0 on unhealthy, the script would print a URL for a dead app; add one test with a deliberately broken env (e.g. non-empty bogus `MASSIVE_API_KEY`) in the plan |
| A5 | On macOS/Linux, `open` / `xdg-open` and Docker Desktop port publishing behave as in Git Bash (only Git Bash on Windows was exercised) | Pattern 3 | Mac users could see a different `docker compose port` format; the `${port##*:}` parse handles `0.0.0.0:8000` and `127.0.0.1:8000`, but IPv6 forms (`[::]:8000`) are covered only because of `head -n1` and the loopback bind |

## Open Questions

1. **D-06 literal wording vs. open positions** (see Pitfall 3).
   - Known: cash survives and matches; total value can drift with positions open.
   - Unclear: whether the user wants the test to demonstrate position persistence across `docker restart` as well.
   - Recommendation: flatten first (literal D-06 holds); rely on D-12 for position persistence. No user decision strictly needed.
2. **Override file vs. D-01 "the same `docker-compose.yml`".** The image and base file are the same; the additive `test/compose.e2e.yml` carries only literal pins. This falls under "Claude's Discretion: how compose pins the mock env"; flag it in the plan summary.
3. **First launch on this machine reuses `finally:latest`.** Use `--build` once so the image matches HEAD.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker Desktop (daemon) | all packaging, E2E, persistence | yes | 29.7.2 | none (blocking) |
| Docker Compose plugin | compose, `--wait`, `port` | yes | v5.4.0 | none |
| Node | wrapper, persistence check, Playwright | yes | 26.8.1 | image uses `node:24-slim`; frontend `engines` is `>=24` |
| Playwright Chromium | E2E | yes | `chromium-1208`, `chromium-1243` cached | `npx playwright install chromium` |
| uv | backend tests | yes | 0.12.17 | none |
| Windows PowerShell | `*.ps1` | yes | 5.1 | `pwsh` not installed; scripts must stay 5.1-compatible |
| Git Bash (`bash`) | run `start_mac.sh` here | yes | `/usr/bin/bash` | none |
| Free ports 8000, 8001 | official runs | yes at research time | — | `FINALLY_PORT` |
| TLS interception handling in Docker build | `npm ci`, `uv sync --locked` | works with no CA plumbing | — | README manual `--secret id=extra_ca` line (unchanged, D-10) |

**Docker TLS risk retired:** the three-stage build ran to completion with no secret under Avast: `added 140 packages`, `Installed 69 packages`, Next export built `/` and `/_not-found` [VERIFIED: build log of `docker build -t finally-research:probe .`], then compose-driven builds repeated cached [VERIFIED]. The project CLAUDE.md "LOW (risk flag)" row for Docker builds can be updated to HIGH.

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Backend | pytest 9.1.1, pytest-asyncio (auto mode); config `backend/pyproject.toml` `[tool.pytest.ini_options]` |
| Frontend | Vitest 5.0.3 + RTL + jsdom; config `frontend/vitest.config.ts` |
| E2E | @playwright/test 1.63.0; config `test/playwright.config.ts` (`workers: 1`, `fullyParallel: false`, `BASE_URL` switch) |
| Quick run commands | backend `uv run --directory backend python -m pytest -q` (32 s); frontend `npm --prefix frontend test` (11 s); local E2E `npm --prefix test run smoke` (20 s) |
| Full suite (phase gate) | the three above plus `npm --prefix test run e2e` plus `npm --prefix test run persist` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PKG-02 | Trade, position, chat survive stop/start; `.env` reaches container; stop keeps volume | script (drives real start/stop scripts under a private project/port) | `npm --prefix test run persist` | Wave 0 (`test/persist.mjs`) |
| PKG-03 | Compose file valid; four scripts idempotent (start x2, stop x2) | script | `docker compose config -q` plus `persist` (it runs each twice) | Wave 0 |
| PKG-04 | One command prints and serves `http://localhost:<port>` | script | `persist` asserts `/api/health` on the printed URL | Wave 0 |
| PUI-08 | Every hook the specs use resolves in the running app | E2E | `npm --prefix test run e2e` (hooks spec) | Wave 0 (`test/hooks.spec.ts`, optional) |
| TEST-04 | API route status codes, shapes, errors | unit/integration | `uv run --directory backend python -m pytest -q` | existing, 327 passing; audit matrix is the new artifact |
| TEST-05 | Component rendering, flash, watchlist CRUD, portfolio calcs, chat rendering + loading | unit | `npm --prefix frontend test` | existing, 345 passing; audit matrix is the new artifact |
| TEST-06 | Fresh start; add/remove ticker; buy; sell; heatmap + P&L chart; mocked chat with inline trade; SSE reconnect | E2E (container) | `npm --prefix test run e2e` | existing 17 tests (2 skipped in container today) plus Wave 0 new specs |

### Sampling Rate
- **Per task commit:** the narrow command for the touched area (one pytest file, one Vitest file, or `npm --prefix test run smoke` for spec edits).
- **Per wave merge:** backend + frontend suites + `npm --prefix test run smoke`.
- **Phase gate:** `npm --prefix test run e2e` green with zero skipped tests, `npm --prefix test run persist` green, backend and frontend suites green; then `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `docker-compose.yml`, `scripts/*` (four files) — PKG-02/03/04
- [ ] `test/compose.e2e.yml`, `test/e2e.mjs`, `package.json` scripts `e2e` and `persist` — TEST-06, D-02
- [ ] `test/persist.mjs` — D-12 (spawns `powershell -NoProfile -File scripts/start_windows.ps1 -NoOpen` on win32, `bash scripts/start_mac.sh --no-open` otherwise; env `COMPOSE_PROJECT_NAME`, `FINALLY_PORT`, `LLM_MOCK=true`; uses global `fetch`; always `down -v` in `finally`; also run once with `PERSIST_SHELL=bash` under Git Bash to exercise the `.sh` pair on this machine)
- [ ] `test/portfolio-charts.spec.ts` — change the two `BASE_URL` skips (Pitfall 1)
- [ ] `test/trade-sell.spec.ts`, `test/trade-chat.spec.ts`, `test/zz-reconnect.spec.ts`, optional `test/hooks.spec.ts`
- [ ] A TEST-04/TEST-05 audit matrix (requirement bullet to test file) in the plan SUMMARY, plus tests only for rows the matrix proves uncovered
- Framework install: none needed.

Audit notes for TEST-04 and TEST-05 so the plan scopes this honestly:
- TEST-04: every endpoint in `planning/API_CONTRACT.md` has route tests: health (`test_health.py`), unknown path/any method 404, validation 400 and generic 500 (`test_errors.py`), watchlist GET/POST/DELETE with 400/404 messages (`test_watchlist.py`), `GET /api/portfolio` shape and values (`test_portfolio.py:29-34` asserts `{"cash": 10000.0, "total_value": 10000.0, "unrealized_pnl": 0.0, "positions": []}`; position object keys asserted at `test_portfolio.py:42`), trade 200 shape `["trade","portfolio"]` and 400 envelopes (`test_trading.py:224-248`), history (`test_history.py`), chat shape, 400s, LLM-failure 200s and history (`test_chat.py`, 44 tests), SSE wire format (`market/test_stream.py`, real uvicorn). Possible small gap to confirm with a grep-and-read before adding anything: one place that asserts `GET /api/chat/history` item keys and `GET /api/watchlist` item key set together with status codes in a contract-shaped test. Do not add tests unless the matrix shows a miss.
- TEST-05: `PriceCell.test.tsx` and `store.test.ts` cover price flash; `WatchlistPanel.test.tsx` (41 tests) covers add/remove/re-add/error/refresh; `PositionsTable`, `totals`, `positions`, `portfolioStore` cover portfolio calculations; `ChatPanel*.test.tsx` (43 tests across 3 files) and `chatStore.test.ts` cover rendering and loading state. Treat as satisfied unless the matrix finds a missing §12 bullet.

## Security Domain

`security_enforcement` is enabled (absent/true), ASVS level 1.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Out of scope by design (single user, no auth) |
| V3 Session Management | no | No sessions |
| V4 Access Control | yes (network exposure) | The API is unauthenticated, so publish the port on loopback only: `127.0.0.1:${FINALLY_PORT:-8000}:8000` [VERIFIED works with Node fetch and Chromium via `localhost`] |
| V5 Input Validation | no change | Existing validation from earlier phases; not touched |
| V6 Cryptography / TLS | yes (build and tooling) | Never disable verification; no `UV_INSECURE_HOST`, no `NODE_TLS_REJECT_UNAUTHORIZED=0`, no `-k` anywhere in scripts or wrappers (project rule) |
| V14 Configuration | yes | Secrets only via optional `env_file`; `.dockerignore` already excludes `.env` and `.env.*` (except `.env.example`) and the image contains no env file [VERIFIED: `ls -A /app` showed `.venv app db static`, and `find / -name ".env*"` outside site-packages returned nothing]; container runs as non-root `app` (uid 999) [VERIFIED: `id`] |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthenticated API reachable from the LAN (spends OpenRouter credit) | Elevation / Info disclosure | Loopback-only port publish |
| Secret leakage through logs | Information disclosure | Wrappers must not print `process.env`, must not run `docker compose config` into logs (it prints resolved env values including `OPENROUTER_API_KEY`); the E2E precedence check prints only `LLM_MOCK` |
| Test run touching real user data | Tampering | Project/port isolation; `down -v` only ever targets `finally-test` and the persistence project; never pass the default project to `-v` |
| Host shell env leaking into the container (stale `LLM_MOCK`, keys) | Tampering | Literal pins in the override file; base compose forwards nothing from the shell except the `${FINALLY_PORT}` interpolation |
| Real LLM or Massive calls during tests | Cost / Tampering | `LLM_MOCK=true` and empty `MASSIVE_API_KEY` pinned literally; wrapper asserts `LLM_MOCK=true` inside the container before running |

## Sources

### Primary (HIGH confidence)
- Commands run on this machine this session: `docker build`, `docker compose config/up/down/port/exec/restart`, `docker restart`, `docker run`, `npm --prefix test run smoke`, container-mode Playwright runs, backend and frontend suites, PowerShell and Git Bash script runs (details in the Findings above).
- Files read this session: `06-CONTEXT.md`, `REQUIREMENTS.md`, `STATE.md`, `Dockerfile`, `.dockerignore`, `.env.example`, `.gitattributes`, `README.md`, `test/playwright.config.ts`, `test/package.json`, all `test/*.spec.ts`, `backend/app/config.py`, `backend/app/main.py`, `backend/pyproject.toml`, `frontend/package.json`, `frontend/vitest.config.ts`, `frontend/src/lib/useMarketStream.ts`, `ChatPanel.tsx`, `ChatActionLine.tsx`, `ChatMessageRow.tsx`, `lib/chatActions.ts`, `planning/API_CONTRACT.md`.
- Docker docs via Context7 `/docker/docs`: env precedence page (`envvars-precedence.md`), `env_file` `required` attribute (`compose-file/services.md`).

### Secondary / Tertiary
- None. No claim relies on web search alone. The root `.env` was deliberately not read (secret-read guard); the variable names come from `.env.example`.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH (nothing new; all versions read from pinned files or tool output)
- Architecture (compose, override file, scripts, wrapper): HIGH (prototypes executed)
- Pitfalls: HIGH for 1, 2, 4, 5, 6, 8 (reproduced); MEDIUM for 3 (mechanism inferred, effect observed on cash), 9
- TEST-04/05 gap analysis: MEDIUM (audited by test names and spot reads, not by line-by-line §12 mapping; the matrix is a planned deliverable)

**Research date:** 2026-10-09
**Valid until:** 2026-11-08 (Compose/Docker Desktop behaviour is stable; re-check if Docker Desktop is upgraded)
