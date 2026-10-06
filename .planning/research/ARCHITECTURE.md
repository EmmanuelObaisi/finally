# Architecture Research

**Domain:** Single-user, single-container AI trading workstation (live price streaming + simulated portfolio + LLM copilot that executes actions)
**Researched:** 2026-10-06
**Confidence:** HIGH for backend boundaries, tracking rule, lifespan wiring and build order (derived directly from PLAN.md, PROJECT.md, MARKET_INTERFACE.md, MARKET_SIMULATOR.md). MEDIUM for frontend state/chart specifics (library behaviour from training knowledge, to be verified in the frontend phase). LOW-MEDIUM for LLM strict-schema behaviour on Cerebras and the Next dev-proxy approach (flagged inline).

The top-level shape is FIXED by PLAN.md (one container, FastAPI serving `/api/*` + SSE + static Next export, in-process market task writing an in-memory cache, SQLite, LLM chat that auto-executes structured actions). This document decides what PLAN.md leaves open: module boundaries, who enforces the tracked-ticker rule, wiring, frontend state, and build order.

## Standard Architecture

### System Overview

```
 Browser (one origin, :8000)
 ┌──────────────────────────────────────────────────────────────────────┐
 │ Zustand-style stores (outside React render)                          │
 │  prices (1 EventSource, latest map, per-ticker buffers, conn status) │
 │  portfolio (server cash/qty/avg_cost)   watchlist (membership)       │
 │  chat   ui (selected ticker)                                         │
 │        │ selectors              │ imperative subscribe               │
 │  Header Watchlist+Sparklines MainChart Heatmap PnlChart Positions    │
 │  TradeBar ChatPanel                                                  │
 └───────▲──────────────────────────────┬───────────────────────────────┘
         │ SSE  GET /api/stream/prices  │ REST  /api/portfolio* /api/watchlist* /api/chat
 ┌───────┴──────────────────────────────▼───────────────────────────────┐
 │ FastAPI process (ONE uvicorn worker)                                 │
 │                                                                      │
 │  routes/  (thin: parse -> call service -> shape response)            │
 │   portfolio.py  watchlist.py  chat.py  health.py  | market/stream.py │
 │        │             │            │                                  │
 │        │             │      llm/chat.py  (orchestrates one turn)     │
 │        │             │        │  prompt.py  client.py|mock.py        │
 │        ▼             ▼        ▼                                      │
 │  portfolio/  service.py (trade, valuation, view)  watchlist.py       │
 │              tracking.py (THE tracked-ticker rule)  snapshots.py     │
 │        │                │                                            │
 │        ▼                ▼                                            │
 │   db/ (sqlite3, schema, seed, repo fns)    market/ (PriceCache,      │
 │        │                                    MarketDataSource,        │
 │        ▼                                    Simulator | Massive)     │
 │   finally.db (volume)                          ▲ writes (1 bg task)  │
 │                                                │                     │
 │  StaticFiles("/")  mounted LAST  -> Next export (index.html, _next/) │
 └──────────────────────────────────────────────────────────────────────┘
```

Import direction (strict DAG, enforce in code review):

