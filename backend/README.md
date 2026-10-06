# FinAlly backend

FastAPI app (package `app`, flat layout, not installed as a package). Run everything from `backend/`.

```bash
uv sync --extra dev                                   # deps + test tools
uv run python -m pytest                               # tests
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Environment (root `.env` is loaded automatically, without overriding existing vars):
`DB_PATH` (default `../db/finally.db`), `STATIC_DIR` (default `backend/static`),
`MASSIVE_API_KEY` (empty = simulator), `OPENROUTER_API_KEY`, `LLM_MOCK`.

API contract: `planning/CONTRACT.md`.
