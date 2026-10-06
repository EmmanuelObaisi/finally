<!-- GSD:project-start source:PROJECT.md -->

## Project

**FinAlly — AI Trading Workstation**

FinAlly (Finance Ally) is a Bloomberg-style AI trading workstation that runs in a single Docker container. It streams live (simulated or real) market prices, lets the user trade a $10,000 simulated portfolio with market orders, and has an AI chat copilot that analyzes positions and executes trades and watchlist changes by natural language. It is the capstone of an agentic AI coding course, built entirely by coding agents, and is built exactly as `planning/PLAN.md` specifies (with the PLAN.md §13 review proposals adopted).

**Core Value:** One command launches a live, data-dense trading terminal where prices stream, trades fill instantly, and the AI copilot can act on the portfolio — and every specified unit and E2E scenario passes to prove it.

### Constraints

- **Tech stack**: FastAPI + Python 3.12 via `uv`; Next.js + TypeScript static export + Tailwind; SQLite; LiteLLM → OpenRouter/Cerebras — fixed by PLAN.md
- **Deployment**: single container, single port 8000, one origin (no CORS) — students run one command
- **Python tooling**: always `uv run` / `uv add`, never `pip`/`python3` directly — user's mandatory style
- **Code style**: simple, incremental, short modules/functions, no defensive programming, no emojis in code or logs, concise README — user's mandatory style
- **Latest APIs**: use current library APIs (verify with docs) — user requirement
- **Testing**: E2E runs with `LLM_MOCK=true`; no real API calls in tests
- **Security**: TLS verification always stays on; secrets only via `.env` (gitignored)

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## Open decisions, resolved

| Decision | Choice | Why (one line) |
|----------|--------|----------------|
| Treemap library | **`d3-hierarchy` 3.1.2** (`treemap` + `treemapSquarify`) rendering plain React `<div>`s | The layout math is the only hard part; rendering absolutely-positioned tiles gives full control of P&L colors and CSS transitions, adds ~136 KB unpacked (vs 7.4 MB Recharts, 60 MB ECharts), and is trivially unit-testable in jsdom |
| Frontend unit tests | **Vitest 5.0.3 + React Testing Library 16.3.3 + jest-dom 7.0.1 + jsdom 30.1.2** | Vitest is the standard fast runner for a non-Jest TypeScript project; Next 16 has no built-in test runner |
| E2E | **Playwright 1.63.0 on the host** (`@playwright/test`) | Per PLAN.md section 13 #23 |

## Recommended Stack

### Backend core

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Python | 3.12 (`python:3.12-slim` image) | Runtime | Fixed by PLAN.md. LiteLLM supports `>=3.10,<3.15`, so 3.12 is safe |
| uv | 0.12.17 | Package/project manager | Fixed. Always `uv add` / `uv run`; commit `uv.lock`; Docker uses `uv sync --locked` |
| FastAPI | 0.142.2 (Starlette 1.7.0) | REST + SSE + static serving | **Native SSE exists since 0.135.0**: `from fastapi.sse import EventSourceResponse, ServerSentEvent`. Do NOT add `sse-starlette` |
| uvicorn | 0.54.0 (`uvicorn[standard]`) | ASGI server | `[standard]` adds uvloop/httptools on Linux in the container; keep it plain `uvicorn` command, not `fastapi run` |
| Pydantic | 2.13.5 | Request/response models, LLM structured-output schema | Same model class is passed to LiteLLM as `response_format` and used to `model_validate_json` the reply |
| LiteLLM | 1.104.0 | LLM client -> OpenRouter -> Cerebras | Fixed. Follow the project `cerebras` skill exactly (model `openrouter/openai/gpt-oss-120b`, `extra_body={"provider": {"order": ["cerebras"]}}`, `reasoning_effort="low"`, Pydantic `response_format`) |
| SQLite | stdlib `sqlite3` | Persistence | No ORM, no `aiosqlite`: schema is 6 tiny tables; use `def` (sync) route handlers so FastAPI runs them in its threadpool, `PRAGMA journal_mode=WAL`, and `BEGIN IMMEDIATE` around trade execution so cash/position updates are atomic |
| NumPy | 2.5.3 | GBM simulator (Cholesky for correlated moves) | Required by `planning/MARKET_SIMULATOR.md` |
| massive | 2.8.0 | Optional Massive (ex-Polygon) REST client | Official client, replaces `polygon-api-client`; it is synchronous (urllib3), so call it via `asyncio.to_thread` from the poller |
| python-dotenv | 1.2.4 | Load project-root `.env` in local dev | Decision 12 in PROJECT.md. Docker uses `--env-file`, so `load_dotenv()` is a harmless no-op there |

