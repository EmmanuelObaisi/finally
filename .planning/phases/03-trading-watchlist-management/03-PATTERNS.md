# Phase 3: Trading & Watchlist Management - Pattern Map

**Mapped:** 2026-10-08
**Files analyzed:** 27 (new/modified)
**Analogs found:** 25 / 27 (all analog paths verified git-tracked via `git ls-files backend frontend`)

Skeleton code for the new logic (transaction, execute_trade, sync_ticker, stores) is already specified in `03-RESEARCH.md` Patterns 1-7; the excerpts below are the EXISTING code to copy conventions from. Testids: `03-UI-SPEC.md` "data-testid Contract".

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `backend/app/errors.py` (+DomainError, NotFoundError, handler) | middleware | request-response | itself (`register_error_handlers`) | exact |
| `backend/app/db.py` (+`transaction`) | utility | CRUD | `db.py` `connect` ctx manager + `init_db` BEGIN IMMEDIATE/COMMIT | exact |
| `backend/app/tracking.py` (new) | service | event-driven | `db.py:load_tracked_tickers` + `market/interface.py` | role-match |
| `backend/app/trading.py` (new) | service+route | CRUD | `portfolio.py` (build_portfolio, router) | role-match |
| `backend/app/watchlist.py` (+POST/DELETE) | route | CRUD | itself (`build_watchlist`, `get_watchlist`) | exact |
| `backend/app/main.py` (+include trading router) | config | - | itself, lines 94-96 | exact |
| `backend/tests/conftest.py` (+FixedPriceSource, client, make_db) | test | - | itself + `test_portfolio.py:make_db` | exact |
| `backend/tests/test_trading.py` | test | CRUD | `tests/test_portfolio.py` | exact |
| `backend/tests/test_tracking.py` | test | request-response | `tests/test_watchlist.py` | exact |
| `frontend/src/lib/portfolioStore.ts` | store | request-response | `lib/store.ts` | role-match |
| `frontend/src/lib/positions.ts` | utility | transform | `lib/totals.ts` | role-match |
| `frontend/src/lib/api.ts` (+send, postTrade, addTicker, removeTicker) | service | request-response | itself | exact |
| `frontend/src/lib/types.ts` (+Trade) | model | - | itself | exact |
| `frontend/src/components/TradeBar.tsx` | component | request-response | `WatchlistPanel.tsx` (button/state styling) | partial |
| `frontend/src/components/FormMessage.tsx` | component | - | `PriceCell.tsx` (tiny presentational) | partial |
| `frontend/src/components/PositionsTable.tsx` + `PositionRow` | component | event-driven | `WatchlistPanel.tsx` + `WatchlistRow.tsx` | exact |
| `frontend/src/components/Header.tsx` (modify) | component | request-response | itself | exact |
| `frontend/src/components/WatchlistPanel.tsx`, `WatchlistRow.tsx` (modify) | component | CRUD | themselves | exact |
| `frontend/src/app/page.tsx` (modify) | config | - | itself | exact |
| `*.test.ts(x)` new (portfolioStore, positions, api, TradeBar, PositionsTable) + updated Header/WatchlistPanel tests | test | - | `Header.test.tsx`, `store.test.ts`, `totals.test.ts` | exact |
| `test/trade.spec.ts` (optional) | test | E2E | `test/smoke.spec.ts` | role-match |

## Pattern Assignments

### `backend/app/errors.py` (middleware, request-response)

Add `DomainError`/`NotFoundError` classes and one handler inside the existing function; follow its handler shape (`errors.py:8-23`):
```python
def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0]
        loc = ".".join(str(p) for p in first["loc"] if p != "body")
        return JSONResponse({"error": f"{loc}: {first['msg']}"}, status_code=400)
```
New handler: `@app.exception_handler(DomainError)` returning `JSONResponse({"error": str(exc)}, status_code=exc.status_code)`, registered before the bare `Exception` handler (`errors.py:21-23`). Docstring style: one-line, imperative.

### `backend/app/db.py` (utility): `transaction(conn)`

Imports `contextmanager` already. Copy the explicit-transaction idiom from `init_db` (`db.py:~84-103`: `conn.execute("BEGIN IMMEDIATE")` ... `conn.execute("COMMIT")`) and the `@contextmanager` + docstring form of `connect` (`db.py:63-71`). Connections are `sqlite3.connect(db_path, autocommit=True)` with `row_factory = sqlite3.Row`, so rows support `row["cash_balance"]`. Reuse `USER_ID`, `now_iso()`. Snapshot insert to copy (`db.py` init_db):
```python
conn.execute(
    "INSERT INTO portfolio_snapshots (id, user_id, total_value, recorded_at) VALUES (?, ?, ?, ?)",
    (str(uuid.uuid4()), USER_ID, STARTING_CASH, now),
)
```
Trade/position inserts follow the same `?`-parameterized, `uuid.uuid4()` id convention; positions insert pattern in `tests/test_portfolio.py:11-21`.

### `backend/app/trading.py` (service+route, CRUD)

