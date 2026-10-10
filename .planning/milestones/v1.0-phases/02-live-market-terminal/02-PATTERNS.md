# Phase 2: Live Market Terminal - Pattern Map

**Mapped:** 2026-10-08
**Files analyzed:** 45 new/modified
**Analogs found:** 14 real-code analogs + 14 design-doc analogs / 45 (rest: no analog)

All analog paths below are git-tracked (verified with `git ls-files`). Phase 1 is small, so most NEW modules have no code analog; for the market package the closest "analog" is the checked-in design code in `planning/MARKET_INTERFACE.md` and `planning/MARKET_SIMULATOR.md` (copy with the "Deltas" in 02-RESEARCH.md section "Deltas from the design docs"). `planning/API_CONTRACT.md` wins over those docs for wire shapes.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `backend/app/main.py` (modify) | config/app factory | request-response + lifespan | itself (`backend/app/main.py`) | exact |
| `backend/app/db.py` | service | CRUD (sqlite) | `planning/MARKET_INTERFACE.md` ss6 + RESEARCH Pattern 3 | design-doc |
| `backend/app/watchlist.py` | route | request-response | `backend/app/main.py` health route (lines 24-26) | role-match |
| `backend/app/portfolio.py` | route | request-response | same as above | role-match |
| `backend/app/market/models.py` | model | transform | `planning/MARKET_INTERFACE.md` ss3 (line 67) | design-doc |
| `backend/app/market/cache.py` | service | in-memory store | `planning/MARKET_INTERFACE.md` ss4 (line 123) | design-doc |
| `backend/app/market/interface.py` | interface (ABC) | event-driven | `planning/MARKET_INTERFACE.md` ss5 (line 189) | design-doc |
| `backend/app/market/seed_prices.py` | config | static data | `planning/MARKET_SIMULATOR.md` ss2.1 (line 106) | design-doc |
| `backend/app/market/simulator.py` | service | streaming/batch | `planning/MARKET_SIMULATOR.md` ss2.2 (line 167) | design-doc |
| `backend/app/market/massive_client.py` | service | polling | `planning/MARKET_INTERFACE.md` ss8 (line 289) | design-doc |
| `backend/app/market/factory.py` | utility | transform | `planning/MARKET_INTERFACE.md` ss7 (line 251) | design-doc |
| `backend/app/market/stream.py` | route | streaming (SSE) | RESEARCH Pattern 1 + MARKET_INTERFACE ss10 (line 437) | design-doc |
| `backend/tests/market/test_*.py` | test | - | `backend/tests/test_health.py`, `conftest.py` | role-match |
| `backend/tests/test_db.py`, `test_watchlist.py`, `test_portfolio.py` | test | request-response | `backend/tests/test_health.py` | exact |
| `backend/tests/test_health.py` (modify) | test | - | itself | exact |
| `backend/pyproject.toml` (modify) | config | - | itself | exact |
| `frontend/src/lib/types.ts`, `format.ts`, `store.ts`, `totals.ts`, `useMarketStream.ts` | utility/store/hook | event-driven | `frontend/src/lib/api.ts` (style only) | partial |
| `frontend/src/lib/api.ts` (modify) | service | request-response | itself (lines 1-8) | exact |
| `frontend/src/app/page.tsx` (replace) | component | request-response + SSE | itself (lines 1-23) | role-match |
| `frontend/src/app/globals.css` (modify) | config | - | itself (`@theme`) | exact |
| `frontend/src/components/{Header,ConnectionDot,WatchlistPanel,WatchlistRow,PriceCell,Sparkline,Footer}.tsx` | component | event-driven | `frontend/src/app/page.tsx` ('use client' + useEffect fetch) | partial |
| `frontend/vitest.config.ts`, `vitest.setup.ts`, `frontend/package.json` (modify) | config | - | `frontend/package.json`, RESEARCH FakeEventSource snippet | partial |
| `test/smoke.spec.ts` (rewrite), `test/health-status.spec.ts` (delete) | test (E2E) | - | `test/smoke.spec.ts` | exact |
| `test/playwright.config.ts` (modify) | config | - | itself | exact |
| `planning/API_CONTRACT.md` (modify) | doc | - | itself | exact |

## Pattern Assignments

### `backend/app/main.py` (modify: lifespan wiring + routers)

**Analog:** itself. Current lifespan and catch-all (lines 16-35):

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.settings = settings
    yield

app = FastAPI(lifespan=lifespan)
register_error_handlers(app)

@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}

# Later routers are included above this catch-all so unknown /api paths stay JSON 404s.
app.add_route("/api/{path:path}", JSONResponse({"error": "Not found"}, status_code=404))

if settings.static_dir.is_dir():
    app.mount("/", StaticFiles(directory=settings.static_dir, html=True), name="frontend")