### Backend dev dependencies (`uv sync --extra dev`)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| pytest | 9.1.1 | Unit tests | Run as `uv run python -m pytest` (App Control blocks the bare `pytest.exe` on this machine) |
| pytest-asyncio | 1.4.0 | Async tests (cache, simulator, SSE) | Set `asyncio_mode = "auto"` in `pyproject.toml` |
| httpx | 0.28.1 | Test client | `httpx.ASGITransport` streams SSE incrementally in-process; `fastapi.testclient.TestClient` is fine for non-streaming routes |
| ruff | 0.16.10 | Lint/format (optional) | Matches the "short modules, clear names" style; one tool, no config sprawl |

### Frontend core

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js | 24 LTS ("Krypton", currently 24.21.0); Docker `node:24-slim` | Build stage only | PROJECT.md decision 15. Node 26 is still "Current", not LTS. Next 16 needs `>=20.9`; Vitest 5 needs `^22.12 / ^24 / >=26`; jsdom 30 needs `^24.15` or newer, so keep local Node >= 24.15 |
| Next.js | 16.4.0 (released 2026-10-06) | App Router, static export | `output: 'export'`, Turbopack is the default bundler. Pin exactly in `package-lock.json`; fallback if 16.4.0 misbehaves is 16.3.x |
| React / React DOM | 19.3.0 | UI | Ships with Next 16.4. Types: `@types/react` / `@types/react-dom` 19.3.0 |
| TypeScript | 7.0.2 (native compiler) | Types | Verified: `next build` type-check passes with it. If a tool needs the old JS compiler API, drop to `typescript@6.0.3` |
| Tailwind CSS | 4.3.3 + `@tailwindcss/postcss` 4.3.3 + `postcss` 8.5.x | Styling | v4 style: no `tailwind.config.js`; CSS-first config (see snippet) |
| lightweight-charts | 5.2.1 | Sparklines, main chart, P&L chart (canvas) | v5 API: `chart.addSeries(LineSeries, opts)`. Decision 14 |
| d3-hierarchy | 3.1.2 (+ `@types/d3-hierarchy` 3.1.7) | Treemap layout | See decision table. NOT `d3-treemap` (an unrelated 0.1.0 package) |
| zustand | 5.0.15 | Price store fed by SSE | Optional but recommended: 10 tickers x 2 ticks/s into plain React context re-renders the whole tree; zustand selectors re-render only the changed row and make the price-flash logic trivial |