```
routes -> llm.chat -> portfolio.* -> {db, market}
routes -> portfolio.* -> {db, market}
llm.prompt / llm.client / llm.mock -> (pydantic types only; NO db, NO market, NO portfolio)
market -> nothing in app   |   db -> nothing in app
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| `market/` (cache, source, factory, stream) | Produce prices; hold latest in `PriceCache`; push via SSE. Knows nothing about portfolios or DB. Tracks whatever it is told to. | As designed in MARKET_INTERFACE.md; rebuild verbatim. |
| `db/` | Connection helper, schema, idempotent init + seed, small repo functions per table returning plain dicts. | stdlib `sqlite3`, `CREATE TABLE IF NOT EXISTS`, `INSERT OR IGNORE` seed. |
| `portfolio/tracking.py` | The ONLY place that decides what the market source tracks (watchlist ∪ positions) and the ONLY place that validates a ticker is priceable. | `sync(ticker)`, `ensure_priced(ticker)`, `initial_tickers()`. |
| `portfolio/watchlist.py` | Add / remove / list watchlist; delegates tracking to `tracking.py`. | Functions taking a `Services` handle. |
| `portfolio/service.py` | `execute_trade`, `portfolio_view` (valuation, P&L), atomic cash/position/trade write. | One synchronous DB transaction, no awaits inside. |
| `portfolio/snapshots.py` | Record snapshot after trade and on history request; query history. | Two functions. |
| `llm/` | Schema (Pydantic), prompt building, call (real or mock), turn orchestration. Executes actions ONLY through `portfolio.*` public functions. | `acompletion` + `response_format=ChatResponse`; keyword mock. |
| `routes/` | HTTP shape only: validation, status codes, `{"error": ...}` format. No business logic. | `APIRouter` per area; one exception handler. |
| `main.py` | `create_app()`, lifespan, router registration, static mount last. | See wiring section. |
| Frontend stores | Single source of client truth; one EventSource; buffers; derived live valuation. | Zustand (or ~30-line `useSyncExternalStore` store). |

## Recommended Project Structure

The stale `__pycache__` dirs in `backend/app/` and `backend/tests/` show the earlier layout (`db`, `llm`, `market`, `portfolio`, `routes`); keep it. Note PLAN.md §4 puts schema under `backend/db/`, but MARKET_INTERFACE.md fixes code under `backend/app/`, so the DB package lives at `backend/app/db/` (record this deviation in the roadmap).

```
backend/
├── pyproject.toml
├── app/
│   ├── main.py              # create_app(), lifespan, static mount
│   ├── config.py            # Settings: DB_PATH, LLM_MOCK, STATIC_DIR, .env loading
│   ├── services.py          # Services dataclass (db path, cache, source, llm fn) + Depends getter
│   ├── errors.py            # DomainError -> ValidationError(400) / NotFoundError(404) + handlers
│   ├── market/              # per MARKET_INTERFACE.md (models, cache, interface, seed_prices,
│   │                        #   simulator, massive_client, factory, stream)
│   ├── db/                  # connection.py, schema.sql (or schema.py), seed.py, repo.py
│   ├── portfolio/           # tracking.py, watchlist.py, service.py, snapshots.py, models.py
│   ├── llm/                 # schema.py, prompt.py, client.py, mock.py, chat.py
│   └── routes/              # portfolio.py, watchlist.py, chat.py, health.py
└── tests/                   # mirrors app/ (market, db, portfolio, llm, routes)
frontend/
├── next.config.ts           # output: 'export', images.unoptimized, (turbopackUseSystemTlsCerts)
└── src/
    ├── app/                 # layout.tsx, page.tsx (thin "use client" shell), globals.css
    ├── lib/                 # api.ts (typed fetch, throws ApiError(message)), types.ts, format.ts
    ├── stores/              # prices.ts, portfolio.ts, watchlist.ts, chat.ts, ui.ts
    ├── hooks/               # useLivePortfolio.ts (derived), usePrice.ts, useFlash.ts
    └── components/          # Header, ConnectionDot, WatchlistPanel(+Row,+Sparkline), MainChart,
                             #   PortfolioHeatmap, PnlChart, PositionsTable, TradeBar, ChatPanel
```

### Structure Rationale

- **`market/` and `db/` are leaves** with no app imports, so they are testable alone and buildable in parallel.
- **`portfolio/` owns all business rules** (tracking, validation, trade math). REST routes and the LLM both call it, so a trade is identical whether typed or chat-driven (PLAN.md §9: "same validation as manual trades").
- **`llm/prompt|client|mock` are pure** (input messages -> `ChatResponse`), so they are unit-testable with no DB; only `llm/chat.py` touches services.
- **`Services` on `app.state`** instead of module globals: tests build an app with a tmp `DB_PATH` and a fake/seeded simulator.

## Architectural Patterns

### Pattern 1: Producers write, everyone else reads (price cache)

**What:** One background task writes `PriceCache`; SSE, trade execution, portfolio valuation and chat context only read it. Routes never call Massive/simulator for a price.
**When to use:** Always (fixed by design). Trades are instant and Massive rate limits stay safe.
**Trade-offs:** Cache is per-process, so the app MUST run one uvicorn worker.

### Pattern 2: One tracking-rule owner (`tracking.py`)

**What:** DB is the source of truth for "watched" and "held"; `sync(ticker)` reads both and calls `source.add_ticker`/`remove_ticker`. Callers never pass booleans and never call the source directly.
**When to use:** After every mutation of watchlist or positions, and before reading a price for an unknown ticker.
**Trade-offs:** One extra tiny DB read per mutation; eliminates every drift bug.

```python
# backend/app/portfolio/tracking.py
TICKER_RE = re.compile(r"[A-Z][A-Z.]{0,9}")