```

Apply: build `PriceCache` + source inside `create_app` (no module singletons), store on `app.state.cache`; in lifespan call `init_db(settings.db_path)`, load `watchlist UNION positions`, `await source.start(tracked)`, `yield`, `await source.stop()` (cancel AND await task, suppress CancelledError). `app.include_router(...)` for stream/watchlist/portfolio goes ABOVE the `add_route` catch-all and the static mount (mount stays last). Keep imports relative (`from .config import Settings`). Pin the 404-for-wrong-method behavior with a test (RESEARCH Open Question 2).

### `backend/app/watchlist.py`, `backend/app/portfolio.py` (route, request-response)

**Analog:** `backend/app/main.py` lines 24-26 (plain `def` handler returning a dict). Use `APIRouter`, plain `def` handlers (threadpool), short-lived `connect(settings.db_path)` per request, cache via `request.app.state.cache`. Keep `build_watchlist(conn, cache)` / `build_portfolio(conn, cache)` pure functions separate from the route so they unit test without HTTP. Errors use the existing `{"error": ...}` envelope (see `backend/app/errors.py` lines 8-23); do not add try/except in handlers.

### `backend/app/db.py` (service, CRUD)

No code analog. Follow RESEARCH Pattern 3 (schema table, `autocommit=True`, WAL, `CREATE TABLE IF NOT EXISTS`, `INSERT OR IGNORE`, snapshot seed guarded by `WHERE NOT EXISTS`). Path comes from `Settings.db_path` (`backend/app/config.py` line 22/36); mkdir parent first. Parameterized SQL only.

### `backend/app/market/*` (design-doc analogs)

Copy code blocks from `planning/MARKET_INTERFACE.md` (models line 67, cache 123, interface 189, factory 251, massive 289, stream 437) and `planning/MARKET_SIMULATOR.md` (seed_prices 106, simulator 167). Apply RESEARCH "Deltas" 1-8 (factory takes `(cache, settings)` using `settings.sim_seed`, `settings.sim_event_probability`, `settings.massive_api_key`; sha256 `derived_price`; `add_ticker` early return; await cancelled task in `stop()`; per-step try/except only in the simulator loop; SSE poll 0.1 s).

**Settings fields to reuse** (`backend/app/config.py` lines 17-25, 31-40): `massive_api_key`, `sim_seed: int|None`, `sim_event_probability: float`, `db_path`. `env()` already treats blank as unset, so the factory tests `if settings.massive_api_key`.

**SSE route core** (RESEARCH Pattern 1):

```python
@router.get("/api/stream/prices", response_class=EventSourceResponse)
async def stream_prices(request: Request) -> AsyncIterable[ServerSentEvent]:
    yield ServerSentEvent(retry=1000)
    async for payload in price_frames(request.app.state.cache):
        yield ServerSentEvent(data=payload)
```

`price_frames` stays a plain async generator (unit-testable via `anext`).

### Backend tests

**Analog:** `backend/tests/test_health.py` (lines 1-9) and `conftest.py`.

```python
from fastapi.testclient import TestClient
from app.main import create_app

def test_health_ok(settings):
    with TestClient(create_app(settings)) as client:
        r = client.get("/api/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}
```

- Use the `settings` fixture (`conftest.py` lines 22-27; db_path already `tmp_path / "t.db"`; construct `Settings(...)` with all 7 fields if you need variants, e.g. `dataclasses.replace(settings, sim_seed=1, sim_event_probability=0.0)`).
- `isolated_env` autouse fixture (lines 11-19) clears env vars; add nothing to it unless a new env var appears.
- Modify `test_health.py`: `test_health_is_side_effect_free` (lines 12-17) is now misleading (lifespan creates the DB); delete or assert the DB file exists.
- Unique basenames under `tests/market/` (no `__init__.py`). Run `cd backend && uv run python -m pytest ... -q`. SSE and shutdown tests need a real in-process `uvicorn.Server` (RESEARCH Pitfall 2 skeleton), not TestClient/ASGITransport. Add `asyncio_mode = "auto"` to `[tool.pytest.ini_options]` in `backend/pyproject.toml`.

### `frontend/src/lib/api.ts` (modify)

**Analog:** itself (lines 1-8). Add `getWatchlist()` and `getPortfolio()` in the same shape:

```ts
export type Health = { status: string };

export async function getHealth(): Promise<Health> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`health ${res.status}`);
  return (await res.json()) as Health;
}
```

Same-origin relative paths, throw on `!res.ok`, typed JSON cast. Shapes in `planning/API_CONTRACT.md`; types live in `lib/types.ts`.

### `frontend/src/app/page.tsx` (replace) and components

**Analog:** current `page.tsx` for the client-component convention:

```tsx
"use client";
import { useEffect, useState } from "react";
import { getHealth } from "../lib/api";
...
useEffect(() => { getHealth().then(...).catch(() => setApi("down")); }, []);
...
<h1 data-testid="app-title" className="text-3xl font-semibold text-accent">FinAlly</h1>
```

Apply: `"use client"` first line, relative imports (`../lib/api`), fetch inside `useEffect`, `data-testid` hooks per UI-SPEC "data-testid Contract" (02-UI-SPEC.md line 370). `api-status` is removed. Page mounts `useMarketStream()` ONCE; shell is `h-dvh flex flex-col`, `<main className="flex-1 min-h-0 lg:grid lg:grid-cols-[480px_1fr]">` (UI-SPEC Layout). Use theme tokens only, no hex or `slate-*` classes. `window`/`EventSource` only inside `useEffect`.

### `frontend/src/app/globals.css` (modify)

**Analog:** itself (lines 1-10): `@import "tailwindcss";` + `@theme { --color-...: ...; }`. Per UI-SPEC line 108 replace the `@theme` block with the new tokens; add `--animate-flash-up/down` and `@keyframes` inside `@theme` (RESEARCH "Tailwind v4 flash keyframes"). Also update `layout.tsx` body classes (UI-SPEC line 143).

### `frontend/src/lib/store.ts`, `useMarketStream.ts`, `format.ts`, `totals.ts`

No analog; use RESEARCH Pattern 4 (zustand store with pure `applyFrame(state, frame, nowSeconds)`; hook with onopen/onerror/5 s timer/CLOSED backoff 1,2,4,10 s; `close()` in cleanup) and UI-SPEC Formatters table (line 216; `fmtPct` uses decimal style, not `style: "percent"`). `liveTotals(portfolio, prices)` = `cash + sum(qty * (prices[t]?.price ?? avg_cost))`.

### `frontend/src/components/Sparkline.tsx`

No analog; RESEARCH Pattern 5 plus UI-SPEC Sparkline options (line 243). v5 API: `chart.addSeries(LineSeries, ...)`; cast times to `UTCTimestamp`; `chart.remove()` in cleanup; `vi.mock("lightweight-charts")` in tests.

### Frontend test config

`frontend/package.json` currently has only `dev` and `build` scripts (lines 4-7) and caret versions; add `"test": "vitest run"`. Phase 1 pinned exact deps per RESEARCH (`--save-exact`). `vitest.setup.ts` uses RESEARCH FakeEventSource snippet and `@testing-library/jest-dom/vitest`.

### `test/smoke.spec.ts` (rewrite), `test/playwright.config.ts` (modify)

**Analog:** current files.

```ts
import { test, expect } from "@playwright/test";
test("...", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("app-title")).toHaveText("FinAlly");
});
```

```ts
webServer: {
  command: "uv run uvicorn --factory app.main:create_app --port 8000",
  cwd: path.join(__dirname, "..", "backend"),
  url: "http://localhost:8000/api/health",
  reuseExistingServer: false, timeout: 60000,
  env: { STATIC_DIR: path.join(__dirname, "..", "frontend", "out") },
}
```

Apply: add `--timeout-graceful-shutdown 2` to `command`; add `DB_PATH` (temp file), `SIM_SEED: "1"`, `SIM_EVENT_PROBABILITY: "0"` to `env`; keep `BASE_URL` branch. Smoke asserts `app-title`, `header-total-value` `$10,000.00`, 10 `watchlist-row-*`, `connection-dot[data-status="connected"]`, prices not `--`. Delete `test/health-status.spec.ts` (asserts removed `api-status`).

## Shared Patterns

### Settings, not os.environ
**Source:** `backend/app/config.py` lines 12-14, 28-40. **Apply to:** factory, db, main. Read `Settings` only; never `os.environ` outside `config.py`.

### Error envelope
**Source:** `backend/app/errors.py` lines 8-23. **Apply to:** all routes. Every failure is `{"error": "..."}`; handlers do not catch.

### App-factory state (no globals)
**Source:** `backend/app/main.py` lines 12-22. **Apply to:** cache/source/db objects on `app.state`; tests build a fresh `create_app(settings)`.

### Route ordering
**Source:** `backend/app/main.py` lines 28-35. **Apply to:** new routers go above the `/api/{path:path}` catch-all; static mount last.

### Style
Short modules, docstrings (one-line, as in `config.py`/`errors.py`), no emojis, no defensive code, `uv run python -m pytest`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `backend/app/db.py` | service | CRUD | No DB code in Phase 1; use RESEARCH Pattern 3 |
| `frontend/src/lib/store.ts`, `useMarketStream.ts` | store/hook | event-driven | No stores/hooks yet; RESEARCH Pattern 4 |
| `frontend/src/lib/format.ts`, `totals.ts` | utility | transform | New; UI-SPEC formatter table |
| `frontend/src/components/Sparkline.tsx` | component | streaming | No chart code yet; RESEARCH Pattern 5 |
| `frontend/vitest.*` | config | - | No frontend tests yet |
| `backend/tests/market/test_stream.py`, `test_shutdown.py` | test | streaming | Needs real uvicorn server; RESEARCH skeleton |

## Metadata

**Analog search scope:** `backend/app`, `backend/tests`, `frontend/src`, `test/`, `Dockerfile`, `planning/` (all tracked via `git ls-files`)
**Files scanned:** 23 tracked source files plus planning docs
**Pattern extraction date:** 2026-10-08
