# Phase 1: Walking Skeleton - Pattern Map

**Mapped:** 2026-10-06
**Files analyzed:** 27
**Analogs found:** 1 partial in-repo (MARKET_INTERFACE.md section 11) / 27. Everything else uses the verified snippets in 01-RESEARCH.md.

Greenfield: no tracked `.py` under `backend/`, `frontend/` is empty. Only tracked in-repo design analogs: `planning/MARKET_INTERFACE.md`, `planning/MARKET_SIMULATOR.md`, `planning/PLAN.md`. Every analog named here is tracked (`git ls-files` confirmed for `planning/*.md`). `backend/static/` is still tracked right now; it is the thing FND-01 untracks, never use it as an analog.

## File Classification

| File | Role | Data Flow | Analog | Match |
|------|------|-----------|--------|-------|
| `.gitignore` (edit) | config | n/a | existing `.gitignore` + RESEARCH "Repo hygiene" | edit-in-place |
| `.gitattributes`, `.dockerignore`, `.env.example`, `db/.gitkeep` | config | n/a | RESEARCH verbatim blocks | none (use RESEARCH) |
| `backend/pyproject.toml`, `.python-version`, `uv.lock` | config | n/a | RESEARCH Pattern 1 | none (use RESEARCH) |
| `backend/app/__init__.py` | package | n/a | empty | none |
| `backend/app/config.py` | config | request-response (env read) | RESEARCH Pattern 1 | none (use RESEARCH) |
| `backend/app/errors.py` | middleware | request-response | RESEARCH Pattern 1 | none (use RESEARCH) |
| `backend/app/main.py` | app factory / route | request-response | `planning/MARKET_INTERFACE.md` lines 475-497 (lifespan shape only) + RESEARCH Pattern 1 | partial |
| `backend/tests/test_health.py`, `test_config.py`, `test_errors.py` | test | request-response | RESEARCH "Code Examples" | none (use RESEARCH); `test_errors.py` is not drafted, model on `test_health.py` |
| `frontend/package.json`, `next.config.ts`, `postcss.config.mjs`, `tsconfig.json` | config | n/a | RESEARCH Pattern 2 | none |
| `frontend/src/app/layout.tsx`, `page.tsx`, `globals.css` | component | request-response (fetch /api/health) | RESEARCH Pattern 2 | none |
| `test/package.json`, `playwright.config.ts`, `smoke.spec.ts` | test | request-response | RESEARCH Pattern 3 | none |
| `Dockerfile`, `.dockerignore` | config | batch (build) | RESEARCH "Draft Dockerfile" (UNTESTED) | none |
| `planning/API_CONTRACT.md` | doc | n/a | RESEARCH "Contract doc" table + shared shapes; PLAN.md section 8 for endpoint list | partial |
| `planning/MARKET_INTERFACE.md`, `MARKET_SIMULATOR.md` (edit) | doc | n/a | RESEARCH conflict table rows 1-5 (rename `day_change_percent` -> `change_percent`, `reference_price` -> `session_start_price`, note section 11 superseded by lifespan) | edit-in-place |
| `README.md`, `CLAUDE.md` (edit) | doc | n/a | RESEARCH Pitfall 9 | edit-in-place |

## Pattern Assignments

### `backend/app/main.py` (app factory, request-response)

**Analog:** `planning/MARKET_INTERFACE.md` lines 475-497 (design snippet, not code).
Take only the lifespan shape (`@asynccontextmanager async def lifespan(app)`: start, `yield`, stop). Do NOT copy its module-level `price_cache = ...` / `app = FastAPI(...)`: research decision (conflict row 5, PITFALLS #5) says build inside `create_app()` + lifespan, run with `uvicorn --factory`.

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    await market_source.start(...)   # Phase 2 fills this in
    yield
    await market_source.stop()
```

Phase 1 body: copy 01-RESEARCH.md Pattern 1 `main.py` (lines 273-307) verbatim. Key ordering rules: register error handlers; `/api/health`; `/api/{path:path}` catch-all 404; mount `StaticFiles(html=True)` LAST and only if `static_dir.is_dir()`. Later phases add routers via `app.include_router(...)` before the catch-all (MARKET_INTERFACE line 496 style: `create_stream_router(price_cache)`), so register routers above the catch-all.

### `backend/app/config.py`, `backend/app/errors.py`
No analog. Copy 01-RESEARCH.md lines 212-271 verbatim (frozen dataclass `Settings.from_env()` with `load_dotenv(ROOT_DIR / ".env", override=False)`; two handlers mapping `StarletteHTTPException` to `{"error": detail}` and `RequestValidationError` to 400). Default `sim_event_probability` 0.001 matches `planning/MARKET_SIMULATOR.md:215`.

### `backend/tests/*`
No analog. Copy RESEARCH lines 681-737. Conventions: build app via `create_app(replace(Settings.from_env(), db_path=..., static_dir=...))`; use `with TestClient(app) as client`; `monkeypatch.delenv(..., raising=False)` for every env var under test (shell presets `LLM_MOCK`). Run with `uv run python -m pytest` (not bare `pytest`).

### Frontend skeleton
No analog (`frontend/` empty). Copy RESEARCH Pattern 2 (lines 314-394). Conventions later phases inherit: `src/app/`, `src/lib/` for helpers (needs the `.gitignore` `lib/` fix first), `data-testid` attributes for Playwright, same-origin `fetch("/api/...")`, theme tokens via `@theme` in `globals.css` using PLAN.md section 2 colors, no `next/font/google`.

### `test/` Playwright
No analog. Copy RESEARCH Pattern 3 (lines 398-421). Host-run against `BASE_URL` default `http://localhost:8000`, one worker.

### `Dockerfile`
No analog. Copy RESEARCH lines 562-599 (3 stages, optional `--mount=type=secret,id=extra_ca`, `DB_PATH=/app/db/finally.db`, `--factory`, `--workers 1`, HEALTHCHECK on `/api/health`). Marked UNTESTED: Docker Desktop was off; plan must open with a human checkpoint plus the TLS probe (RESEARCH lines 553-557).

### `planning/API_CONTRACT.md`
Partial analog: PLAN.md section 8 (endpoint table) and section 13 items 3-5, 8, 24. Fill in bodies/status codes from RESEARCH lines 655-675 (conventions, endpoint table, shared shapes `PriceUpdate`, `Portfolio`, `Trade`, `Action`, mock LLM keyword table). Needs user confirmation of A6/A7 before freeze.

## Shared Patterns

- **Error envelope:** every failure is `{"error": "<msg>"}`; 400 for validation/domain failures (not 422); 404 for unknown `/api/*`. Source: RESEARCH `errors.py`. Apply to all later routers.
- **Settings injection:** routes read `request.app.state.settings` (set in lifespan); never import module-level singletons.
- **Env precedence:** real env beats `.env` (`override=False`); local mock mode is `LLM_MOCK=true uv run uvicorn --factory app.main:create_app`.
- **Repo/tooling rules (user CLAUDE.md):** `uv add` / `uv run`, no emojis, short modules, docstrings over comments, never disable TLS verification.

## No Analog Found

All code files (see table): no tracked source exists. Use the RESEARCH.md snippets cited above.

## Metadata

**Analog search scope:** `backend/`, `frontend/`, `test/`, `planning/` (tracked files via `git ls-files`)
**Pattern extraction date:** 2026-10-06
