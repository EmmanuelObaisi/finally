# Project Research Summary

**Project:** FinAlly (AI Trading Workstation)
**Domain:** Single-user simulated trading terminal with live SSE prices and an agentic LLM copilot
**Researched:** 2026-10-06
**Confidence:** HIGH for stack and scope; MEDIUM for integrations; LOW (spike-flagged) for Windows App Control and Docker-build TLS

## Executive Summary

FinAlly is a single-container, single-user paper-trading workstation. A FastAPI process runs an in-process market data task (GBM simulator by default, Massive REST optionally). That task writes to an in-memory price cache, which feeds an SSE stream. SQLite holds cash, positions, trades, snapshots and chat history. An LLM copilot (LiteLLM -> OpenRouter -> Cerebras `gpt-oss-120b`) returns structured JSON, and the server auto-executes the trades and watchlist changes in it. A static Next.js export is served from the same origin. The stack is fixed by PLAN.md. Research pinned current versions and verified the risky idioms in a scratch build: FastAPI native SSE, Next 16.4 static export with Tailwind v4, Lightweight Charts v5, d3-hierarchy treemap, Vitest, and the LiteLLM structured-output call shape.

The recommended approach is dependency-driven:
1. Scaffold the repo, freeze the contract, and prove a walking-skeleton Docker build early.
2. Build market data plus SSE, with the DB layer alongside it.
3. Build the portfolio and watchlist services plus REST. The contract freezes here.
4. Build LLM chat, mock first.
5. Build the frontend.
6. Package it and run the full unit and E2E suites.

A single trade service is shared by REST and the LLM. A single `tracking` module enforces the tracked-ticker rule (watchlist ∪ positions).

Main risks:
- Contract drift between the planning docs.
- Float money math.
- Blocking calls in async routes: sync sqlite or `litellm.completion` stall the simulator and SSE.
- Cerebras strict-schema limits.
- Lightweight Charts v5 API changes that agents get wrong from memory.
- Machine-specific issues: TLS interception inside Docker builds, and App Control possibly blocking host-run Playwright.

All are mitigable. The Windows and Docker issues need an early spike.

## Key Findings

### Recommended Stack

Versions were verified against live registries on 2026-10-06. See STACK.md for the full table, idioms, and what not to use.

**Core technologies:**
- **Python 3.12 + uv 0.12.17:** backend runtime and package manager. Commit `uv.lock` and build with `uv sync --locked`.
- **FastAPI 0.142.2 (Starlette 1.7.0) + uvicorn 0.54.0:** API, native SSE through `fastapi.sse` / `EventSourceResponse` (built in since 0.135, with a 15 s keep-alive). No `sse-starlette`. Run exactly one worker.
- **Pydantic 2.13.5:** request and response models and the LLM response schema.
- **stdlib `sqlite3`:** WAL mode, sync `def` routes or a threadpool, `BEGIN IMMEDIATE` for trades. No ORM and no aiosqlite.
- **numpy 2.5.3:** correlated GBM (Cholesky).
- **massive 2.8.0:** optional real data. It uses certifi, so it likely needs `truststore` locally.
- **LiteLLM 1.104.0:** pin it exactly, because 1.82.7 and 1.82.8 were a supply-chain compromise. Call `acompletion` with a Pydantic `response_format`, `reasoning_effort`, and `extra_body` provider routing to Cerebras. Never use sync `completion()` in async routes.
- **python-dotenv 1.2.4:** loads the root `.env` in local dev.
- **Backend tests:** pytest 9.1.1, pytest-asyncio 1.4.0, httpx 0.28.1. Lint with ruff 0.16.10.
- **Node 24 LTS (`node:24-slim`):** frontend build stage.
- **Next.js 16.4.0, React 19.3.0, TypeScript 7.0.2:** `output: 'export'` with client components only. Fall back to 16.3.x or TS 6.0.3 if needed.
  - Do not use `create-next-app`, because it enables Cache Components by default.
  - Avoid the `npm init` `"type": "commonjs"` trap.
  - Do not use `next/font/google`.
- **Tailwind 4.3.3:** CSS-first `@theme` dark palette.
- **lightweight-charts 5.2.1:** sparklines, main chart, P&L chart.
  - Use `chart.addSeries(LineSeries)` and `UTCTimestamp` seconds.
  - Times must be strictly ascending.
  - Call `chart.remove()` on unmount.