### Frontend test and E2E tooling

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| vitest | 5.0.3 | Unit/component runner | Needs `vite` ^8 as a peer, so install `vite@8.3.3` explicitly |
| vite | 8.3.3 | Vitest peer | Dev dependency only; Next uses Turbopack, not Vite |
| @vitejs/plugin-react | 6.1.2 | JSX transform in Vitest | Requires vite ^8 |
| jsdom | 30.1.2 | DOM environment | Preferred over happy-dom 20.14.5 for fidelity (flash-class assertions, style reads) |
| @testing-library/react | 16.3.3 | Component rendering | Requires peer `@testing-library/dom` ^10 (install 10.4.2 explicitly) |
| @testing-library/jest-dom | 7.0.1 | Matchers | Import `@testing-library/jest-dom/vitest` in the setup file |
| @testing-library/user-event | 14.6.7 | Trade bar / chat input interaction | |
| @playwright/test | 1.63.0 | E2E | Run on the host against `http://localhost:8000`; needs `npx playwright install chromium` once |
| @types/node | 24.x | Types | Pin to the Node 24 line (npm's default tag is 26) |

## Idioms confirmed against current docs

### FastAPI: native SSE (verified by running it)

- Wire output is `data: {"AAPL": {...}}` + blank line; `id:` is emitted only if you set it. Plain `EventSource.onmessage` receives it; do not set `event=` unless the client uses `addEventListener`.
- FastAPI automatically sends `: ping` keep-alive comments every 15 s and sets `Cache-Control: no-cache` and `X-Accel-Buffering: no`. Do not hand-roll these.
- `data=` is always JSON-encoded (use `raw_data=` for pre-encoded strings). The PROJECT.md payload (dict of all tickers per event) fits directly.
- Client disconnect cancels the generator with `CancelledError`; do `try/finally` cleanup only if the generator holds a subscription.
- App wiring: `lifespan=` async context manager starts/stops the market-data task (not the deprecated `@app.on_event`). Mount static files LAST: `app.mount("/", StaticFiles(directory="static", html=True), name="static")` so `/api/*` routes win.

### LiteLLM: structured outputs (verified offline with `mock_response`)

- `litellm.supports_response_schema(model=MODEL, custom_llm_provider="openrouter")` returns `True`; `response_format`, `reasoning_effort`, `tools` are in the supported params for that model.
- The cerebras skill shows sync `completion(...)`. In an `async def` FastAPI handler use `acompletion` with identical arguments (or call `completion` from a sync `def` handler). A sync call inside `async def` blocks the SSE loop.
- OpenRouter's live endpoint list shows Cerebras serving `openai/gpt-oss-120b` (fp16, 131,072 ctx, 40,960 max completion) with `response_format`, `structured_outputs`, `reasoning_effort` supported. `order` alone still allows OpenRouter to fall back to other providers; add `"allow_fallbacks": False` inside `provider` only if strict pinning is wanted.
- Mock mode (`LLM_MOCK=true`) should short-circuit before LiteLLM is called; LiteLLM's own `mock_response=` argument is handy in unit tests of the parsing path.
- Make the schema fields `trades` / `watchlist_changes` default to `[]` so a model that omits them still validates.

### Next.js 16.4: static export (verified by building)

- `next build` writes the static site to `out/` (817 KB for the scratch app). Docker copies `out/` to the backend's `static/`.
- Rewrites, redirects, headers, proxy (ex-middleware), cookies, server actions, default image optimizer and dynamic routes without `generateStaticParams` are unsupported in export. Use `'use client'` components plus `fetch`/`EventSource` in `useEffect`; guard `window` access.
- Dev loop verified: `next dev` on :3000 with the rewrite above proxied both JSON and a live SSE stream to uvicorn on :8000 incrementally (no CORS). Alternative loop: `next build` and let FastAPI serve `out/`.
- Do NOT enable `cacheComponents`. 16.4's `create-next-app` turns Cache Components on by default and recommends it, but it is a server-rendering/PPR model aimed at apps with a Node server; this project is a pure client SPA. Hand-write the project files (or delete the flag) rather than accepting scaffolder defaults. `create-next-app` also writes `AGENTS.md`/agent-feedback settings; `next dev` printed "Generated AGENTS.md ... Set `agentRules: false` to disable" in the scratch run.
- `next lint` no longer exists in Next 16. If linting is wanted, run ESLint directly with `eslint-config-next` 16.4.0 (flat config); this combination was NOT tested, so treat lint as optional.
- Avoid `next/font/google` (fetches from Google at build time, which breaks offline/intercepted-TLS Docker builds). Use a system monospace stack or `next/font/local`.

### Tailwind v4 (verified: custom colors reached the built CSS)

### Lightweight Charts v5 (verified: compiles under TS 7 and Next export)

- v5 removed `addLineSeries()`; the series type is passed to `addSeries`. Any v4 snippet from older blog posts or model memory is wrong.
- `time` is typed as the branded `Time`; a bare `number` fails type-check (we hit this). Cast to `UTCTimestamp` (UNIX seconds).
- Time must be strictly ascending. With ~500 ms ticks, several ticks share one second: `update()` with the same `time` replaces the last point (fine for the main chart); for sparklines, either dedupe to one point per second or keep a monotonically increasing synthetic time. `setData` with duplicate/descending times throws.
- No official React wrapper; one small `useEffect` component per chart type (sparkline, main, P&L) sharing a theme-options constant. The canvas does not render in jsdom: `vi.mock("lightweight-charts")` in component tests and test data transforms separately.
- Keep the default TradingView attribution logo (library license requires attribution).

### Treemap with d3-hierarchy (verified under Vitest)

### uv in Docker (current official pattern)

### Vitest 5 setup (verified: a treemap component test passes)

- jsdom has no `EventSource`: provide a tiny fake class on `globalThis` in the setup file so price-flash and connection-status tests can emit events.
- Test the flash by asserting the class appears after a price change and using `vi.useFakeTimers()` to assert it is removed.

## Installation

# Backend (from backend/)

# Frontend (from frontend/; hand-written, not create-next-app)

# E2E (from test/; after deleting the committed test/node_modules)

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Treemap | d3-hierarchy + divs | Recharts 3.10.1 `Treemap` | 7.4 MB package for one chart (second charting lib alongside LWC), SVG with `ResponsiveContainer` that renders zero-size in jsdom, custom `content` renderer needed for P&L colors anyway |
| Treemap | d3-hierarchy + divs | ECharts 6.1.0 | 60 MB, has its own canvas renderer/theming, overkill |
| Treemap | d3-hierarchy + divs | `@nivo/treemap` 0.99.0 | Pulls a large nivo core; styling fights Tailwind theme |
| SSE | FastAPI native `EventSourceResponse` | `sse-starlette` 3.5.0 | Redundant since FastAPI 0.135; extra dependency |
| DB access | stdlib `sqlite3` | `aiosqlite` 0.22.1 / SQLAlchemy | Extra layers for 6 tables; violates "do not over-engineer" |
| Frontend tests | Vitest + RTL | Jest | Needs Babel/SWC transform config for ESM + TS; slower; Vitest 5 + Vite 8 is the current default |
| DOM env | jsdom 30 | happy-dom 20.14.5 | Faster but less faithful; only switch if test time becomes a problem |
| Price state | zustand 5 | React context only | Re-renders everything at 2 Hz; acceptable only if the tree is tiny. Plain `useSyncExternalStore` is the zero-dependency alternative |
| Data fetching | plain `fetch` | SWR / TanStack Query | Trade and chat endpoints return fresh portfolio state (PROJECT.md #24); there is nothing to cache or revalidate |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| LiteLLM 1.82.7 / 1.82.8 | Malicious releases published 2026-03-24 after a maintainer-credential compromise (credential-stealing `.pth` payload); quarantined on PyPI | Current 1.104.0, committed `uv.lock`, `uv sync --locked`, bump deliberately. Never run `uv add litellm` unpinned on an unknown date without checking the resolved version |
| `lightweight-charts` v4 API (`addLineSeries`) | Removed in v5 | `chart.addSeries(LineSeries, ...)` |
| `@app.on_event("startup")` | Deprecated in FastAPI | `lifespan=` context manager |
| Sync `litellm.completion` inside `async def` routes | Blocks the event loop, stalling the SSE stream during LLM calls | `await acompletion(...)` |
| `create-next-app` defaults (Cache Components, agent files) | Wrong programming model for a static SPA | Hand-written minimal Next project |
| `next/font/google` | Build-time network fetch; fragile in Docker/TLS-intercepted environments | System font stack or `next/font/local` |
| `d3-treemap` (npm) | Unrelated 0.1.0 package; treemap lives in `d3-hierarchy` | `d3-hierarchy` |
| Docker `node:20` | EOL | `node:24-slim` |
| `fastapi[standard]` in the image | Pulls CLI, jinja2, email-validator, python-multipart we do not use | `fastapi` + `uvicorn[standard]` |
| Any `verify=False` / `NODE_TLS_REJECT_UNAUTHORIZED=0` / `UV_INSECURE_HOST` | Forbidden by user's global rules | Per-stack trust-store opt-in (below) |

## Stack-specific environment notes (this Windows 11 + Avast machine)

| Stack | Observed / required handling | Confidence |
|-------|------------------------------|------------|
| uv | `UV_SYSTEM_CERTS=1` (verified: `uv add` and `uv sync` succeed with it) | HIGH |
| npm / Node | `NODE_EXTRA_CA_CERTS` already points at the Avast cert in this shell; `npm install`/`npm view` work. Playwright browser download runs on Node and should inherit it | HIGH (npm), MEDIUM (Playwright download, not exercised) |
| LiteLLM -> OpenRouter | Works with NO truststore injection on Windows: a bad-key call returned an OpenRouter `401` (so TLS verified) both with and without `truststore.inject_into_ssl()`. Python's stdlib `ssl` on Windows reads the OS store | HIGH |
| `massive` client | Uses urllib3 + certifi, so it will likely hit `CERTIFICATE_VERIFY_FAILED` here; add `truststore` (0.10.4) and call `truststore.inject_into_ssl()` at startup if the Massive path is exercised locally. Not needed in Docker | MEDIUM (not exercised; no Massive key) |
| Next.js / Turbopack | `turbopackUseSystemTlsCerts` does NOT exist in Next 16.4.0's config types or binary. Upstream notes it was superseded: system certs are now picked up by default. Only matters for build-time fetches; avoid those (no `next/font/google`) | MEDIUM |
| Docker builds | Docker Desktop was not running during research, so a containerized `npm ci` / `uv sync` under Avast interception is UNTESTED. If it fails with unknown-issuer, supply the CA via a build secret/arg and `NODE_EXTRA_CA_CERTS` + `UV_SYSTEM_CERTS`/`SSL_CERT_FILE` in the build stages; never disable verification | LOW (risk flag) |
| `VIRTUAL_ENV` | The shell exports `VIRTUAL_ENV=...\finally\backend\.venv`; `uv run` prints a mismatch warning when run from another directory. Harmless inside `backend/` | HIGH |

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| next@16.4.0 | react@19.3.0, react-dom@19.3.0, typescript@7.0.2, node >=20.9 | Verified: export build + type-check green |
| tailwindcss@4.3.3 | @tailwindcss/postcss@4.3.3, postcss 8.5.x | Same version for both packages |
| vitest@5.0.3 | vite ^8 (8.3.3), node ^22.12/^24/>=26, @types/node ^22 or >=24 | `@vitest/coverage-v8` must match 5.0.3 if added |
| @vitejs/plugin-react@6.1.2 | vite ^8 | Not usable with Vite 7 |
| @testing-library/react@16.3.3 | @testing-library/dom ^10 (10.4.2), react 18/19 | `dom` is a peer, install explicitly |
| @testing-library/jest-dom@7.0.1 | vitest >=0.32, node >=22 | |
| jsdom@30.1.2 | node ^22.22.2 / ^24.15 / >=26 | Docker build stage does not run tests, so the image's Node 24 patch level is irrelevant; local Node must meet it |
| fastapi@0.142.2 | starlette 1.7.0, pydantic 2.13.5, httpx 0.28.1 | Resolved by uv together in the scratch project |
| litellm@1.104.0 | python >=3.10,<3.15, openai 2.54.0 | Resolved together with the above; `supports_response_schema` true for the target model |
| lightweight-charts@5.2.1 | any React; no peers | ESM; client-only (`'use client'` + `useEffect`) |
| d3-hierarchy@3.1.2 | @types/d3-hierarchy@3.1.7 | ESM-only; works in Next and Vitest |
| @playwright/test@1.63.0 | node >=20 | Matches `playwright` 1.63.0 |

## Verified in a scratch build (2026-10-06)

## Sources

- npm registry and PyPI JSON (queried 2026-10-06): all version numbers, peer dependencies and engine ranges above. HIGH
- Context7 `/websites/fastapi_tiangolo` and https://fastapi.tiangolo.com/tutorial/server-sent-events/ (SSE, minimum 0.135.0, 15 s keep-alive, headers). HIGH
- Context7 `/vercel/next.js` v16.2.9 and https://nextjs.org/docs/app/guides/static-exports (export config, unsupported features). HIGH
- https://nextjs.org/blog/next-16-4 (16.4 release 2026-10-06, Cache Components default in `create-next-app`, React 19.3). HIGH
- Context7 `/tradingview/lightweight-charts` v5.2.0 (`addSeries(LineSeries)`, `remove()`, `ISeriesApi.update`). HIGH
- Context7 `/websites/litellm_ai` (Pydantic `response_format`, `extra_body`). HIGH; combined with the local mock-call verification.
- https://openrouter.ai/api/v1/models/openai/gpt-oss-120b/endpoints (Cerebras endpoint parameters, context, pricing). MEDIUM (live provider data changes)
- Context7 `/websites/astral_sh_uv` (Docker integration guide). HIGH
- LiteLLM PyPI compromise reports, e.g. https://www.netspi.com/blog/executive-blog/ai-ml-pentesting/litellm-supply-chain-compromise/ and https://www.comet.com/site/blog/litellm-supply-chain-attack/ (versions 1.82.7/1.82.8, 2026-03-24). MEDIUM (secondary reports, consistent across sources)
- Web search on `turbopackUseSystemTlsCerts` being superseded by default system certs. LOW-MEDIUM (inferred from search snippets; confirmed only that the option is absent from the 16.4.0 package)
- `planning/MASSIVE_API.md`, `planning/MARKET_INTERFACE.md`, `planning/MARKET_SIMULATOR.md`, `.claude/skills/cerebras/SKILL.md` (project-local requirements for `massive`, `numpy`, LiteLLM call shape). HIGH

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

| Skill | Description | Path |
|-------|-------------|------|
| cerebras-inference | Use this to write code to call an LLM using LiteLLM and OpenRouter with the Cerebras inference provider | `.claude/skills/cerebras/SKILL.md` |
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-fast` for a trivial task inline, with no subagents and no PLAN.md
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
