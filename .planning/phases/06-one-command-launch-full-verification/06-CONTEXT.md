# Phase 6: One-Command Launch & Full Verification - Context

**Gathered:** 2026-10-09
**Status:** Ready for planning

<domain>
## Phase Boundary

A user launches FinAlly with one command (`docker compose up`, or the start script for their OS). SQLite persists on a named volume at `/app/db`, and `.env` reaches the container. Every PLAN.md §12 scenario is proven green: backend API route tests (TEST-04), frontend unit tests (TEST-05), and the Playwright suite run from the host against the container with `LLM_MOCK=true` (TEST-06), selecting elements by stable `data-testid` hooks (PUI-08).

Requirements: PKG-02, PKG-03, PKG-04, PUI-08, TEST-04, TEST-05, TEST-06.

No new product capabilities. This phase adds run/packaging files, completes the tests and closes test-hook gaps.

</domain>

<decisions>
## Implementation Decisions

### E2E test container
- **D-01:** The official §12 E2E run targets a **throwaway test container**, never the user's running app. It uses the same image and the same `docker-compose.yml` under its own compose project (e.g. `COMPOSE_PROJECT_NAME=finally-test`) on its own host port (e.g. 8001). Whatever the root `.env` says, it must run with `LLM_MOCK=true`, `SIM_SEED=1`, `SIM_EVENT_PROBABILITY=0` and an empty `MASSIVE_API_KEY`. Its project-scoped volume is removed at teardown (`down -v`), so every run starts from a fresh $10,000 database. Playwright still runs on the host (§13 #23 stands; this is not a Playwright container).
- **D-02:** **One npm script wraps the run**, e.g. `npm --prefix test run e2e`. It brings the test project up with a build, waits for `/api/health`, runs Playwright with `BASE_URL=http://localhost:<test port>`, and **always** tears the project down (`down -v`), including when tests fail. One command proves §12.
- **D-03:** **Keep the local mode.** The existing `webServer` path in `test/playwright.config.ts` (uvicorn plus `frontend/out` on a temp DB, no Docker) stays as the fast dev loop (`npm --prefix test run smoke`). Both modes run the same spec files; only `BASE_URL` differs. The container run is the official proof.
- **D-04:** **Shared database, assert deltas.** All specs share one DB per run, with no test-only reset endpoint and no per-spec container. New tests set up what they need (e.g. buy before sell, or read cash before acting) and assert changes relative to that state. Only the fresh-start test relies on running first, as it does today.

### SSE reconnect test
- **D-05:** The disconnect is a **real server-side drop**: the test runs `docker restart` on the throwaway test container mid-test. It runs only in the container mode. The e2e wrapper exposes the compose project/container name to the specs (e.g. through an env var), and the test is skipped when that is absent (local mode). The existing browser-level "failing stream shows Offline" test stays as it is.
- **D-06:** The reconnect test must prove all of these: the connection dot leaves `connected` (to `reconnecting` or `disconnected`); it returns to `connected` **without a page reload**; prices tick again afterwards; and header cash and total value match what they were before the restart, which proves refetch-on-reconnect and that the DB survived the restart. `docker restart` keeps the container's volume, so the data must be intact. Order or isolate this test so the restart cannot break other specs.

### Start/stop scripts and compose
- **D-07:** **Build only if missing.** The start scripts run `docker compose up -d`, which builds automatically the first time. `start_mac.sh --build` / `start_windows.ps1 -Build` passes `--build` to force a rebuild after code changes. Running start twice is harmless.
- **D-08:** **A missing `.env` does not block launch.** Compose declares the env file as optional (`env_file` with `required: false`). The start script prints one note that AI chat needs `OPENROUTER_API_KEY` in `.env`. Prices, trading and charts work, and chat shows its existing "not configured" reply. No file is copied or created for the user.
- **D-09:** **Open the browser after health is green.** The start script waits for `/api/health` (the image already has a HEALTHCHECK), prints `http://localhost:8000` (or the configured port), then opens it (`open` / `xdg-open` / `Start-Process`). `--no-open` / `-NoOpen` skips the open.
- **D-10:** **No CA plumbing in compose.** Phase 1 proved that Docker builds on this machine see no TLS interception. Compose builds without secrets. The README keeps the existing manual `docker build --secret id=extra_ca,src=...` line for machines that need it. TLS verification is never disabled anywhere.
- **D-11:** **Isolation by project name and port env vars.** One `docker-compose.yml`. The SQLite volume is **project-scoped** (no fixed `name:`), so `COMPOSE_PROJECT_NAME` gives each project its own container and volume. The host port comes from an env var (e.g. `FINALLY_PORT`, default 8000). The scripts need no extra code for this. The E2E run and the persistence check use other projects/ports, so the user's app on :8000 and its data are never touched.

### Persistence
- **D-12:** **A scripted persistence check in the phase gate**, outside the Playwright suite. It runs the real start script under its own compose project and port, makes a trade and a mock chat turn through the API, runs the real stop script, starts again, and asserts that the position, cash and chat history are still present. It then removes its own project and volume. It is automated and repeatable.
- **D-13:** **No reset flag.** The stop script stops and removes the container and never deletes the volume. The README documents one line for a fresh start (`docker compose down -v`).