def normalize(raw: str) -> str:
    ticker = raw.strip().upper()
    if not TICKER_RE.fullmatch(ticker):
        raise ValidationError(f"Invalid ticker: {raw}")
    return ticker

async def sync(svc: Services, ticker: str) -> None:
    """Track a ticker exactly when it is watched or held."""
    if repo.is_watched(svc.db, ticker) or repo.is_held(svc.db, ticker):
        await svc.source.add_ticker(ticker)
    else:
        await svc.source.remove_ticker(ticker)

async def ensure_priced(svc: Services, ticker: str) -> None:
    """Start tracking and prove a price exists, else untrack (unless watched/held) and 400."""
    await svc.source.add_ticker(ticker)
    if svc.cache.get_price(ticker) is None:
        await sync(svc, ticker)
        raise ValidationError(f"Unknown ticker: {ticker}")

def initial_tickers(db) -> list[str]:
    return sorted(repo.watchlist_tickers(db) | repo.position_tickers(db))
```

### Pattern 3: Async resolve, then synchronous atomic transaction

**What:** Do every `await` (ensure_priced, price read) BEFORE the DB transaction; inside the transaction there is no `await`, so on a single event loop it is atomic with respect to other requests without locks. `try/finally` calls `sync(ticker)` so a failed buy of a newly tracked ticker does not leak a tracked-but-unowned ticker.
**When to use:** `execute_trade` (REST and chat).

```python
async def execute_trade(svc, ticker, side, quantity) -> dict:
    ticker = normalize(ticker)
    try:
        if side == "buy":
            await ensure_priced(svc, ticker)
        price = svc.cache.get_price(ticker)
        if price is None:
            raise ValidationError(f"No price available for {ticker}")
        with db.transaction(svc.db_path) as conn:          # sync, no awaits inside
            trade = apply_trade(conn, ticker, side, quantity, price)   # validates cash/shares,
            snapshots.record(conn, valuation(conn, svc.cache))          # upserts/deletes position
        return trade
    finally:
        await sync(svc, ticker)                             # untrack if sell-to-zero / failed buy