**Analog:** `backend/app/portfolio.py`. Module docstring + router + `connect` usage:
```python
from fastapi import APIRouter, Request
from .db import USER_ID, connect
router = APIRouter()

@router.get("/api/portfolio")
def get_portfolio(request: Request) -> dict:
    """Current cash, positions and totals."""
    with connect(request.app.state.settings.db_path) as conn:
        return build_portfolio(conn, request.app.state.cache)
```
Reuse `build_portfolio(conn, cache)` (`portfolio.py:12-44`) inside the transaction. Note its per-row `row["ticker"]` Row access and 2dp/6dp rounding conventions (quantity 6, money 2). `execute_trade` raises `DomainError`; new route is `async def` (differs from sync `def` here, per RESEARCH Pattern 2) reading `request.app.state` (`settings`, `cache`, `source`, set at `main.py:77-79`). Use `TradeRequest` from RESEARCH Pattern 4.

### `backend/app/watchlist.py` (route, CRUD)

**Analog:** itself. Reuse `build_watchlist(conn, cache)` (lines 35-45) for the response of POST/DELETE (`{"watchlist": [...]}`); keep ordering `ORDER BY rowid`. Existing route:
```python
@router.get("/api/watchlist")
def get_watchlist(request: Request) -> dict:
    with connect(request.app.state.settings.db_path) as conn:
        return {"watchlist": build_watchlist(conn, request.app.state.cache)}
```
Insert row convention (from `db.py init_db`): `INSERT INTO watchlist (user_id, ticker, added_at) VALUES (?, ?, ?)` with `now_iso()`. Add sync DB cores (`on_watchlist`, `insert_and_read`, `delete_and_read`) each opening their own `connect(...)`, called through `asyncio.to_thread`.

### `backend/app/tracking.py` (service, event-driven)

No exact analog. Copy the watched-or-held SQL from `db.py:load_tracked_tickers` (watchlist query + positions-not-in-watchlist query) as the basis for `is_wanted`; market calls via `MarketDataSource.add_ticker/remove_ticker` (`market/interface.py:17-27`, both idempotent coroutines). Regex/normalize skeleton: RESEARCH Pattern 2.

### `backend/app/main.py`

Change line 60 import to `from . import portfolio, trading, watchlist` and add `app.include_router(trading.router)` after line 96, above the catch-all at line 101. `tracking` has no router.

### `backend/tests/conftest.py`, `test_trading.py`, `test_tracking.py`

**Analogs:** `tests/test_portfolio.py` and `tests/test_watchlist.py`. Move `make_db` (`test_portfolio.py:8-21`) into conftest as a fixture/helper. Route tests pattern (`test_watchlist.py:11-21`):
```python
with TestClient(create_app(settings)) as client:
    r = client.get("/api/watchlist")
```
Cache priming pattern (`test_watchlist.py:24-30`): `cache = PriceCache(); cache.update(ticker, 100.0); init_db(path); with connect(path) as conn: build_watchlist(conn, cache)`. `FixedPriceSource` subclasses `MarketDataSource`; install via `client.app.state.source = ...` after lifespan start (routes read state per request). `settings` fixture at `conftest.py:28-33`. Run with `uv run --directory backend python -m pytest` (async tests auto mode).

### `frontend/src/lib/api.ts` (service)

Existing helpers must stay unchanged (fixed-string errors, no body echo):
```ts
export async function getPortfolio(): Promise<Portfolio> {
  const res = await fetch("/api/portfolio");
  if (!res.ok) throw new Error("portfolio " + res.status);
  return (await res.json()) as Portfolio;
}
```
Add `send(method, url, body?)` (reads `{error}` on `!res.ok`, falls back to fixed message), then `postTrade`, `addTicker`, `removeTicker` (typed generics, same `as` cast style). Add `Trade` type to `types.ts` after `Portfolio` using its plain `export type` object style.

### `frontend/src/lib/portfolioStore.ts` (store)

**Analog:** `lib/store.ts`. Copy: `import { create } from "zustand"`, exported `initialXState()` factory for test reset, `create<State & Actions>()((set) => ({...initial, ...}))` (store.ts:78-82). Test reset in specs: `useMarketStore.setState(initialMarketState())` (`Header.test.tsx:23-25`); add also resetting module ticket counters. Add the `failed` flag per UI-SPEC; ticket-guard body from RESEARCH Pattern 5.

### `frontend/src/lib/positions.ts` (utility, transform)

**Analog:** `lib/totals.ts` / `totals.test.ts` (pure helper + sibling test). Body: RESEARCH Pattern 6. Use `lib/format.ts` (`fmtMoney`, `fmtQty`, `fmtSigned`, `fmtPct`, `toneClass`, `MISSING`) for display.

### `frontend/src/components/Header.tsx` (modify)

