# FinAlly — AI Trading Workstation

An AI-powered trading workstation: live market data, a simulated $10k portfolio, and an LLM chat assistant that can analyze positions and execute trades. Built by coding agents as the capstone of an agentic AI coding course.

## Status

Phase 1 (walking skeleton): FastAPI app factory with `GET /api/health` and a JSON error envelope, a three-stage Docker image on port 8000, host Playwright tests (`test/`), and the frozen REST/SSE contract in [planning/API_CONTRACT.md](planning/API_CONTRACT.md).

Phase 2 (live market terminal): market simulator (correlated GBM, events, `SIM_SEED`) with an optional Massive REST poller, SQLite created and seeded on startup, `GET /api/stream/prices` (SSE), `GET /api/watchlist`, `GET /api/portfolio`, and the terminal UI (watchlist with price flash and sparklines, header totals, connection dot).

Phase 3 (trading): `POST /api/portfolio/trade`, watchlist add and remove, trade bar and positions table.

Phase 4 (charts): main price chart, P&L heatmap, portfolio value chart and `GET /api/portfolio/history`.

Phase 5 (AI copilot): `POST /api/chat` and `GET /api/chat/history` through LiteLLM to OpenRouter to Cerebras `gpt-oss-120b` with structured output, the `LLM_MOCK=true` keyword mock, and the collapsible chat panel.

Not built yet: compose and start/stop scripts, the Docker volume, and the full Playwright suite (Phase 6). See `.planning/ROADMAP.md` and [planning/PLAN.md](planning/PLAN.md).

## Architecture

Target design, one Docker container on port 8000:

- **Frontend:** Next.js static export (TypeScript, Tailwind)
- **Backend:** FastAPI managed with `uv`, SSE for live prices
- **Database:** SQLite, lazily initialized
- **AI:** LiteLLM → OpenRouter (Cerebras) with structured outputs
- **Market data:** built-in simulator by default, Massive API if a key is set

## Development

Backend:

```bash
cd backend
uv sync --extra dev
uv run python -m pytest
uv run uvicorn --factory app.main:create_app --timeout-graceful-shutdown 2
```

Without `--timeout-graceful-shutdown`, an open browser stream blocks shutdown. Real environment variables beat `.env`, so run mock mode as `LLM_MOCK=true uv run uvicorn --factory app.main:create_app --timeout-graceful-shutdown 2`.

Manual live check of the real model (needs the key, not run by tests): `uv run --directory backend python tests/live_smoke.py`.

Frontend (static export to `frontend/out`):

```bash
cd frontend
npm ci
npm test
npm run build
```

Local full stack plus browser smoke test (starts the backend itself; port 8000 must be free):

```bash
npm --prefix test run smoke
```

Docker:

```bash
docker build -t finally .
docker run --rm -p 8000:8000 finally
```

On a TLS-intercepting machine, pass the interception root as a build secret (used only in throwaway build stages, never in the final image): `docker build --secret id=extra_ca,src=<path-to-root.pem> -t finally .`
Smoke-test a running container with `BASE_URL=http://localhost:8000 npm --prefix test run smoke`.

## Environment Variables

Set in `.env` at the project root:

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | Yes for the real AI chat; not needed with `LLM_MOCK=true` | OpenRouter key for AI chat |
| `MASSIVE_API_KEY` | No | Real market data; omit to use the simulator |
| `LLM_MOCK` | No | `true` for deterministic mock LLM responses |
| `DB_PATH` | No | SQLite file; default `db/finally.db` (`/app/db/finally.db` in Docker) |
| `SIM_SEED` | No | Integer seed for a reproducible simulator |
| `SIM_EVENT_PROBABILITY` | No | Per-tick chance of a random price event; default `0.001` |
| `STATIC_DIR` | No | Static export directory; local dev only |

## License

See [LICENSE](LICENSE).