### Claude's Discretion
- File layout for the e2e wrapper and the persistence check (Node script in `test/`, shell or PowerShell), the exact env var names, test ports and health-wait timeouts.
- How compose pins the mock env for the test project while normal runs follow the root `.env` (interpolation with defaults, a second env file, or similar). Precedence must be verified, not assumed.
- Whether the persistence check drives `start_windows.ps1` on this machine, `start_mac.sh` through Git Bash, or both. Both scripts must exist and stay thin.
- Which new specs to add and how to split them. Gaps found during scouting are listed in `<code_context>`.
- How far TEST-04/TEST-05 need new tests: audit the existing suites against the §12 lists and fill only real gaps.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec and requirements
- `planning/PLAN.md` §11 (Docker, volume, start/stop scripts), §12 (unit and E2E scenarios), §13 #22 and #23 (thin compose wrappers; Playwright on the host)
- `.planning/REQUIREMENTS.md`: PKG-02, PKG-03, PKG-04, PUI-08, TEST-04, TEST-05, TEST-06
- `.planning/ROADMAP.md` Phase 6 success criteria
- `.planning/PROJECT.md`: resolved decisions 9 (mock LLM), 11 (`DB_PATH`), 12 (`.env` via `--env-file`), 17 (compose is the run definition)

### Contract
- `planning/API_CONTRACT.md`: endpoint shapes, error envelope, and the mock keyword rules (`buy` = 1 AAPL, `sell` = 1 AAPL, `broke`, `malformed`, `add|remove TICKER`) used by the chat E2E

### Existing run and test infrastructure
- `Dockerfile`: three stages, non-root `app` user, `DB_PATH=/app/db/finally.db`, HEALTHCHECK on `/api/health`, optional `extra_ca` secret in build stages only
- `test/playwright.config.ts`: `BASE_URL` switch vs the local `webServer` with mock env (`SIM_SEED=1`, `SIM_EVENT_PROBABILITY=0`, `MASSIVE_API_KEY=""`, `LLM_MOCK=true`)
- `.env.example`: the env vars the container reads
- `README.md`: run and Docker sections to update

### Prior phase decisions
- `.planning/phases/01-walking-skeleton/01-CONTEXT.md` D-04 and D-05 (Docker TLS handling; host Playwright)
- `.planning/phases/05-ai-trading-copilot/05-CONTEXT.md` D-10 and D-11 (mock keyword precedence and fixed quantities)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- 15 E2E tests in `test/*.spec.ts`: fresh start/connection, price flash, sparklines, main chart select (click and Enter), P&L chart point after a trade, heatmap tiles, all empty states, two concurrent streams, buy, buy unwatched, rejected oversell, add/remove ticker, removing a held ticker, malformed ticker.
- 52 `data-testid` hooks are already in `frontend/src` (header, connection dot/label, trade bar, positions table rows/cells, watchlist rows/add/remove, chat panel/input/send/messages/action/loading, heatmap tiles, P&L panel, main chart).
- Backend pytest suite in `backend/tests/` (route tests for chat, history, portfolio, trading, watchlist, health, errors, plus market tests). Run as `uv run python -m pytest`.
- 26 frontend Vitest files in `frontend/src` (ChatPanel x3, Header, Heatmap, MainChart, PnlChart, PositionsTable, PriceCell, Sparkline, TradeBar, WatchlistPanel, plus lib stores).
- `useMarketStream.ts` already reconnects after a capped backoff, moving through reconnecting and then disconnected, with refetch on reconnect from Phase 2.

### Gaps found (inputs for planning)
- No `docker-compose.yml` and no `scripts/` directory exist yet.
- No E2E for a **successful sell** (cash up, position reduced or removed). Only the rejected oversell exists.
- No **chat E2E** in `test/`: mocked "buy" message, reply appears, inline action line, header/positions update.
- No **real reconnect** E2E: only the "failing stream shows Offline" route-mock test.
- PUI-08: confirm that every element the new specs need has a testid, and add any missing ones.

### Established Patterns
- E2E tests select by `getByTestId`, and the connection dot exposes `data-status` (`connected` / `reconnecting` / `disconnected`).
- Playwright runs with `workers: 1` and `fullyParallel: false`, so the shared-DB order is deterministic.
- Packages are added only through a blocking human package gate with exact pins (Phase 2 decision). The planned work should need no new packages.

### Integration Points
- The compose service builds from the root `Dockerfile` and maps the host port to 8000, with the volume at `/app/db` and the env file `.env`.
- `test/package.json` gets the new `e2e` script next to `smoke`.
- The README "Docker" and "Development" sections are updated with start/stop, `e2e`, the persistence check and `down -v`.

</code_context>

<specifics>
## Specific Ideas

- The start script waits for `/api/health` before opening the browser, so the page never opens to a connection error.
- The reconnect proof covers the full dot cycle without a reload, plus data intact after the restart.
- The user's own data on :8000 must never be touched by any automated check.

</specifics>

<deferred>
## Deferred Ideas

None. The discussion stayed within phase scope.

</deferred>

---

*Phase: 06-one-command-launch-full-verification*
*Context gathered: 2026-10-09*