Replace `useState<Portfolio|null>` + local `load` (Header.tsx:~12-30) with:
```tsx
const portfolio = usePortfolioStore((s) => s.portfolio);
const load = usePortfolioStore((s) => s.load);
useEffect(load, []);
const previous = useRef(status);
useEffect(() => { if (status === "connected" && previous.current !== "connected") load(); previous.current = status; }, [status]);
```
Keep the rest (liveTotals, testids `header-total-value`, `header-cash`) untouched. Tests (`Header.test.tsx`): `stubFetch` pattern at lines 9-14; add portfolio-store reset to `beforeEach`.

### `frontend/src/components/PositionsTable.tsx` + `PositionRow` (component, event-driven)

**Analog:** `WatchlistPanel.tsx` (state union View `loading|error|ready`, `Skeleton`/`ErrorState`/`EmptyState` subcomponents with testids, table markup `w-full table-fixed`, sticky `thead`, panel `<section className="... bg-panel">` with `h-10` header `<h2 className="text-heading font-semibold">`) and `WatchlistRow.tsx` (per-row selector):
```tsx
const live = useMarketStore((s) => s.prices[ticker]);
const dim = useMarketStore((s) => s.status === "disconnected");
const stale = dim ? " opacity-60" : "";
<tr data-testid={"watchlist-row-" + ticker} className="h-10 border-b border-border hover:bg-raised">
  <td className="px-4 font-semibold truncate" title={ticker}>{ticker}</td>
  <td className="px-2 text-right tabular-nums ...">
```
Retry button class string at WatchlistPanel.tsx:~231-237 for `positions-retry`. DO NOT reuse `PriceCell` (hard-coded `price-<T>`, PriceCell.tsx); render plain `<td data-testid={"position-price-"+ticker}>` with `fmtMoney`. Use `toneClass(...)` as WatchlistRow does for P&L tone. All state/row testids per UI-SPEC table.

### `frontend/src/components/TradeBar.tsx`, `FormMessage.tsx` (component)

Partial analogs only. Styling: tokens used across components (`bg-panel`, `border-border`, `bg-raised`, `text-label text-muted`, `h-8 rounded-sm`, focus ring `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`; purple via `bg-secondary`). Mutation flow, strict qty parse, disabled-in-flight: RESEARCH Pattern 7 and UI-SPEC "Trade bar". `FormMessage` props `kind/text/testId`, `<p aria-live="polite" data-kind=...>` (UI-SPEC components table). Apply `usePortfolioStore.getState().applyTrade(res.portfolio)`.

### `frontend/src/components/WatchlistPanel.tsx` / `WatchlistRow.tsx` (modify)

Keep local `view` state; after mutation `setView({ kind: "ready", items })` (existing setters at WatchlistPanel.tsx:~16-22); do not call `load()` (flips to skeleton). Add fifth `<th>`/`<td>` for remove with `aria-label={"Remove " + ticker}` and `data-testid={"watchlist-remove-" + ticker}`. Layout class edits (`lg:h-full`, `lg:overflow-y-auto`) per UI-SPEC line 132.

### `frontend/src/app/page.tsx` (modify)

Current:
```tsx
<main className="min-h-0 flex-1 lg:grid lg:grid-cols-[480px_1fr]">
  <WatchlistPanel />
</main>
```
Add `<section data-testid="workspace" className="flex min-h-0 flex-col lg:h-full"><TradeBar /><PositionsTable /></section>` after `WatchlistPanel`; adjust `main` overflow per UI-SPEC.

### `test/trade.spec.ts` (optional)
Copy structure of `test/smoke.spec.ts` (Playwright host-run, shared temp DB, `workers: 1`).

## Shared Patterns

- **Error envelope:** every failure is `{"error": "..."}` (`errors.py`); domain errors via `DomainError`; unexpected = generic 500. Apply to trading + watchlist.
- **DB access:** `with connect(db_path) as conn:` per call, autocommit mode, `sqlite3.Row`, parameterized SQL, `USER_ID`, `now_iso()`, `uuid.uuid4()` ids. Blocking DB work from async routes via `asyncio.to_thread`.
- **Tracking rule:** all trade/watchlist mutations end with `sync_ticker` (try/finally); never call `source.remove_ticker` directly.
- **Router registration:** include above the `/api/{path:path}` catch-all in `main.py`.
- **Frontend prices:** one `useMarketStore` SSE map; per-ticker selectors (`s.prices[ticker]`); membership from REST only.
- **Formatting:** only `lib/format.ts` helpers; `MISSING` placeholder for null.
- **Styling:** Tailwind v4 tokens from `globals.css`; dim with `opacity-60` when `status === "disconnected"`.
- **Code style:** short functions, one-line docstrings, no emojis, no defensive code (user rules).

## No Analog Found

| File | Role | Reason |
|---|---|---|
| `backend/app/tracking.py` (normalize/sync_ticker logic) | service | No existing runtime tracking orchestration; use RESEARCH Pattern 2 skeleton |
| `TradeBar.tsx` form/mutation UI | component | No existing form or mutation component; use RESEARCH Pattern 7 + UI-SPEC |

## Metadata

**Analog search scope:** `backend/app`, `backend/tests`, `frontend/src`, `test/`
**Files scanned:** ~55 tracked files (listing) and ~15 read in full
**Pattern extraction date:** 2026-10-08
