# Walking Skeleton — FinAlly (AI Trading Workstation)

**Phase:** 1
**Generated:** 2026-10-06

## Capability Proven End-to-End

A developer starts FinAlly locally (uvicorn serving the Next.js static export) or as one Docker container on port 8000, and a browser shows a dark Tailwind page whose API status reads "ok" from the same-origin `GET /api/health`.

Proven by plan 01-05: `npm --prefix test run smoke` runs it locally, and `BASE_URL=http://localhost:8000 npm --prefix test run smoke` runs it against the container.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Backend framework | FastAPI 0.142 app factory `create_app(settings=None)` run with `uvicorn --factory app.main:create_app`; lifespan sets `app.state.settings`; no module-level app or singletons | Fixed by PLAN.md. The factory avoids import-time `.env` loading and filesystem checks; later phases start market data and DB work inside the lifespan |
| Backend packaging | uv virtual project in `backend/` (no `[build-system]`), dev extra `[project.optional-dependencies] dev`, `uv.lock` committed, Python 3.12 pinned | `uv sync` installs only dependencies; extras stay out of the Docker install; matches `uv sync --extra dev` |
| Frontend framework | Next.js 16.4 static export (`output: "export"`), React 19, TypeScript, Tailwind 4 CSS-first `@theme` tokens; hand-written, no create-next-app | PLAN.md single origin and single port; no SSR to host; the dev-only `/api` proxy is for `next dev` |
| API contract | `planning/API_CONTRACT.md`: one error envelope `{"error": "..."}`, status codes 200/400/404/500, SSE frames keyed by ticker with `change_percent` measured from `session_start_price` (D-01) | One reference for both tiers; any change is an explicit edit to that file |
| Routing | `GET /api/health`, then later routers, then the `/api/{path:path}` 404 catch-all, then `StaticFiles(html=True)` mounted last and only if the export exists | Unknown API paths stay JSON 404 even with the export mounted; the app runs without a frontend build |
| Config | `Settings.from_env()`: env vars plus the project-root `.env` via python-dotenv (`override=False`, so real env wins); `DB_PATH`, `LLM_MOCK`, `SIM_SEED`, `SIM_EVENT_PROBABILITY`, `OPENROUTER_API_KEY`, `MASSIVE_API_KEY`, `STATIC_DIR` | PROJECT decisions 11-12; identical semantics locally and with Docker `--env-file` |
| Data layer | SQLite through stdlib `sqlite3` at `DB_PATH` (default `<root>/db/finally.db`, `/app/db/finally.db` in Docker). **Deferred to Phase 2 (D-03)**: Phase 1 only resolves the path in config | DB-01..03 are Phase 2 requirements. The skeleton proves browser -> static page -> same-origin API instead of a DB read/write |
| Auth | None: one hardcoded user `"default"` | PLAN.md: no login; the schema keeps `user_id` for the future |
| Deployment target | One image, three stages: `node:24-slim` (npm ci + export) -> `python:3.12-slim` + uv 0.12.17 (`uv sync --locked`) -> runtime `python:3.12-slim`. Port 8000, one uvicorn worker, `HEALTHCHECK` on `/api/health`. An optional BuildKit secret `extra_ca` is mounted only in the throwaway stages (D-04) | PKG-01. Builds on this Avast-intercepted machine with TLS verification on; no interception root in the shipped image |
| E2E testing | Host-run Playwright 1.63 in `test/` (D-05). Its `webServer` starts local uvicorn only when `BASE_URL` is unset | Verified working on this machine; no Playwright container (PROJECT section 13 #23 stands) |
| Directory layout | `backend/app/` (one module per concern; routers added above the catch-all), `backend/tests/`, `frontend/src/app/`, `frontend/src/lib/` (typed API calls), `test/` (Playwright), `planning/` (contract and design docs), `db/` (runtime volume target) | PLAN.md section 4; `frontend/src/lib/` is trackable after the 01-01 `.gitignore` fix |

## Stack Touched in Phase 1

- [ ] Project scaffold: uv backend with pytest (01-03), Next.js build (01-04), Playwright runner (01-05)
- [ ] Routing: `GET /api/health`, the `/api` JSON 404 catch-all and the static mount (01-03)
- [ ] Database: **deferred to Phase 2 (D-03)**. No read or write in Phase 1; `DB_PATH` is resolved by `Settings` and set in the Dockerfile
- [ ] UI: the placeholder page calls `getHealth()` from `frontend/src/lib/api.ts` and renders the status (01-04)
- [ ] Deployment: Docker container on port 8000 plus the documented local full-stack command `npm --prefix test run smoke` (01-05)

## Out of Scope (Deferred to Later Slices)

- Database schema, seeding and every DB read or write (Phase 2)
- Market data simulator, Massive poller, price cache and the SSE implementation (Phase 2; the wire format is already frozen in the contract)
- Watchlist, portfolio, trade and chat routes; Pydantic response models and TS types beyond `Health` (Phases 2-5)
- Charts, heatmap, positions table, trade bar and chat panel (Phases 2-5)
- LLM integration and mock mode behavior (Phase 5)
- Frontend unit test runner (Vitest arrives with the first real components)
- `docker-compose.yml`, start/stop scripts, named volume and `--env-file` launch (Phase 6)
- Running the container as a non-root user and volume ownership (Phase 6)

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without changing its architectural decisions:

- Phase 2: Live Market Terminal. The user opens the app and watches the 10 default tickers stream, with flashes, sparklines and a live header (market engine, SSE, seeded SQLite)
- Phase 3: Trading and Watchlist Management. The user buys and sells shares and curates the watchlist, and positions stay priced
- Phase 4: Charts and Portfolio Visualizations. Main ticker chart, P&L treemap and portfolio value history
- Phase 5: AI Trading Copilot. The user chats with FinAlly, which reads the portfolio and executes trades and watchlist changes
- Phase 6: One-Command Launch and Full Verification. Compose, start/stop scripts, persistent volume, and every PLAN.md section 12 unit and E2E scenario green