- **d3-hierarchy 3.1.2:** treemap layout (`treemap` + `treemapSquarify`) rendered as React divs. It is about 136 KB, versus 7.4 MB for Recharts. Do not install the unrelated `d3-treemap` package.
- **Frontend tests:** Vitest 5.0.3, React Testing Library 16.3.3, jest-dom, user-event, jsdom 30.1.2, plus an explicit `@testing-library/dom`.
  - jsdom has no `EventSource` and no canvas, so fake EventSource and use `vi.mock("lightweight-charts")`.
- **Playwright 1.63.0:** E2E against the running container.

### Expected Features

Scope is fixed by PLAN.md, with the §13 proposals adopted. See FEATURES.md for categories A-F, complexity and dependencies.

**Must have (table stakes, all in PLAN.md):**
- **Live data:** price stream with up/down flash, sparklines, main chart for the selected ticker, connection status dot.
- **Watchlist:** CRUD with validation, 10 default tickers.
- **Trading:** market buy/sell with cash and share validation, fractional shares.
- **Portfolio:** positions table, treemap heatmap, P&L history chart, header with live total value and cash.
- **AI chat panel:** loading state and inline action confirmations.
- **Ops:** lazy DB init and seed, health endpoint, one-command Docker start.

**Implied table stakes, not spelled out in PLAN.md (cheap, write as requirements):**
- Trade bar shows inline error and success messages, with buttons disabled while a request is in flight.
- Empty states for the watchlist, positions, treemap and P&L chart.
- Show "--" before the first price arrives, never NaN or 0.
- A shared currency, quantity, sign and percent formatter with tabular numerals.
- A default selected ticker on load.
- Chat: Enter to send, auto-scroll, per-action success and failure lines, and a UI refresh from the portfolio state returned in the chat response.
- A seed snapshot so the P&L chart has data on first launch.
- Bounded sparkline buffers.
- Stable `data-testid` hooks.
- A seedable simulator RNG (`SIM_SEED`, `SIM_EVENT_PROBABILITY`) for deterministic tests.
- Mock LLM keywords covering buy, sell, watchlist add/remove, and a plain analysis reply.

**Differentiators:**
- The AI copilot that acts: it auto-executes trades and watchlist changes, where competitor AI features are read-only.
- Portfolio-aware chat context.
- Treemap heatmap.
- Correlated simulator with dramatic events.
- Bloomberg-style dense layout.

**Anti-features (deliberately not built):** auth or multi-user, limit/stop orders, shorting, margin or options, fees, trade-history UI (the `trades` table stays an audit log), alerts, OHLC candles, timeframes or indicators, analytics such as Sharpe or a backtester, realized-P&L or tax lots, token streaming, confirmation dialogs, an LLM tool-calling loop, per-tick price persistence, settings, and a light theme.

### Architecture Approach

See ARCHITECTURE.md. There is one FastAPI worker. A `create_app()` factory and lifespan hold a `Services` object on `app.state`.

