# FinAlly — AI Trading Workstation

An AI-powered trading workstation: live market data, a simulated $10k portfolio, and an LLM chat assistant that can analyze positions and execute trades. Built by coding agents as the capstone of an agentic AI coding course.

## Status

- **Done:** market data subsystem (GBM simulator, Massive API client, price cache, SSE stream) in `backend/app/market/`
- **To do:** portfolio, watchlist and chat APIs, database, Next.js frontend, Docker packaging

The full specification is in [planning/PLAN.md](planning/PLAN.md).

## Architecture

One Docker container on port 8000:

- **Frontend:** Next.js static export (TypeScript, Tailwind)
- **Backend:** FastAPI managed with `uv`, SSE for live prices
- **Database:** SQLite, lazily initialized
- **AI:** LiteLLM → OpenRouter (Cerebras) with structured outputs
- **Market data:** built-in simulator by default, Massive API if a key is set

## Development

```bash
cd backend
uv sync --extra dev
uv run pytest                          # run tests
uv run uvicorn app.main:app --reload   # serve on :8000; SSE at /api/stream/prices
```

## Environment Variables

Set in `.env` at the project root:

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | Yes | OpenRouter key for AI chat |
| `MASSIVE_API_KEY` | No | Real market data; omit to use the simulator |
| `LLM_MOCK` | No | `true` for deterministic mock LLM responses |

## License

See [LICENSE](LICENSE).
