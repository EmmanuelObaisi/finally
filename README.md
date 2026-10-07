# FinAlly — AI Trading Workstation

An AI-powered trading workstation: live market data, a simulated $10k portfolio, and an LLM chat assistant that can analyze positions and execute trades. Built by coding agents as the capstone of an agentic AI coding course.

## Status

Phase 1 (walking skeleton) is in place:
- FastAPI app factory with `GET /api/health` and a JSON error envelope
- Next.js static-export placeholder page, served same-origin by FastAPI
- Three-stage Docker image on port 8000 with one uvicorn worker
- Host Playwright smoke test (`test/`)
- Frozen REST/SSE contract in [planning/API_CONTRACT.md](planning/API_CONTRACT.md)

Not built yet: market data, database, trading, charts, AI chat, and compose with start/stop scripts. See `.planning/ROADMAP.md` for the later phases and [planning/PLAN.md](planning/PLAN.md) for the full specification.

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
uv run uvicorn --factory app.main:create_app
```

Real environment variables beat `.env`, so run mock mode as `LLM_MOCK=true uv run uvicorn --factory app.main:create_app`.

Frontend (static export to `frontend/out`):

```bash
cd frontend
npm ci
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
| `OPENROUTER_API_KEY` | Yes | OpenRouter key for AI chat |
| `MASSIVE_API_KEY` | No | Real market data; omit to use the simulator |
| `LLM_MOCK` | No | `true` for deterministic mock LLM responses |
| `DB_PATH` | No | SQLite file; default `db/finally.db` (`/app/db/finally.db` in Docker) |
| `SIM_SEED` | No | Integer seed for a reproducible simulator |
| `SIM_EVENT_PROBABILITY` | No | Per-tick chance of a random price event; default `0.001` |
| `STATIC_DIR` | No | Static export directory; local dev only |

## License

See [LICENSE](LICENSE).