- **Startup:** DB init, then initial tickers (watchlist ∪ positions), then `source.start`, then serve.
- **Shutdown:** cancel tasks and end SSE generators.
- **Import direction:** `routes -> llm.chat -> portfolio -> {db, market}`. `market` and `db` are leaf packages, and `llm` prompt, client and mock are pure modules.
- **Code location:** `backend/app/` (`app/db/` rather than PLAN.md's `backend/db/`, matching MARKET_INTERFACE.md).
- **Static mount:** goes last, with an absolute path, and only if the directory exists.
- **Errors:** domain errors map to 400 and 404 `{"error": ...}`, and the 422 handler is overridden to return 400.

**Major components:**
1. **`market/`:** models, `PriceCache` (versioned), `MarketDataSource` interface, seed prices, GBM simulator, Massive poller, factory, SSE stream generator (emits on cache version change).
2. **`db/`:** schema with natural primary keys, idempotent lazy init and seed, including an initial $10,000 snapshot. Repositories for profile, watchlist, positions, trades, snapshots and chat.
3. **`portfolio/`:**
   - `tracking.py` is the only caller of `source.add_ticker` and `remove_ticker`. `sync(ticker)` reads watched/held state from the DB, and `ensure_priced` validates new tickers.
   - `execute_trade` does the async resolution first, then one synchronous `BEGIN IMMEDIATE` transaction, then runs `finally: sync(ticker)`. Quantities are rounded, and a position is deleted below an epsilon.
   - Valuation and snapshots also live here.
4. **`llm/`:** strict-friendly Pydantic schema (`extra="forbid"`, lists default to `[]`), prompt builder (portfolio context plus the last 20 messages), `call_llm` seam (real `acompletion` or deterministic mock), and an orchestrator that executes actions through the shared services and records per-action results.
5. **`routes/`:** system/health, stream, portfolio (GET, trade, history), watchlist (GET/POST/DELETE), chat (POST, plus the recommended GET history). Trade and chat responses return portfolio state.
6. **Frontend:**
   - One root `EventSource` in a store (Zustand or `useSyncExternalStore`) holding per-ticker ring buffers and connection status.
   - Watchlist membership comes from `GET /api/watchlist`, not from SSE keys.
   - Portfolio value is derived on the client from live prices.
   - The P&L chart re-fetches history every 30 s.
   - In dev, an env-conditional `next dev` rewrite proxies `/api` to uvicorn. Verified, including SSE, with `compress: false`.

### Critical Pitfalls

See PITFALLS.md: 33 pitfalls, 19 critical, mapped to phases.

1. **Contract drift.**
   - PROJECT.md says `change_percent`, but MARKET_INTERFACE.md says `day_change_percent` / `reference_price`.
   - There is no chat-history endpoint.
   - Freeze one contract in the first phase and add contract tests.
2. **Blocking the event loop.** Sync sqlite or sync `litellm.completion` in `async def` routes stalls the simulator and every SSE client. Use `acompletion`, sync `def` routes, or a threadpool. Never hold a DB transaction across the LLM call.
3. **Money and trade correctness.**
   - Float residue leaves ghost positions and breaks "buy with all cash". Round quantities and use an epsilon.
   - Use `BEGIN IMMEDIATE` and one shared `execute_trade`.
   - The LLM's prose must not claim results. Server-side per-action outcomes override it and are fed back into history.
4. **SSE lifecycle.**
   - Generators block uvicorn shutdown. Use a shutdown event, a heartbeat and `--timeout-graceful-shutdown`.
   - EventSource does not reconnect on a non-200 response or wrong content-type, so re-create it manually when `CLOSED`.
   - Build the cache and source inside the lifespan, not at import.
5. **LLM structured outputs.**
   - Cerebras strict mode needs `additionalProperties:false` and rejects `oneOf`, `pattern`, `format`, `min/maxItems` and `nullable`.
   - OpenRouter falls back to other providers by default. Set `provider.order=["cerebras"]` and `require_parameters=True`.
   - Fence-strip and validate the response, set a timeout, and fail gracefully. Set `LITELLM_LOCAL_MODEL_COST_MAP=True`.
6. **Lightweight Charts v5 and React.**
   - Use the v5 API.
   - Time must be strictly ascending: dedupe per second and use `update()`.
   - Clean up the chart, and give `autoSize` a non-zero container height.
   - Restart the flash animation via `key` or keyframes.
7. **Simulator restarts.** Non-seed tickers get a random price on every restart, which gives nonsense P&L for held tickers. Derive a deterministic price from the ticker.
8. **Packaging and Windows.**
   - Docker:
     - Use the uv two-step `--locked` pattern, with the same `/app` venv path in both stages.
     - Run the venv binary directly, with `--host 0.0.0.0` and one worker.
     - Add a `.dockerignore`.
     - Store SQLite on a named volume.
   - Add `.gitattributes` to force LF line endings.
   - Turn on the OS trust store for each tool, never by disabling verification:
     - uv: `UV_SYSTEM_CERTS=1`.
     - Node: `NODE_EXTRA_CA_CERTS` or `NODE_USE_SYSTEM_CA=1`.
     - massive: `truststore`.
   - Docker-build TLS under Avast is untested.

## Implications for Roadmap

Suggested phase structure. The roadmapper should remap these to granularity "standard" (5-8 phases).

### Phase 1: Foundation and Contract Freeze
**Rationale:** Every later phase depends on a frozen contract and a working toolchain. The riskiest unknowns on this machine are Docker-build TLS and App Control blocking Playwright or native Node binaries, and they are cheapest to find now.
**Delivers:**
- Repo hygiene: remove `backend/static/` and `test/node_modules/`, update `.gitignore`, add `.gitattributes`, fix README/CLAUDE.md status lines.
- `backend/` uv project skeleton with health route and test harness (`uv run python -m pytest`).
- `frontend/` Next 16.4 export skeleton.
- Walking-skeleton multi-stage Docker build.
- Toolchain smoke test: `npx playwright install chromium` on the host.
- Frozen API/SSE contract doc.
**Avoids:** contract drift, late packaging surprises, TLS and App Control blockers.

### Phase 2: Market Data and SSE
**Rationale:** Live prices are the foundation of every UI element and of trade pricing. The design docs are detailed, so this is a rebuild.
**Delivers:**
- Market package in order: models, versioned cache, interface, seed prices, seedable GBM simulator with correlation and events, factory, SSE stream, lifespan wiring.
- Massive poller with free-tier fallback.
- Unit tests per MARKET_SIMULATOR.md §4 and MARKET_INTERFACE.md §13.
**Uses:** FastAPI native SSE, numpy, massive.
**Avoids:** import-time construction, SSE shutdown hang, random restart prices.

### Phase 3: Database, Portfolio and Watchlist APIs
**Rationale:** Can start alongside Phase 2. The trade service is shared by REST and the LLM, so it must exist before chat. The REST contract freezes here, before the frontend is built against it.
**Delivers:**
- Schema with natural primary keys, `DB_PATH`, and lazy idempotent init and seed, including the initial snapshot.
- `tracking.py` enforcing watchlist ∪ positions.
- `execute_trade` with `BEGIN IMMEDIATE` and float quantization.
- Watchlist validation.
- Snapshots after trades and on history requests, with a min-interval guard.
- All portfolio and watchlist routes with error shapes.
- Tests for P&L, edge cases and routes.
**Avoids:** money math errors, stranded positions without prices, lazy-init race.

### Phase 4: AI Chat
**Rationale:** Depends on the services from Phase 3. Mock mode ships with chat because E2E depends on it.
**Delivers:**
- Strict-friendly schema.
- Deterministic keyword mock.
- Prompt builder (portfolio context plus the last 20 messages).
- Orchestrator executing actions through the shared services, with per-action results.
- Persistence, `POST /api/chat`, and `GET /api/chat/history`.
- Real `acompletion` client through the cerebras skill, with graceful failure.
- One live smoke call.
- Tests for parsing, malformed responses and trade validation in the chat flow.
**Avoids:** event-loop blocking, schema rejection, provider fallback, LLM claiming trades that failed.

### Phase 5: Frontend: Live Market UI
**Rationale:** Needs only the SSE and watchlist contracts. Splitting the frontend keeps phases reviewable.
**Delivers:**
- Tailwind v4 dark theme and app shell.
- Price store with a single EventSource and connection status, with manual reconnect.
- Header.
- Watchlist panel with flash animation, sparklines, add/remove, and "--" placeholders.
- Main chart with Lightweight Charts v5.
- Formatters.
- Vitest tests.
**Avoids:** v4 chart API, non-ascending time, SSE dict treated as the watchlist.

### Phase 6: Frontend: Portfolio, Trading and Chat UI
**Rationale:** Builds on the store and the frozen portfolio and chat contracts.
**Delivers:**
- Trade bar with inline errors and in-flight disable.
- Positions table.
- d3-hierarchy treemap.
- P&L chart with 30 s refetch.
- Collapsible chat panel with loading state and inline action confirmations.
- Empty states and `data-testid` hooks.
- Vitest tests.

### Phase 7: Packaging and E2E
**Rationale:** Completes the definition of done: one command, all §12 scenarios green.
**Delivers:**
- Final Dockerfile (Node 24, then Python 3.12, uv `--locked`, one worker, health check) and `.dockerignore`.
- `docker-compose.yml` with a named volume.
- Thin idempotent start/stop scripts for macOS/Linux and Windows.
- Playwright suite on the host covering every §12 scenario, with `LLM_MOCK=true`, `SIM_SEED` and workers:1. It asserts invariants, not ticking prices.
- Concise README.

### Phase Ordering Rationale

- Market data (Phase 2) and DB (Phase 3) are leaf packages with no dependency on each other, so they can run in parallel. Services need both.
- Chat depends on the shared trade and watchlist services, which keeps validation in one place.
- The frontend is built only after the contracts it consumes are frozen. Phase 5 can begin once Phase 2 is done.
- The Docker skeleton goes in Phase 1 so TLS problems show up early, and E2E goes last because it needs everything.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** Docker-build CA injection under Avast (build secret or arg), and whether App Control blocks host Playwright or Next native binaries. If blocked, reverse §13 #23 and run Playwright in a container.
- **Phase 4:** live Cerebras strict-schema behaviour and OpenRouter routing parameters through LiteLLM.
- **Phase 2:** Massive free-tier rate limits (Monday and holiday walk-back) and certifi/truststore.

Phases with standard patterns (research optional):
- **Phase 3:** stdlib sqlite plus FastAPI, well established.
- **Phases 5 and 6:** idioms already verified in the scratch build (Next export, Tailwind v4, Lightweight Charts v5, d3-hierarchy, Vitest).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Registry versions plus a combined scratch build and test run. Docker build untested (Docker Desktop was off). |
| Features | HIGH | Scope fixed by PLAN.md and the §13 decisions. Competitor conventions are MEDIUM. |
| Architecture | HIGH | Derived from PLAN.md, PROJECT.md and the market docs. Frontend chart details are MEDIUM. |
| Pitfalls | MEDIUM-HIGH | Library facts verified via Context7 and official docs. Windows and Docker extrapolations are LOW. |

**Overall confidence:** HIGH for building; LOW on the two machine-specific unknowns, which are spike-flagged.

### Gaps to Address

- **SSE field naming** (`change_percent` vs `day_change_percent` / `reference_price`): freeze in Phase 1. Recommendation: `change_percent` measured from the session-start (seed) price, per the PROJECT.md decision.
- **Chat history on reload:** add `GET /api/chat/history` (recommended, small).
- **Snapshot decision #10:** gives an empty P&L chart on first launch and writes on every GET. Fix with a seeded initial snapshot, a min-interval guard on writes, and a frontend 30 s refetch plus a live "now" point.
- **Host Playwright under App Control:** spike in Phase 1, with the Playwright Docker image as the fallback.
- **Docker-build TLS:** walking skeleton in Phase 1. If builds fail, inject the CA via a build secret. Never disable verification.
- **Failed LLM turns:** recommend not persisting them as normal assistant messages. Decide in Phase 4.
- **ESLint 10 with TS 7:** untested. Treat linting as optional.

## Sources

### Primary (HIGH confidence)
- Project docs: `planning/PLAN.md` (including §13), `.planning/PROJECT.md`, `planning/MARKET_INTERFACE.md`, `planning/MARKET_SIMULATOR.md`, `planning/MASSIVE_API.md`, `.claude/skills/cerebras/SKILL.md`
- npm registry and PyPI JSON, queried 2026-10-06: all versions and peer ranges
- Context7 `/websites/fastapi_tiangolo` and the FastAPI SSE tutorial: native SSE, minimum version 0.135
- Context7 `/vercel/next.js` and the static exports guide, plus the Next 16.4 release blog
- Context7 `/tradingview/lightweight-charts` v5.2.0
- Context7 `/websites/litellm_ai`: Pydantic `response_format`, `extra_body`
- Context7 `/astral-sh/uv-docker-example`: Docker pattern
- Cerebras structured-outputs docs: strict-mode limits
- WHATWG HTML spec §9.2: EventSource reconnection
- Scratch build on 2026-10-06 covering Next export, Tailwind, Lightweight Charts, Vitest, FastAPI SSE, and LiteLLM `mock_response`

### Secondary (MEDIUM confidence)
- OpenRouter provider routing and the gpt-oss-120b endpoints page
- LiteLLM 1.82.7/1.82.8 supply-chain compromise reports (NetSPI, Comet)
- Uvicorn graceful shutdown with open SSE connections
- Node system CA support (`NODE_USE_SYSTEM_CA`)
- Groq community report that gpt-oss-120b ignores the schema on some hosts

### Tertiary (LOW confidence)
- `turbopackUseSystemTlsCerts` superseded: the option is absent in 16.4.0
- App Control effects on Playwright and native Node binaries, and Docker-build TLS under Avast: inference, spike needed
- FastAPI `app.frontend()` SPA helper: unverified, not recommended

---
*Research completed: 2026-10-06*
*Ready for roadmap: yes*