```

### Pattern 4: Domain errors -> one HTTP error format

**What:** Services raise `ValidationError`/`NotFoundError`; one handler returns `{"error": msg}` with 400/404. Also override `RequestValidationError` to return 400 `{"error": ...}` (FastAPI default is 422 `{"detail": ...}`, which violates the PROJECT.md contract). Chat catches `DomainError` per action and records `{ok: false, error}` instead of failing the request.

### Pattern 5: App factory + lifespan with state on `app.state`

```python
def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    cache = PriceCache()
    source = create_market_data_source(cache)        # constructors do no I/O
    svc = Services(settings=settings, cache=cache, source=source, llm=make_llm(settings))

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        db.init(settings.db_path)                    # mkdir, CREATE IF NOT EXISTS, seed if empty
        await source.start(tracking.initial_tickers(settings.db_path))  # first prices cached on return
        yield
        await source.stop()

    app = FastAPI(lifespan=lifespan)
    app.state.services = svc
    app.add_exception_handler(DomainError, domain_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    for r in (health.router, portfolio.router, watchlist.router, chat.router,
              create_stream_router(cache)):
        app.include_router(r)
    if settings.static_dir.is_dir():                 # absent in dev/tests -> skip, don't crash
        app.mount("/", StaticFiles(directory=settings.static_dir, html=True), name="frontend")
    return app

app = create_app()
```

Startup order is load-bearing: config/.env -> DB init -> read tracked tickers from DB -> `source.start` (Massive errors propagate and fail the boot loudly; simulator returns after seeding the cache) -> serve. Shutdown: `source.stop()`.

The static mount must be registered LAST (a `/` mount shadows anything added after it). FastAPI's newer `app.frontend("/", directory=...)` is documented to check path operations first and fall back to `index.html`; it is an acceptable alternative, but its minimum FastAPI version was not stated in the docs read, so default to the long-stable `StaticFiles(html=True)` and re-check at implementation time. (Source: fastapi.tiangolo.com/tutorial/frontend.)

## Data Flow

### Request Flow (trade)

```
TradeBar click Buy
  -> POST /api/portfolio/trade {ticker, quantity, side}
  -> route (Pydantic: side Literal, quantity > 0)
  -> portfolio.execute_trade
       ensure_priced (await; may add_ticker to source)
       read PriceCache price
       [sync txn: validate, upsert/delete position, cash, trades row, snapshot row]
       sync(ticker) in finally
  -> {trade, portfolio: PortfolioView}      (no follow-up GET)
  -> portfolio store replaced; header/positions/heatmap re-derive from live prices
```

### Key Data Flows

1. **Price stream:** `Simulator/Massive task -> PriceCache.update (version++) -> SSE generator (500 ms check, sends only on version change; one event = dict of ALL tracked tickers) -> prices store (latest map + per-ticker ring buffers) -> selectors -> rows/charts`.
2. **Tracked-ticker rule:** `watchlist.add/remove | trade | startup -> tracking.sync/ensure_priced -> DB read (watched, held) -> source.add/remove_ticker (-> cache.remove)`. The SSE key set is therefore watchlist ∪ positions, NOT the watchlist. The frontend gets watchlist membership from `GET /api/watchlist`, never from SSE keys.
3. **Chat turn:** `POST /api/chat -> llm.chat: portfolio_view + watchlist prices + last 20 messages -> prompt -> await llm (acompletion or mock) -> parse ChatResponse -> for each trade / watchlist change: call portfolio.* (per-action try/except DomainError) -> persist user + assistant rows (actions JSON incl. per-action ok/error) -> {message, actions[], portfolio, watchlist}`. Action results are appended to the stored assistant content in the history sent next turn so the LLM knows what failed (no second LLM round trip).
4. **Valuation:** server returns `cash`, positions `(ticker, quantity, avg_cost)` plus server-priced fields for first paint; the client re-derives `market_value`, `unrealized_pnl`, `total_value` from live SSE prices (`cash + Σ qty × price`), so header/positions/heatmap update every tick without polling.
5. **P&L chart:** initial `GET /api/portfolio/history` (server records a snapshot as a side effect), then the client appends live points from derived total value (throttle ~1/s) and re-fetches history every 30 s while the tab is open (each fetch records a snapshot, restoring the "30 s cadence" only when someone is watching). Without this the §13 #20 simplification yields a nearly empty chart on first launch (one point renders nothing).
6. **Startup:** `DB init -> initial_tickers -> source.start -> cache populated -> first SSE event already has prices`.

### Frontend State Management

```
EventSource (created once, in root effect -> prices.connect(); cleanup closes)
   onmessage -> prices.latest[ticker] = update; buffers[ticker].push({time: floor(ts), value})
   onopen/onerror -> status: open=green, readyState CONNECTING=yellow, CLOSED=red
        │ selectors: usePrice(ticker), useStatus()          │ imperative: store.subscribe -> series.update()
        ▼                                                    ▼
   Row (own re-render + flash)                  Lightweight Charts instances (no React re-render per tick)
portfolio store <- GET /api/portfolio (mount), trade response, chat response
watchlist store <- GET /api/watchlist (mount), add/remove response, chat response
```

- **One EventSource, at the root,** idempotent `connect()` (React StrictMode double-mounts effects in dev; cleanup must close). Create it inside an effect, never at module scope (static export prerenders; `EventSource`/`window` do not exist at build time).
- **Buffers hold every tracked ticker from page load** (not just the selected one), so clicking a ticker shows its full since-load history. Cap length (e.g. 600 points) as ring buffers held in the store, outside React state.
- **Lightweight Charts needs strictly ascending integer-second `time`.** Ticks arrive every 500 ms, so dedupe by second (overwrite the last point when `floor(ts)` repeats) and never push an older time; both violations throw. Use the v5 API (`chart.addSeries(LineSeries, opts)`; verify against current docs, the older `addLineSeries` is gone).
- **Throttle derived heavy views** (treemap relayout, P&L append) to ~1 Hz; per-row price/flash updates stay per tick.
- **Flash:** per-row `useFlash(direction)` applies a class and clears it after ~500 ms; no flash on `flat`.
- **Treemap:** `d3-hierarchy` treemap layout + absolutely positioned divs (tiny, fully stylable), sized by market value, colored by P&L %. Recharts `Treemap` is the fallback.
- **Sparklines:** a minimal LWC instance per row is within the PROJECT.md decision (one chart lib); if profiling shows 10-20 instances are heavy, swap to an SVG polyline fed from the same buffer (no other code changes).
- **Everything is a client component;** `page.tsx` is a thin shell; no data fetching in server components, no dynamic routes, `images.unoptimized: true`.

### API contract the roadmap must pin before frontend work

| Endpoint | Success shape | Errors |
|----------|---------------|--------|
| SSE `/api/stream/prices` | `{TICKER: {ticker, price, previous_price, timestamp, change, direction, day_change_percent}}` per cache-version change | n/a |
| `GET /api/portfolio` | `PortfolioView {cash, total_value, unrealized_pnl, positions:[{ticker, quantity, avg_cost, price, market_value, unrealized_pnl, pnl_percent}]}` | |
| `POST /api/portfolio/trade` | `{trade, portfolio: PortfolioView}` | 400 `{"error"}` |
| `GET /api/portfolio/history` | `[{total_value, recorded_at}]` (records a snapshot first) | |
| `GET /api/watchlist` | `[{ticker, price, previous_price, day_change_percent, direction} (price may be null)]` | |
| `POST /api/watchlist` | `{watchlist: [...]}` (re-adding is an idempotent success) | 400 invalid/unknown |
| `DELETE /api/watchlist/{ticker}` | `{watchlist: [...]}` | 404 unknown |
| `POST /api/chat` | `{message, actions:[{type:"trade"\|"watchlist", ..., ok, error?}], portfolio, watchlist}` | LLM failure -> 200 with graceful assistant message, no actions, turn not persisted |

Field-name conflict to resolve in phase 1: MARKET_INTERFACE.md uses `day_change_percent` (and `reference_price`), PROJECT.md says `change_percent`. Pick one name, put it in a shared contract note, and use it everywhere (backend `to_dict`, TS types, tests).

## Build Order (dependency-driven)

```
0 Scaffold/hygiene ─┬─> 1 Market data ──────────────┐
                    └─> 2 DB layer ─────────────────┼─> 3 Domain services + REST ─> 4 LLM chat ─┐
                                                    │            │                                 │
                        5a Frontend shell/theme/stores (needs only SSE shape; starts after 1) ─────┤
                        5b Watchlist+charts (needs 1 + watchlist API) ; 5c portfolio views (needs 3) ; 5d chat panel (needs 4)
                                                                                                    ▼
                                         6 Docker/scripts (walking skeleton early) ─────────> 7 E2E + docs
```

1. **Scaffold + hygiene.** `uv` project deps, `config.py` (`DB_PATH`, `.env`), remove committed `backend/static/` and `test/node_modules/`, gitignore. Include a walking-skeleton Docker build here (health endpoint + placeholder page) to de-risk packaging early (see Pitfall in Anti-Patterns: TLS interception inside Docker build).
2. **Market data package** (parallel with 3). Order inside: `models -> cache -> interface -> seed_prices -> simulator -> factory -> stream`, then `massive_client` (independent, optional, last). A throwaway `main.py` with hard-coded tickers proves SSE end to end. Unit tests per MARKET_INTERFACE.md §13.
3. **DB layer** (parallel with 2). Schema with natural PKs (§13 #19), idempotent `init`, seed, repo functions, `DB_PATH` handling. No dependency on market.
4. **Domain services + REST** (needs 2 and 3). Order: `errors -> tracking -> watchlist -> service(trade/view) -> snapshots -> routes -> health`, then swap the throwaway lifespan for DB-driven `initial_tickers`. Add the static mount here (guarded by `is_dir`). This is the contract-freezing phase: after it the frontend can code against real endpoints.
5. **LLM chat** (needs 4). Order: `schema -> mock -> prompt -> chat orchestration -> /api/chat route` with `LLM_MOCK=true` first (E2E depends on it), then `client.py` real call last (needs the `cerebras` skill and an API key; keep out of the critical path).
6. **Frontend** (starts after 2 for SSE shape; finishes after 4). Order: Next scaffold + Tailwind theme + static-export config -> `api.ts`/types -> prices store + ConnectionDot + watchlist/sparklines/flash -> MainChart -> portfolio store + Header + TradeBar + PositionsTable -> heatmap + P&L chart -> ChatPanel. Frontend unit tests alongside.
7. **Packaging completion:** Dockerfile (Node 24 build -> Python 3.12 slim, copy `out/` to `static/`), `docker-compose.yml`, thin start/stop scripts.
8. **E2E (Playwright on host vs running container) + docs/status corrections.** All §12 scenarios, `LLM_MOCK=true`.

Natural roadmap phases: (A) scaffold + market data, (B) DB + services + REST, (C) LLM chat, (D) frontend (can split in two: live-data UI, then portfolio/chat UI), (E) Docker + scripts + E2E. Phases A and the DB half of B can run in parallel; D's first half can overlap B/C.

## Scaling Considerations

Realistic for a single-user capstone; none of this needs engineering now.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 user, few tabs (target) | Everything as above. Each SSE connection runs a 500 ms loop reading the cache; trivial. |
| Several users (future) | `user_id` columns already exist; per-user watchlists mean tracked set = union across users; cache and SSE stay shared (PLAN.md §6). Still one worker. |
| Many users | Out of scope: would need Postgres, external pub/sub for prices, auth. |

First bottleneck: browser rendering of per-tick updates (mitigate with selectors, throttled heavy views). Second: unbounded `portfolio_snapshots` rows; cap the history query (e.g. last N or downsample) rather than adding retention jobs.

## Anti-Patterns

### Anti-Pattern 1: Blocking LLM call on the event loop

**What people do:** The cerebras skill snippet uses sync `completion(...)`; copying it into an `async def` route.
**Why it's wrong:** The 1-3 s call freezes the event loop: the simulator task stalls and every SSE client stops receiving ticks during each chat turn.
**Do this instead:** `await litellm.acompletion(...)` with the same arguments (`model`, `response_format`, `reasoning_effort`, `extra_body`) or `asyncio.to_thread(completion, ...)`. Never hold a DB transaction across it.

### Anti-Pattern 2: Tracking logic spread across callers

**What people do:** Routes, chat code and trade code each call `source.add_ticker/remove_ticker` with their own conditions.
**Why it's wrong:** Held tickers lose prices (PLAN.md §13 #1), or tracked-but-unowned tickers leak.
**Do this instead:** Only `tracking.py` touches the source; everything else calls `sync`/`ensure_priced`.

### Anti-Pattern 3: LLM path with its own trade/watchlist logic

**What people do:** Chat handler writes SQL or reimplements validation.
**Why it's wrong:** Manual and AI trades diverge; E2E passes for one and not the other.
**Do this instead:** Chat calls `portfolio.execute_trade` and `watchlist.add/remove`, catching `DomainError` per action.

### Anti-Pattern 4: Treating SSE keys as the watchlist

**What people do:** Render the watchlist from the stream's ticker set.
**Why it's wrong:** The stream is watchlist ∪ positions; a held-but-unwatched ticker would appear in the watchlist and removal would appear to "not work".
**Do this instead:** Membership from `GET /api/watchlist`; prices from the SSE store.

### Anti-Pattern 5: Multiple workers or per-component EventSource

**What people do:** `uvicorn --workers 4`, or each component opening its own `EventSource`.
**Why it's wrong:** Each worker owns a separate cache and simulator (diverging prices, trades priced differently from the stream); N EventSources multiply server loops and fragment buffers.
**Do this instead:** Exactly one worker (Docker CMD) and one root-level store-owned EventSource.

### Anti-Pattern 6: Module-global singletons and unguarded static mount

**What people do:** `price_cache`/`market_source` at import time (as in the MARKET_INTERFACE.md sketch) and `StaticFiles(directory="static")` unconditionally.
**Why it's wrong:** Tests cannot isolate DB/source; `StaticFiles` raises at import when `static/` is absent (dev, pytest, CI).
**Do this instead:** `create_app()` factory, `Services` on `app.state`, mount only if the directory exists; tests use `with TestClient(app)` so lifespan runs (without the context manager the DB is never initialized and the source never starts).

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| OpenRouter -> Cerebras (gpt-oss-120b) | `litellm.acompletion`, `response_format=<Pydantic>`, `extra_body={"provider": {"order": ["cerebras"]}}` | Strict structured outputs usually require every field present and `additionalProperties: false`: declare `trades` and `watchlist_changes` as required lists (may be empty) in the LLM-facing schema, and parse tolerantly. LOW-MEDIUM confidence; verify with one real call in the LLM phase. Failures (timeout, malformed JSON, missing key) -> graceful assistant message. |
| Massive REST | `MassiveDataSource` in `asyncio.to_thread`; paid snapshot every 5 s, free-plan EOD fallback | A snapshot in flight when `remove_ticker` runs can re-write a just-removed ticker into the cache (thread race); harmless but can briefly show a stale ghost price. Not worth locks; note in tests. |
| Browser `EventSource` | `retry: 1000`; auto-reconnect | Silence is normal on the Massive free plan; derive connection status only from `onopen`/`onerror`/`readyState`, never from message recency. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| routes <-> portfolio services | Direct async function calls with `Services` via `Depends` | Routes translate nothing but HTTP; errors via handlers. |
| llm.chat <-> portfolio services | Direct calls, per-action `try/except DomainError` | One-way dependency; portfolio never imports llm. |
| portfolio <-> market | `PriceCache` reads; `MarketDataSource` calls only from `tracking.py` | Valuation falls back to `avg_cost` if a held ticker somehow has no price instead of 500-ing. |
| portfolio <-> db | Repo functions; `db.transaction()` context manager | Use stdlib `sqlite3`, new connection per operation (cheap), default journal mode (WAL adds `-wal/-shm` files that behave badly on some Windows bind mounts; single process needs no WAL). `aiosqlite` is the alternative if a reviewer insists on async DB; not needed here. |
| frontend <-> backend | Same-origin `/api/*`; SSE | Dev: `output: 'export'` ignores `rewrites` for the production build; for `next dev` either guard a dev-only rewrite to `localhost:8000` or just rebuild the export and let FastAPI serve it. Verify in the frontend phase (LOW-MEDIUM). |

## Notable Pitfalls Found While Designing (feed into PITFALLS.md)

- **Unknown-ticker prices are random per restart.** `GBMSimulator.add_ticker` uses `rng.uniform(50, 300)` for non-seed tickers; after a restart a held non-seed position (e.g. bought PYPL @ 120) reprices randomly and P&L is nonsense. Fix cheaply: derive the price from the ticker (`random.Random(ticker).uniform(50, 300)` or a hash) so it is stable across restarts.
- **Float residue on sell-all.** Fractional REAL quantities leave `1e-17` after selling "everything": round quantity at the boundary (e.g. 6 dp), compare with a small epsilon, delete the row at <= epsilon (PROJECT.md: row deleted at 0).
- **SSE blocks graceful shutdown.** Open EventSource connections keep uvicorn waiting; `docker stop` then waits out the 10 s timeout. Run uvicorn with a short `--timeout-graceful-shutdown` (MEDIUM confidence) and a single worker.
- **Docker build on this machine:** Avast TLS interception may break `npm ci`/`uv sync` inside the build stages (container does not have the host's root cert). Do a walking-skeleton Docker build in phase A to learn this early; the CLAUDE.md prohibits disabling verification, so the fix is injecting the CA, not `-k`.
- **Snapshot side effect on GET.** `GET /api/portfolio/history` writes; keep it idempotent-ish and cheap, and cap the returned rows.
- **Optional E2E determinism:** the simulator accepts a seed in `GBMSimulator` but `SimulatorDataSource` does not expose it; an optional `SIM_SEED` env var helps flake-free E2E assertions on prices.

## Sources

- C:/Users/shola/Projects/finally/planning/PLAN.md (spec, §13 review resolutions) - HIGH
- C:/Users/shola/Projects/finally/.planning/PROJECT.md (resolved contract decisions) - HIGH
- C:/Users/shola/Projects/finally/planning/MARKET_INTERFACE.md and MARKET_SIMULATOR.md (module layout, tracking rule, SSE shape, lifespan sketch, simulator code) - HIGH
- C:/Users/shola/Projects/finally/.claude/skills/cerebras/SKILL.md (LiteLLM call pattern; sync `completion` shown, async adaptation is mine) - HIGH for the pattern, MEDIUM for the async/strict-schema adaptation
- FastAPI docs via Context7 and https://fastapi.tiangolo.com/tutorial/frontend (StaticFiles signature; `app.frontend()` priority and fallback behaviour; version introduced not stated) - MEDIUM
- Lightweight Charts v5 API, uvicorn graceful-shutdown behaviour, Next static-export constraints: training knowledge, not re-verified this session - MEDIUM/LOW

---
*Architecture research for: AI trading workstation (FinAlly)*
*Researched: 2026-10-06*
