# Phase 2: Live Market Terminal - Research

**Researched:** 2026-10-08
**Domain:** Python market-data engine (GBM simulator + Massive REST poller) -> in-memory cache -> FastAPI native SSE -> SQLite seed -> Next.js static-export terminal UI (zustand store, Lightweight Charts sparklines)
**Confidence:** HIGH for engine, SSE, shutdown and EventSource behavior (all probed this session); MEDIUM for Massive free-tier details (no API key available, only stubs can be tested)

<user_constraints>
## User Constraints (from CONTEXT.md)

No CONTEXT.md exists for this phase: the user chose to continue without `/gsd-discuss-phase`. There are therefore no discuss-phase decisions to copy. The binding constraints are:

### Locked Decisions (from `.planning/PROJECT.md` "Resolved contract decisions", `.claude/CLAUDE.md`, user CLAUDE.md)
- Tracked tickers = watchlist union open positions (MKT-08 lands in Phase 3, but Phase 2 startup must already load `watchlist UNION positions`).
- Change % = change since session start price (`session_start_price`), not tick-over-tick, not daily.
- SSE payload: one event per cache-version change, a dict of all tracked tickers; `planning/API_CONTRACT.md` is authoritative and wins over `planning/MARKET_INTERFACE.md`.
- Natural primary keys: `users_profile(user_id)`, `watchlist(user_id, ticker)`, `positions(user_id, ticker)`; UUID ids only on `trades`, `portfolio_snapshots`, `chat_messages`.
- DB path: `DB_PATH`, default `<root>/db/finally.db`; `/app/db/finally.db` in Docker.
- Lightweight Charts (canvas) for sparklines, main chart and P&L chart; treemap is a separate concern (Phase 4).
- Massive paid polling 2-15s (5s default); free tier falls back to Grouped Daily.
- Stack fixed: FastAPI + Python 3.12 via uv, Next.js static export + Tailwind, SQLite via stdlib `sqlite3` (no ORM), single container, single port 8000, one origin.
- User style: simple, incremental, short modules/functions, no defensive programming, no emojis, `uv run`/`uv add` only, pytest as `uv run python -m pytest`, TLS verification never disabled, latest library APIs.
- UI safety gate: STATE.md records that a UI-SPEC must be produced with `/gsd-ui-phase 2` before any Phase 2 UI work.

### Claude's Discretion
Everything not listed above: module-internal structure, plan split, test layout, sparkline/store internals, connection-dot timing thresholds, 405-vs-404 decision (see Open Questions).

### Deferred Ideas (OUT OF SCOPE)
- Trading, watchlist add/remove (WL-02, WL-03, UI-06, MKT-08), main chart / treemap / P&L chart (UI-07, PUI-03/04), chat, compose/scripts, full E2E suite.
- Market hours, mean-reverting vol, market-wide factor (MARKET_SIMULATOR.md section 5).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MKT-01 | Correlated GBM simulator, ~500ms ticks, realistic seeds | `GBMSimulator` from MARKET_SIMULATOR.md; Cholesky verified positive definite for any ticker mix (min eigenvalue 0.4 over 300 random sets) |
| MKT-02 | Occasional 2-5% event moves | `_event_shocks`, `SIM_EVENT_PROBABILITY` (default 0.001 from `Settings`) |
| MKT-03 | Deterministic ticker-derived start price for non-seed tickers | Replace `rng.uniform(50,300)` with a sha256-derived price; Python `hash()` is salted per process and must not be used |
| MKT-04 | `SIM_SEED` reproducibility, configurable event probability | `np.random.default_rng(seed)`; with MKT-03 the RNG is no longer consumed on add, so output is independent of add order |
| MKT-05 | Massive REST poller (paid snapshot, free Grouped Daily) | `massive` 2.8.0 client probed; exception/model shapes verified; call-budget plan for free tier |
| MKT-06 | One abstract interface + factory | `MarketDataSource` ABC; factory takes `Settings`, not `os.environ` |
| MKT-07 | Price cache with version counter, previous, session-start | `PriceCache` per MARKET_INTERFACE.md section 4 |
| MKT-09 | `GET /api/stream/prices` SSE | FastAPI native `EventSourceResponse` wire output probed; matches contract |
| MKT-10 | Clean start/stop, no SSE hang on shutdown | Only `timeout_graceful_shutdown` works; lifespan-event approach in PITFALLS.md is wrong (probed) |
| DB-01 | SQLite lazily/idempotently created + seeded | `autocommit=True` connect, `CREATE TABLE IF NOT EXISTS`, `INSERT OR IGNORE`, in lifespan before first request |
| DB-02 | Natural PKs, UUID on append-only tables, `user_id` default | Schema section below |
| DB-03 | Seed: $10,000, 10 tickers, initial $10,000 snapshot | Seed section below |
| WL-01 | `GET /api/watchlist` with latest prices | Join watchlist rows with cache; null price fields until priced |
| PORT-01 | `GET /api/portfolio` | Pure `build_portfolio(conn, cache)`; missing price falls back to `avg_cost` |
| UI-01 | Dark terminal theme, dense layout | Existing `@theme` tokens in `globals.css`; UI-SPEC required first |
| UI-02 | Header: live total, cash, connection dot | `liveTotals()` pure function + `ConnectionDot` state machine (EventSource behavior probed) |
| UI-03 | Single EventSource, reconnects | One hook at page root, cleanup `close()`, readyState-driven states |
| UI-04 | Watchlist panel + sparkline | zustand store, Lightweight Charts v5 `addSeries(LineSeries)` |
| UI-05 | Green/red flash fading ~500ms | CSS `@keyframes` in Tailwind `@theme`; flash seq only advances on non-flat ticks |
| UI-08 | `--` before first value; shared formatters; tabular nums | `format.ts` + `tabular-nums` |
| TEST-01 | Market data unit tests | Test map in Validation Architecture |
</phase_requirements>

## Summary

Phase 2 replaces the placeholder page and adds the whole market-data vertical: a `backend/app/market/` package (models, cache, interface, seed data, GBM simulator, Massive poller, factory, SSE route), a SQLite layer created in the app lifespan, `GET /api/watchlist` and `GET /api/portfolio`, and a terminal UI (header with live total/cash/connection dot, watchlist rows with flashing price, change % and sparkline). The design is already written down in `planning/MARKET_INTERFACE.md` and `planning/MARKET_SIMULATOR.md`; most of the code can be taken from there with the targeted corrections listed under "Deltas from the design docs" below.

Four findings change the plan and should be treated as binding. (1) The shutdown mechanism in `.planning/research/PITFALLS.md` (set an `asyncio.Event` in lifespan after `yield`) does NOT work: uvicorn waits for open connections BEFORE running lifespan shutdown, so the event is set too late. Only `--timeout-graceful-shutdown` ends open SSE streams (probed: 1.17 s with timeout=1; hangs with default and with the event approach). The Dockerfile CMD already has `--timeout-graceful-shutdown 3`; the local run commands and the Playwright `webServer` command do not. (2) `httpx.ASGITransport` does NOT stream an infinite SSE response (probed: no data within 4 s), contradicting STACK.md; test the generator directly and test the wire/shutdown behavior with a real in-process `uvicorn.Server`. (3) In Chromium, when the backend dies `EventSource` stays `readyState == 0 (CONNECTING)` and fires `error` about once per second forever, then `open` after the backend returns (probed); it only goes `CLOSED (2)` on a non-200 response. A "red" dot therefore needs a timer, not just `readyState`. (4) The existing Phase 1 Playwright specs (`smoke.spec.ts`, `health-status.spec.ts`) assert the placeholder's `app-title` and `api-status` and will break when `page.tsx` is replaced.

The Massive `massive` client works on this machine without `truststore` right now (a plain certifi `urllib3` request to `api.massive.com` reached the API and returned HTTP 401, and the live chain is a normal Let's Encrypt chain, no interception). Do not add `truststore`. The Massive path can only be verified against stubs because no live key is available to research; the free-tier call budget (5/min) is the real design constraint.

**Primary recommendation:** Build a thin tracer first (Wave 1: cache + GBM simulator + native SSE route + lifespan, plus a store/EventSource hook and one row in the browser), then add the SQLite layer and REST reads, then Massive, then the full terminal UI after `/gsd-ui-phase 2` has produced a UI-SPEC.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Price generation (GBM, events, Massive polling) | API / Backend (background task) | - | Single producer writes to the cache; routes never call the source |
| Latest-price store, version counter, session-start price | API / Backend (in-memory) | - | Shared by SSE, watchlist, portfolio valuation |
| SSE fan-out of the price dict | API / Backend | - | `GET /api/stream/prices`, one frame per cache version |
| Seeded persistence (cash, watchlist, snapshots) | Database / Storage (SQLite) | API / Backend | Created in lifespan startup, before the first request |
| Watchlist membership | Database / Storage | API / Backend | Membership comes from `GET /api/watchlist`, never from SSE keys |
| Portfolio valuation (cash + positions x price) | API / Backend | Browser (live re-pricing) | Server is authoritative; browser re-prices with SSE for the header |
| Sparkline history | Browser / Client | - | Accumulated from SSE since page load (PLAN.md); never persisted |
| Price flash, formatters, "--" placeholder | Browser / Client | - | Pure presentation |
| Connection indicator | Browser / Client | - | Driven by `EventSource` readyState + timer |
| Static page serving | API / Backend (`StaticFiles`) | CDN / Static | Already in Phase 1; unchanged |

## Standard Stack

### Core (added by this phase)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| numpy | 2.5.3 | GBM vector math, Cholesky, seeded `default_rng` | Required by `planning/MARKET_SIMULATOR.md`; `uv pip install --dry-run` resolved 2.5.3 `[VERIFIED: uv dry-run this session]` |
| massive | 2.8.0 | Optional Massive REST client (`RESTClient`) | Official client; sync (urllib3) so call via `asyncio.to_thread`; pulls urllib3 2.8.0 `[VERIFIED: uv dry-run, installed in scratch and introspected]` |
| lightweight-charts | 5.2.1 | Sparklines (canvas) | PROJECT.md decision 14; v5 API `chart.addSeries(LineSeries, opts)` `[VERIFIED: npm view; typings.d.ts of a scratch install]` |
| zustand | 5.0.15 | Price store fed by SSE, per-ticker selectors | Avoids re-rendering the whole tree twice a second `[VERIFIED: npm view]` |

Already installed and reused: FastAPI 0.142.2 (native `fastapi.sse`), uvicorn 0.54.0, python-dotenv 1.2.4, Next 16.4, React 19.3, Tailwind 4.3.3, Playwright 1.63.0 `[VERIFIED: backend/pyproject.toml, frontend/package.json, test/package.json read this session]`.

### Supporting (test tooling, added by this phase)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pytest-asyncio | 1.4.0 (dev extra) | Async tests for cache/simulator/stream/shutdown | Set `asyncio_mode = "auto"` in `[tool.pytest.ini_options]` `[VERIFIED: uv dry-run resolves with pytest 9.1.1]` |
| vitest | 5.0.3 | Frontend unit runner | Formatters, store reducers, connection state machine, flash logic |
| vite | 8.3.3 | Vitest peer | Dev dependency only |
| @vitejs/plugin-react | 6.1.2 | JSX in Vitest | Needs vite ^8 |
| jsdom | 30.1.2 | DOM env for component tests | Local Node here is 26.8.1, which satisfies jsdom 30 `[VERIFIED: node --version]` |
| @testing-library/react | 16.3.3 | Render `WatchlistRow` | Needs `@testing-library/dom` ^10 installed explicitly |
| @testing-library/dom | 10.4.2 | RTL peer | |
| @testing-library/jest-dom | 7.0.1 | Matchers | Import `@testing-library/jest-dom/vitest` in the setup file |

The npm versions above are the current registry versions `[VERIFIED: npm view this session]`; the compatibility matrix (vitest 5 needs vite ^8, jsdom 30 needs Node ^24.15, etc.) is `[CITED: .planning/research/STACK.md]`.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| zustand | `useSyncExternalStore` hand-rolled store | Zero dependency, a bit more code; zustand selectors make per-row re-render trivial. Either is fine; this research prescribes zustand |
| pytest-asyncio | `asyncio.run()` inside sync tests | One fewer dependency; more boilerplate and no fixtures for the in-process server. Prescribed: pytest-asyncio |
| `truststore` | none | NOT needed: probe shows certifi works here today. Add only if `CERTIFICATE_VERIFY_FAILED` appears, and only call `truststore.inject_into_ssl()` in the Massive branch |
| Plain SVG sparkline | Lightweight Charts | Decision 14 fixes Lightweight Charts; keep one charting library for Phases 2 and 4 |

**Installation:**
```bash
# backend/   (UV_SYSTEM_CERTS=1 in this shell; pins use == per the Phase 1 decision)
uv add numpy==2.5.3 massive==2.8.0
uv add --optional dev pytest-asyncio==1.4.0

# frontend/
npm install --save-exact lightweight-charts@5.2.1 zustand@5.0.15
npm install --save-dev --save-exact vitest@5.0.3 vite@8.3.3 @vitejs/plugin-react@6.1.2 jsdom@30.1.2 @testing-library/react@16.3.3 @testing-library/dom@10.4.2 @testing-library/jest-dom@7.0.1
```

## Package Legitimacy Audit

Run with `gsd-tools query package-legitimacy check`. PyPI download counts are not available to the seam, so every PyPI package comes back `SUS` with `unknown-downloads`; this is a tool limitation, not evidence of a problem. npm `SUS` verdicts are all `too-new` (latest release within weeks) on packages with 70M-230M weekly downloads and official source repos.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| numpy | PyPI | 2.5.3 published 2026-09-06 | unknown (seam) | none reported by seam | SUS (unknown-downloads, no-repository) | Flagged - planner adds one batched `checkpoint:human-verify` |
| massive | PyPI | 2.8.0 published 2026-05-26 | unknown (seam) | massive.com | SUS (unknown-downloads) | Flagged - same checkpoint; recommended by project docs and official docs `[CITED: planning/MASSIVE_API.md]` |
| pytest-asyncio | PyPI | 1.4.0 published 2026-05-26 | unknown (seam) | github.com/pytest-dev/pytest-asyncio | SUS (unknown-downloads) | Flagged - same checkpoint |
| truststore | PyPI | 0.10.4 published 2025-08-12 | unknown (seam) | github.com/sethmlarson/truststore | SUS (unknown-downloads) | NOT recommended for this phase (not needed) |
| lightweight-charts | npm | published 2026-08-12 | 1.37M/wk | github.com/tradingview/lightweight-charts | OK | Approved |
| zustand | npm | published 2026-08-13 | 71.5M/wk | github.com/pmndrs/zustand | OK | Approved |
| @testing-library/react | npm | 2026-08-27 | 79.9M/wk | github.com/testing-library/react-testing-library | OK | Approved |
| @testing-library/jest-dom | npm | 2026-08-09 | 85.3M/wk | github.com/testing-library/jest-dom | OK | Approved |
| vitest | npm | 2026-09-30 | 142M/wk | github.com/vitest-dev/vitest | SUS (too-new) | Flagged - same checkpoint |
| vite | npm | 2026-10-06 | 232M/wk | github.com/vitejs/vite | SUS (too-new) | Flagged |
| @vitejs/plugin-react | npm | 2026-10-05 | 117M/wk | github.com/vitejs/vite-plugin-react | SUS (too-new) | Flagged |
| jsdom | npm | 2026-10-04 | 132M/wk | github.com/jsdom/jsdom | SUS (too-new) | Flagged |
| @testing-library/dom | npm | 2026-09-13 | 97.5M/wk | github.com/testing-library/dom-testing-library | SUS (too-new) | Flagged |

**Packages removed due to SLOP verdict:** none
**Packages flagged SUS:** numpy, massive, pytest-asyncio, vitest, vite, @vitejs/plugin-react, jsdom, @testing-library/dom. No package has a `postinstall` script (`npm view <pkg> scripts.postinstall` returned empty for all npm packages checked). The planner should add ONE `checkpoint:human-verify` task before the first `uv add` / `npm install` that lists these pinned versions (the same pattern Phase 1 used), rather than one checkpoint per package.

## Architecture Patterns

### System Architecture Diagram

```
 startup (lifespan)                                   browser (one origin :8000)
 ------------------                                   -------------------------
 Settings.from_env                                     page.tsx (client)
   |                                                     |  mounts once
   v                                                     v
 init_db(db_path) --create/seed--> SQLite  <---read---  GET /api/watchlist  --> membership + initial prices
   |                                  ^                  GET /api/portfolio  --> cash, total_value, positions
   v                                  |                  |
 tracked = watchlist UNION positions -+                  v
   |                                                   usePriceStream  (ONE EventSource)
   v                                                     |  onopen/onerror/readyState + 5 s timer
 create_market_data_source(cache, settings)              v
   |-- MASSIVE_API_KEY empty --> SimulatorDataSource   zustand store
   '-- set ----------------> MassiveDataSource           |- prices  (replace per frame, keyed by ticker)
          | start(tracked) returns after first prices    |- flash   {dir, seq} per ticker (seq++ on up/down only)
          v                                              |- spark   capped per-second points per ticker
 background task: sim.step() every 0.5 s                 |- status  connected | reconnecting | disconnected
 or Massive poll (to_thread) every 5 s / 15 min          v
          | cache.update(...)  (version += 1)         Header (live total, cash, dot)  WatchlistRow x10
          v                                             (PriceCell flash, change %, Sparkline canvas)
 PriceCache  <---- get_all() every 0.1 s poll, send only if version changed
          |
          v
 GET /api/stream/prices  (EventSourceResponse)
   frame 0: "retry: 1000"       frame n: "data: {AAPL:{...}, ...}"       ": ping" every 15 s (FastAPI)
```

### Recommended Project Structure

```
backend/app/
├── main.py               # create_app: builds cache + source, lifespan, routers above the /api catch-all
├── config.py errors.py   # existing
├── db.py                 # connect(), init_db(), SCHEMA, seed; load_tracked_tickers()
├── watchlist.py          # GET /api/watchlist router + build_watchlist()
├── portfolio.py          # GET /api/portfolio router + build_portfolio()
└── market/
    ├── models.py cache.py interface.py seed_prices.py
    ├── simulator.py      # GBMSimulator + SimulatorDataSource
    ├── massive_client.py # MassiveDataSource
    ├── factory.py        # create_market_data_source(cache, settings)
    └── stream.py         # price_frames() generator + router
backend/tests/
├── market/ (test_cache.py test_simulator.py test_massive.py test_factory.py test_stream.py test_shutdown.py)
└── test_db.py test_watchlist.py test_portfolio.py
frontend/src/
├── app/page.tsx          # composes Header + WatchlistPanel, mounts usePriceStream once
├── lib/ api.ts types.ts format.ts store.ts useMarketStream.ts totals.ts
└── components/ Header.tsx ConnectionDot.tsx WatchlistPanel.tsx WatchlistRow.tsx PriceCell.tsx Sparkline.tsx
frontend/vitest.config.ts vitest.setup.ts
```
Give test files unique basenames (pytest rootdir mode without `__init__.py` collides on duplicate basenames) `[ASSUMED]`.

### Pattern 1: Native FastAPI SSE route (probed)

**What:** An async-generator path operation with `response_class=EventSourceResponse`. Yielding `ServerSentEvent(retry=1000)` emits the contract's first `retry: 1000` line; yielding `ServerSentEvent(data=<dict>)` emits `data: <json>`. FastAPI adds `: ping` every 15 s, `Cache-Control: no-cache`, `X-Accel-Buffering: no`.

**Probed output** (scratch run against the installed FastAPI 0.142.2): `'retry: 1000\n\ndata: {"AAPL": {"price": 7}}\n\n'`, content type `text/event-stream; charset=utf-8`, headers `cache-control: no-cache`, `x-accel-buffering: no`. A `Request` parameter on the generator path operation is injected normally. `[VERIFIED: scratch run; fastapi/sse.py and fastapi/routing.py read]`

```python
# Source: probed in scratchpad against fastapi 0.142.2; wire shape from planning/API_CONTRACT.md
@router.get("/api/stream/prices", response_class=EventSourceResponse)
async def stream_prices(request: Request) -> AsyncIterable[ServerSentEvent]:
    yield ServerSentEvent(retry=1000)
    async for payload in price_frames(request.app.state.cache):
        yield ServerSentEvent(data=payload)

async def price_frames(cache: PriceCache, poll_seconds: float = 0.1) -> AsyncIterator[dict]:
    """Yield the full price dict whenever the cache version changes."""
    last = -1
    while True:
        if cache.version != last:
            last = cache.version
            yield {t: u.to_dict() for t, u in cache.get_all().items()}
        await asyncio.sleep(poll_seconds)
```
No `request.is_disconnected()` is needed: FastAPI cancels the generator on client disconnect (STACK.md, and the producer task group in `routing.py` is cancelled when the response ends). Keep `price_frames` a separate plain generator so unit tests can `anext()` it with no HTTP.

### Pattern 2: Lifespan wiring and shutdown (probed)

Build `PriceCache` and the source inside `create_app` (not at import), store on `app.state`, start/stop in `lifespan`. `await source.stop()` must `cancel()` AND await the task (`contextlib.suppress(asyncio.CancelledError)`) so no "Task was destroyed but it is pending" warning appears.

Shutdown ordering in uvicorn 0.54.0 (probed with a connected SSE client and `server.should_exit = True`):

| Setup | Result |
|-------|--------|
| default (no timeout) | server never exits (still running after 12 s; had to `force_exit`) |
| lifespan `asyncio.Event` set after `yield` (the PITFALLS.md #4 recipe) | server never exits - lifespan shutdown runs AFTER uvicorn waits for connections, so the event is set too late |
| `timeout_graceful_shutdown=1` | server exited after 1.17 s; lifespan shutdown ran; uvicorn logs one `ERROR ... CancelledError: Task cancelled, timeout graceful shutdown exceeded` traceback (cosmetic) |

`[VERIFIED: scratch experiment /scratchpad/sse_shutdown.py, three modes]`. Therefore: every way of launching the server must pass `--timeout-graceful-shutdown N` (use 2 or 3). The Dockerfile CMD already has `--timeout-graceful-shutdown 3` `[VERIFIED: Dockerfile read this session]`; the README dev command, the Playwright `webServer` command in `test/playwright.config.ts` and any new scripts do not and must be updated. Do not add the lifespan-event machinery.

### Pattern 3: SQLite init (lifespan, before first request)

Init synchronously in lifespan startup (removes the lazy-init race, PITFALLS.md #14): `Path(db_path).parent.mkdir(parents=True, exist_ok=True)`, connect with `autocommit=True` (Python 3.12 `sqlite3.connect(..., autocommit=True)` and explicit `BEGIN IMMEDIATE` verified), `PRAGMA journal_mode=WAL`, `CREATE TABLE IF NOT EXISTS` for all six tables, `INSERT OR IGNORE` for the seed rows, all in one explicit transaction. Handlers are plain `def` (threadpool) and open a short-lived connection per request via a small `connect(settings.db_path)` context manager; no shared connection across threads.

Schema (from DB-02 and PLAN.md section 7, with natural keys per PROJECT.md decision 13):

| Table | Primary key | Other columns |
|-------|-------------|---------------|
| users_profile | `user_id TEXT` | `cash_balance REAL` default 10000.0, `created_at TEXT` |
| watchlist | `(user_id, ticker)` | `added_at TEXT` |
| positions | `(user_id, ticker)` | `quantity REAL`, `avg_cost REAL`, `updated_at TEXT` |
| trades | `id TEXT` (UUID) | `user_id`, `ticker`, `side`, `quantity`, `price`, `executed_at` |
| portfolio_snapshots | `id TEXT` (UUID) | `user_id`, `total_value REAL`, `recorded_at TEXT` |
| chat_messages | `id TEXT` (UUID) | `user_id`, `role`, `content`, `actions TEXT`, `created_at` |

Every table carries `user_id TEXT NOT NULL DEFAULT 'default'`. Safety nets from PITFALLS.md: `CHECK (cash_balance >= 0)`, `CHECK (quantity > 0)`. Seed (DB-03): one `users_profile` row (`default`, 10000.0), ten watchlist rows in the order AAPL, GOOGL, MSFT, AMZN, TSLA, NVDA, META, JPM, V, NFLX, and one `portfolio_snapshots` row with `total_value` 10000.0. The snapshot has a UUID id, so make the seed insert idempotent with a guard (`INSERT ... SELECT ... WHERE NOT EXISTS (SELECT 1 FROM portfolio_snapshots)`), not `INSERT OR IGNORE`, otherwise each restart adds a row. Order watchlist reads by `rowid`/insertion order so the panel order is stable.

### Pattern 4: Frontend store and connection state machine

- Store state: `prices` (replaced, not merged, each frame), `flash[ticker] = {dir, seq}` where `seq` increments only when `direction` is `up` or `down` (a `flat` tick must not clear a visible flash, PITFALLS.md #13), `spark[ticker]` = capped (300) array of `{time, value}` using client arrival seconds with same-second replacement, `status`. Keep the reducers as pure functions (`applyFrame(state, frame, nowSeconds)`) so Vitest tests them without React.
- Join, do not derive: rows come from `GET /api/watchlist` membership joined with `prices[ticker]`; never `Object.keys(prices)` (API contract states this) `[VERIFIED: planning/API_CONTRACT.md "Clients must not derive the watchlist from the payload keys"]`.
- Connection dot, driven by what Chromium actually does (probed): on `onopen` -> `connected` (green) and clear the timer; on `onerror` with `readyState === EventSource.CONNECTING` -> `reconnecting` (yellow) and, if no `open` arrives within about 5 s, `disconnected` (red) while the browser keeps retrying by itself; on `readyState === EventSource.CLOSED` (non-200 response) -> `disconnected` (red) and re-create the `EventSource` with capped backoff (1, 2, 4, up to 10 s). Create in `useEffect`, `close()` in cleanup (React StrictMode runs effects twice in `next dev`).
  - Probe results (Chromium via Playwright, backend killed then restarted): `open rs=1` -> after kill `error rs=0` roughly every 1.0 s indefinitely (never CLOSED) -> after restart `open rs=1` about 2 s after the server returned. A fulfilled HTTP 500 gave `error rs=2` (CLOSED) immediately. `route.abort()` simulation retried only every ~3 s (2 requests in 6 s), so use backend kill/restart or `route.fulfill({status: 500})` for E2E, not abort loops. `[VERIFIED: scratch Playwright probes es_probe.cjs / es_route_probe.cjs]`
- Flash: CSS `@keyframes` defined inside Tailwind v4 `@theme` with an `--animate-*` variable `[CITED: tailwindcss.com/docs/theme]`, applied by class on the price cell, restarted by changing the element `key` to the ticker's `flash.seq`. 500ms duration. No JS timers.
- Formatters (UI-08): one `format.ts` using `Intl.NumberFormat("en-US")`, exporting `fmtMoney`, `fmtQty`, `fmtSigned`, `fmtPct`, and returning `"--"` for `null`/`undefined`/non-finite values; render numbers with Tailwind `tabular-nums`.
- Live header total: pure `liveTotals(portfolio, prices)` = `cash + sum(qty * (prices[t]?.price ?? avg_cost))`; with no positions it equals the REST total, but Phase 3/4 then need no rework.

### Pattern 5: Sparkline with Lightweight Charts v5

One small client component per row: `createChart(el, opts)` in `useEffect`, `chart.addSeries(LineSeries, {...})`, `setData` once with the buffer present at mount, then `series.update(lastPoint)` per tick, `chart.remove()` in cleanup. Option names verified in the installed typings: `autoSize`, `handleScroll`, `handleScale`, `layout.attributionLogo`, `rightPriceScale.visible`, `timeScale.visible`, `CrosshairMode.Hidden` `[VERIFIED: lightweight-charts@5.2.1 dist/typings.d.ts]`. Time must be strictly ascending `UTCTimestamp` seconds; `update()` with the same `time` replaces the last point, which is why per-second dedupe works `[CITED: .planning/research/STACK.md, PITFALLS.md #12]`. Give the container an explicit height. The canvas does not render in jsdom: `vi.mock("lightweight-charts")` in component tests.

Attribution: `attributionLogo` defaults to true; the licence requires the NOTICE attribution plus a link to https://www.tradingview.com/ somewhere on the page, and the logo satisfies that; if you disable it you must provide that link yourself `[CITED: Context7 /tradingview/lightweight-charts layout-options.ts]`. Ten logos on ten sparklines is clutter, so the recommended default is `attributionLogo: false` on sparklines plus one small footer link to tradingview.com, while Phase 4's main chart keeps the logo. This is a UI-SPEC decision (see Open Questions).

### Anti-Patterns to Avoid
- **Module-level cache/source singletons** (as in MARKET_INTERFACE.md section 11): tests then share state; build them in `create_app`.
- **Setting a shutdown `asyncio.Event` in lifespan teardown to end SSE**: proven not to work (above).
- **Testing an infinite SSE route through `TestClient` or `httpx.ASGITransport`**: both buffer the whole body and hang or time out. A finite generator works with `TestClient` (probed), the real route does not.
- **Python `hash()` for ticker-derived prices**: salted per process; use `hashlib.sha256`.
- **Merging each SSE frame into the price map**: stale tickers never disappear.
- **Reading `os.environ` in the factory**: `Settings` already normalizes blank values; pass `settings.massive_api_key`, `settings.sim_seed`, `settings.sim_event_probability`.
- **`create-next-app` defaults, `next/font/google`, sync LiteLLM** - unchanged from STACK.md.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE framing, keepalive, headers | Manual `StreamingResponse` with `data:` strings | `fastapi.sse.EventSourceResponse` + `ServerSentEvent` | Produces the exact contract frames and `: ping` every 15 s (probed); do not add `sse-starlette` |
| Correlated random moves | Custom correlation code | `numpy.linalg.cholesky` on the sector block matrix | PD for any ticker mix (verified); vectorized |
| Seeded RNG | Global `random`/`numpy.random` | `np.random.default_rng(seed)` per simulator | Reproducible, isolated between tests |
| Stable ticker-derived price | `hash()` or `random.Random(ticker)` | `hashlib.sha256` digest -> float in [50, 300) | Stable across processes and platforms |
| Charts | Hand-drawn canvas/SVG sparkline | `lightweight-charts` v5 | Decision 14; Phase 4 reuses the same wrapper |
| Per-row re-render control | Context + memo gymnastics | zustand selectors | 10 tickers x 2 Hz |
| Number formatting | `toFixed` scattered in components | One `format.ts` with `Intl.NumberFormat("en-US")` | PITFALLS.md #22: header/table/treemap must agree |
| HTTP retry for Massive | Custom retry loop | The client's built-in urllib3 `Retry` (3 retries, 413/429/499/500/502/503/504) | Verified in client source; 401/403 are NOT retried |
| Test servers for SSE | Mock transports | In-process `uvicorn.Server(Config(app, port=0))` + `httpx.AsyncClient.stream` | The only transport that streams; also exercises shutdown (probed) |

**Key insight:** the design is already specified and runnable in the planning docs; the risk is not inventing algorithms but wiring (shutdown, test transport, EventSource states, Massive call budget).

## Deltas from the design docs (apply when copying code)

1. **Factory** takes `(cache, settings)`; `SimulatorDataSource(cache, seed=settings.sim_seed, event_probability=settings.sim_event_probability)`. `Settings` already provides `sim_seed: int | None` and `sim_event_probability: float` (default `0.001`) `[VERIFIED: backend/app/config.py:23-24,38]`.
2. **MKT-03:** `GBMSimulator.add_ticker` uses `SEED_PRICES.get(ticker) or derived_price(ticker)`, where `derived_price` is `round(50 + 250 * int.from_bytes(sha256(ticker.encode()).digest()[:8], "big") / 2**64, 2)`. Probed values: `PYPL -> 211.74`, `ZZZZ -> 196.93`; the test should hard-code a few expected values so a change is caught, and one test should run a subprocess with a different `PYTHONHASHSEED` to prove process independence.
3. **`SimulatorDataSource.add_ticker`** must return early if the ticker is already simulated (the doc version rewrites the cache entry and bumps `version` on every call).
4. **`stop()`** must await the cancelled task; wrap the loop BODY (not the loop) in `try/except Exception: logger.exception(...)` so one bad step does not freeze prices while the dot stays green (PITFALLS.md #5). This is the single justified exception handler in the simulator.
5. **SSE poll interval 0.1 s, not 0.5 s.** The simulator ticks every 0.5 s and a 0.5 s poll aliases with it (a frame can be skipped, then doubled), making the cadence irregular; a 0.1 s integer compare is negligible. Send only when `version` changed (contract: one frame per version change). `[ASSUMED: derived by reasoning; confirm by counting frames over 30 s in the shutdown/stream integration test]`
6. **Massive free-tier call budget:** compute the starting day locally (most recent weekday on or before yesterday, optionally skip US holidays via a tiny table) so a normal start costs 1 (failed snapshot probe) + 1 (Grouped Daily) calls instead of walking back day by day; cap the walk-back at 4-5 days. Use JSON `status == "NOT_AUTHORIZED"` from the `BadResponse` text if desired, but a substring match is acceptable if a stub test pins the exact body. `start()` errors propagate so a bad key fails the boot loudly (decision from MARKET_INTERFACE.md section 8).
7. **Portfolio valuation** treats a missing price as an error to log and falls back to `avg_cost`, never `None` (PITFALLS.md #6).
8. **Existing tests:** `test_health_is_side_effect_free` (IN-02 in the Phase 1 review) is now misleading because lifespan creates the DB; delete it or assert the DB file now exists. `backend/tests/conftest.py`'s `settings` fixture already points `db_path` at `tmp_path`, so existing `create_app(settings)` tests keep working but now start a real simulator task inside `TestClient`; confirm clean teardown.

## Runtime State Inventory

Not a rename/refactor/migration phase - omitted. (Note for the planner: the Phase 1 placeholder IDs `app-title` and `api-status` are test-visible state; see Pitfall 4.)

## Common Pitfalls

### Pitfall 1: SSE hangs shutdown (the recipe in PITFALLS.md is wrong)
**What goes wrong:** Ctrl+C / `docker stop` / test teardown hangs while a browser is connected.
**Why:** uvicorn waits for in-flight responses, then runs lifespan shutdown; a lifespan-set event is too late.
**How to avoid:** pass `--timeout-graceful-shutdown 2..3` everywhere (README, `test/playwright.config.ts` `webServer.command`, any script, Dockerfile already done). Add the real-uvicorn shutdown test (MKT-10).
**Warning signs:** "Waiting for connections to close"; test process never exits.

### Pitfall 2: Test transports do not stream
**What goes wrong:** An SSE test with `httpx.ASGITransport` or `TestClient` hangs or times out.
**How to avoid:** unit-test `price_frames` directly; one integration test with `uvicorn.Server(Config(app, host="127.0.0.1", port=0, timeout_graceful_shutdown=1, log_level="warning"))` run as an asyncio task, read the bound port from `server.servers[0].sockets[0].getsockname()[1]`, stream with `httpx.AsyncClient(timeout=None)`. Works on Windows (probed).

### Pitfall 3: Connection dot lies
**What goes wrong:** Dot stays yellow forever when the backend is down because Chromium never reaches CLOSED, or stays green with frozen prices.
**How to avoid:** the timer-based red state above; dot reflects the connection, not message recency (Massive free plan is silent after the first frame).

### Pitfall 4: Phase 1 Playwright specs break
**What goes wrong:** `test/smoke.spec.ts` asserts `app-title` = "FinAlly" and `api-status` = "ok"; `test/health-status.spec.ts` asserts `api-status` = "down" for 404/500/503 on `/api/health` `[VERIFIED: both files read]`. Replacing `page.tsx` makes both fail.
**How to avoid:** decide explicitly in the UI plan: either keep a small `app-title` and drop `api-status`, deleting `health-status.spec.ts`, or keep an `api-status` element. Replace the smoke spec with the Phase 2 scenario (header `$10,000.00`, 10 rows, dot `data-status="connected"`, prices not `--`). Set `DB_PATH` to a temp file, `SIM_SEED=1`, `SIM_EVENT_PROBABILITY=0` in the `webServer.env` for determinism, and add `--timeout-graceful-shutdown 2` to its command.

### Pitfall 5: Idempotent seed duplicates the snapshot row
**What goes wrong:** `INSERT OR IGNORE` on a UUID-keyed table inserts a fresh row on every restart.
**How to avoid:** guard the snapshot seed with `WHERE NOT EXISTS` (above) and test "init twice -> 1 snapshot, 10 watchlist rows, 1 profile".

### Pitfall 6: Flash only fires once, or flat ticks wipe it
**How to avoid:** `key` on `flash.seq` (advances only on up/down); CSS keyframes, no timers; at ~1-10 cents per tick many low-priced tickers show `flat` often (AAPL one-sigma tick is about 1.2 cents per MARKET_SIMULATOR.md section 1.2).

### Pitfall 7: Lightweight Charts data errors
**How to avoid:** strictly ascending unique `time` (per-second dedupe, drop older), explicit container height, `chart.remove()` in cleanup (StrictMode), `setData` once then `update`.

### Pitfall 8: Massive free plan burns 5 calls/min on start
See Delta 6. Also note a 429 triggers up to 3 client retries, each counting toward the limit.

### Pitfall 9: Wrong method on a real route returns 404, not 405
The `/api/{path:path}` catch-all fully matches every method, so it beats the partial match from a real route (Phase 1 review WR-01). Decide and pin it (Open Questions #2) before adding the first real `/api` routes in this phase.

## Code Examples

### Derived price (MKT-03)
```python
# Source: probed in scratchpad (misc_probe.py); stdlib hashlib
import hashlib

def derived_price(ticker: str) -> float:
    """Stable start price in [50, 300) for a ticker with no seed price."""
    fraction = int.from_bytes(hashlib.sha256(ticker.encode()).digest()[:8], "big") / 2**64
    return round(50 + 250 * fraction, 2)
```

### Real-server SSE/shutdown test skeleton (MKT-09, MKT-10)
```python
# Source: adapted from the probed scratch experiment (sse_shutdown.py, mode "timeout")
async def test_sse_frames_and_prompt_shutdown(settings):
    app = create_app(settings)
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=0,
                                           log_level="warning", timeout_graceful_shutdown=1))
    task = asyncio.create_task(server.serve())
    while not server.started:
        await asyncio.sleep(0.05)
    port = server.servers[0].sockets[0].getsockname()[1]
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream("GET", f"http://127.0.0.1:{port}/api/stream/prices") as r:
            lines = r.aiter_lines()
            assert await anext(lines) == "retry: 1000"
            await anext(lines)                       # blank line ending the retry frame
            assert (await anext(lines)).startswith("data: ")
            server.should_exit = True
            started = time.monotonic()
            await asyncio.wait_for(task, 5)
            assert time.monotonic() - started < 4
```
Structure is what was probed (open stream, read first frames, set `should_exit`, assert the server task finishes within a few seconds); the exact line-reading calls are untested in this form.

### Fake EventSource for the connection state machine (UI-03)
```ts
// vitest.setup.ts - jsdom has no EventSource
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readyState = 0; onopen: (() => void) | null = null;
  onerror: (() => void) | null = null; onmessage: ((e: { data: string }) => void) | null = null;
  constructor(public url: string) { FakeEventSource.instances.push(this); }
  close() { this.readyState = 2; }
}
vi.stubGlobal("EventSource", FakeEventSource);
```
Tests: one instance after mount (UI-03); `onopen` -> connected; `onerror` with readyState 0 -> reconnecting, then `vi.advanceTimersByTime(5000)` -> disconnected; `readyState = 2` + `onerror` -> disconnected and a second instance after backoff; unmount calls `close()`.

### Tailwind v4 flash keyframes
```css
/* Source: tailwindcss.com/docs/theme "Defining animation keyframes inside @theme" */
@theme {
  --animate-flash-up: flash-up 500ms ease-out;
  --animate-flash-down: flash-down 500ms ease-out;
  @keyframes flash-up   { from { background-color: rgb(34 197 94 / 0.45); } to { background-color: transparent; } }
  @keyframes flash-down { from { background-color: rgb(239 68 68 / 0.45); } to { background-color: transparent; } }
}
```
Use as `animate-flash-up` / `animate-flash-down`. Exact colors belong to the UI-SPEC; the existing theme tokens are `--color-surface: #0d1117`, `--color-panel: #161b22`, `--color-border: #30363d`, `--color-accent: #ecad0a`, `--color-primary: #209dd7`, `--color-secondary: #753991` `[VERIFIED: frontend/src/app/globals.css]`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `sse-starlette` / manual `StreamingResponse` | `fastapi.sse.EventSourceResponse` | FastAPI 0.135.0 | No extra dependency; keepalive built in |
| `@app.on_event("startup")` | `lifespan=` | FastAPI deprecation | Build cache/source in `create_app`, start in lifespan |
| `chart.addLineSeries()` | `chart.addSeries(LineSeries, opts)` | Lightweight Charts v5 | v4 snippets are wrong |
| `polygon-api-client` | `massive` | Polygon rebrand to Massive, 30 Oct 2025 | Import `from massive import RESTClient` |
| `sqlite3` implicit transactions (`isolation_level`) | `autocommit=` connect parameter | Python 3.12 | Use `autocommit=True` + explicit `BEGIN IMMEDIATE` (verified) |

**Deprecated/outdated:** the lifespan-event shutdown recipe in `.planning/research/PITFALLS.md` #4, and STACK.md's note that `httpx.ASGITransport` streams SSE incrementally - both disproved by probes this session. Update those two docs when convenient.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Massive free plan returns `NOT_AUTHORIZED` JSON for the snapshot endpoint and `resultsCount: 0` for non-trading days | Deltas #6 | Free-plan fallback or walk-back breaks; only stubs can test it. Source is `planning/MASSIVE_API.md` and the official docs do not state the weekend behavior (fetched page: "documentation does not address ... non-trading days") |
| A2 | Free Grouped Daily for "yesterday" is available early in the next day, not only after a delay | Deltas #6 | Walk-back covers it, at the cost of extra calls |
| A3 | 0.1 s SSE poll gives a regular ~2 Hz frame cadence | Deltas #5 | Irregular flashing; tune in the integration test |
| A4 | Unique test-file basenames avoid pytest collision without `__init__.py` | Structure | Import mismatch errors; add `__init__.py` files if hit |
| A5 | ~5 s of continuous `error` before showing red is the right threshold | Pattern 4 | Cosmetic; tune in UI-SPEC |
| A6 | Starter plan snapshots may lack `last_trade` (pricing page lists "Trades" only from Developer up) so the day-close / prev-close fallback in `_fetch_snapshot` is exercised in practice | Massive | Prices stay at previous close on Starter; planner should keep the fallback chain and test it with a stub |
| A7 | The user has no live Massive key, so the Massive path ships verified by stubs only | Environment | If a key exists, add a manual smoke step to UAT |

## Open Questions

1. **UI-SPEC does not exist yet.**
   - What we know: `.planning/STATE.md` blocker says run `/gsd-ui-phase 2` before any Phase 2 UI work; `workflow.ui_safety_gate` is true; the phase directory contains no UI-SPEC.
   - Unclear: layout of the dense terminal (where Phase 3/4 panels will go), flash colors/contrast, empty/loading copy, attribution placement.
   - Recommendation: plan and execute the backend waves first; run `/gsd-ui-phase 2` before planning the UI waves (or immediately before plan-phase finalizes them).

2. **405 vs 404 for a wrong method on a real route (Phase 1 review WR-01).**
   - What we know: catch-all `add_route("/api/{path:path}", ...)` fully matches every method and beats a real route's partial match `[VERIFIED: backend/app/main.py:28-31 and 01-REVIEW.md WR-01]`.
   - Recommendation: choose "404 for everything under /api that is not an exact method+path match", add one sentence to `planning/API_CONTRACT.md`, and pin it with a test (`POST /api/watchlist`-style wrong-verb case on the first real route). A 405-capable catch-all needs a custom route class and is not worth it for a single-user demo. Planner: make this an explicit early task.

3. **Does the user have a Massive API key for a live smoke test?** Research could not read `.env` (secret guard) and found no key in the environment. If none, the Massive path is verified by stubs only; record that in VERIFICATION.

4. **Sparklines: keep the TradingView logo?** Recommendation in Pattern 5 (disable on sparklines, add a footer link, keep on the Phase 4 main chart); confirm in the UI-SPEC.

5. **Add Vitest in Phase 2 or Phase 6?** TEST-05 is Phase 6, but the ROADMAP convention says each phase tests its own slice and UI-05/UI-08 are pure logic. Recommendation: add Vitest now (formatters, store reducers, connection hook, one row component test); the Phase 1 skeleton doc already says "Vitest arrives with the first real components".

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| uv | backend deps/tests | yes | 0.12.17 | - |
| Python | backend | yes (via uv) | 3.12.14 | - |
| Node / npm | frontend, Playwright | yes | 26.8.1 / 11.19.0 (engines `>=24`) | - |
| Playwright Chromium | E2E | yes | chromium 1208/1243 present in `~/AppData/Local/ms-playwright` | - |
| `UV_SYSTEM_CERTS=1` | `uv add` under Avast | must be exported in the shell (it was empty in the probe shell) | - | export it before `uv add` |
| TLS to api.massive.com | Massive path | yes, no interception observed (`openssl s_client` chain: Let's Encrypt -> ISRG; plain certifi `urllib3` request returned HTTP 401) | - | If `CERTIFICATE_VERIFY_FAILED` ever appears: `truststore.inject_into_ssl()` in the Massive branch only; never disable verification |
| Docker daemon | optional container re-proof | `docker` CLI present (29.7.2); daemon state not checked | - | Phase 1 already proved the image; re-run `docker build` once at phase end |
| Massive API key | live Massive smoke | unknown (not readable) | - | Stub-based tests only |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Backend framework | pytest 9.1.1 + pytest-asyncio 1.4.0 (`asyncio_mode = "auto"`) |
| Backend config | `backend/pyproject.toml` `[tool.pytest.ini_options]` (existing: `testpaths = ["tests"]`, `pythonpath = ["."]`) |
| Frontend framework | Vitest 5.0.3 + RTL 16.3.3 + jsdom 30.1.2 (Wave 0 install) |
| Frontend config | `frontend/vitest.config.ts` + `frontend/vitest.setup.ts` (Wave 0) |
| E2E | Playwright 1.63.0 on the host, `test/` (existing) |
| Quick run (backend) | `cd backend && uv run python -m pytest tests/market -q` |
| Full backend | `cd backend && uv run python -m pytest -q` |
| Quick run (frontend) | `npm --prefix frontend test` (`vitest run`; add the script) |
| E2E | `npm --prefix test run smoke` (starts the backend itself; port 8000 must be free) |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MKT-01 | Prices positive over 10,000 steps; annualized vol within ~5% of sigma; same-sector corr ~0.6, cross ~0.3; seed prices for the 10 tickers | unit | `uv run python -m pytest tests/market/test_simulator.py -q` | Wave 0 |
| MKT-02 | `event_probability=1` gives 2-5% move on every ticker; `0` never does | unit | same file | Wave 0 |
| MKT-03 | `derived_price` equals hard-coded values, within [50,300), identical under a different `PYTHONHASHSEED` subprocess | unit | `uv run python -m pytest tests/market/test_simulator.py -k derived -q` | Wave 0 |
| MKT-04 | Same seed -> identical price sequences; `Settings` seed/probability reach the simulator | unit | `uv run python -m pytest tests/market/test_simulator.py tests/market/test_factory.py -q` | Wave 0 |
| MKT-05 | Stub client: paid snapshot path (last_trade -> day.close -> prev_day.close fallback, ns->s timestamp), `NOT_AUTHORIZED` -> EOD mode, invalid ticker absent, weekend walk-back, call count | unit | `uv run python -m pytest tests/market/test_massive.py -q` | Wave 0 |
| MKT-06 | Both sources subclass `MarketDataSource` and implement every abstract method; factory: unset/empty/whitespace key -> simulator, other -> Massive | unit | `uv run python -m pytest tests/market/test_factory.py -q` | Wave 0 |
| MKT-07 | First update: previous==price, direction flat; second sets direction/change; `session_start_price` sticks; `remove` bumps version; `to_dict` keys | unit | `uv run python -m pytest tests/market/test_cache.py -q` | Wave 0 |
| MKT-09 | `price_frames` yields only on version change; real-server stream: first line `retry: 1000`, then `data:` JSON dict keyed by ticker with the 8 PriceUpdate keys; content type `text/event-stream` | unit + integration | `uv run python -m pytest tests/market/test_stream.py -q` | Wave 0 |
| MKT-10 | Real `uvicorn.Server` with a connected stream exits within ~4 s of `should_exit`; source task is done after lifespan; `stop()` twice is safe | integration | `uv run python -m pytest tests/market/test_shutdown.py -q` | Wave 0 |
| DB-01 | Missing file + missing parent dir -> created and seeded; second init idempotent; deleted DB is recreated on next app start | unit | `uv run python -m pytest tests/test_db.py -q` | Wave 0 |
| DB-02 | `PRAGMA table_info`: PKs `(user_id)`, `(user_id,ticker)` x2; UUID `id` on the 3 append tables; `user_id` default `default` on all | unit | same file | Wave 0 |
| DB-03 | Seed: profile cash 10000.0; 10 watchlist tickers in order; exactly 1 snapshot of 10000.0 after repeated init | unit | same file | Wave 0 |
| WL-01 | `GET /api/watchlist` returns 10 items in seed order with prices; an unpriced ticker has `null` in every non-ticker field | API | `uv run python -m pytest tests/test_watchlist.py -q` | Wave 0 |
| PORT-01 | Fresh `GET /api/portfolio` = cash 10000, total 10000, `unrealized_pnl` 0, `positions: []`; inserted position valued at cache price; missing price falls back to avg_cost; rounding 2 dp / 6 dp | API | `uv run python -m pytest tests/test_portfolio.py -q` | Wave 0 |
| UI-01 | Dark theme applied (body background `rgb(13, 17, 23)`) | e2e | `npm --prefix test run smoke` | Wave 0 (new spec) |
| UI-02 | Header shows `$10,000.00` total and cash; dot `data-status` connected; `liveTotals` math | unit + e2e | `npm --prefix frontend test -- totals` and e2e | Wave 0 |
| UI-03 | Exactly one `EventSource`; onopen/onerror/timer/CLOSED transitions; `close()` on unmount; e2e: 500-fulfilled stream -> dot red | unit + e2e | `npm --prefix frontend test -- useMarketStream` | Wave 0 |
| UI-04 | 10 rows from the watchlist; row shows price, change %, sparkline canvas; sparkline buffer capped and per-second deduped | unit + e2e | `npm --prefix frontend test -- store` and e2e | Wave 0 |
| UI-05 | Flash class matches direction; `flat` keeps previous class; seq advances only on up/down | unit | `npm --prefix frontend test -- flash` | Wave 0 |
| UI-08 | Formatters return `--` for null/NaN/undefined, never `NaN` or `0`; currency/qty/sign/pct strings fixed by locale; `tabular-nums` class on number cells | unit | `npm --prefix frontend test -- format` | Wave 0 |
| TEST-01 | All market-data unit tests above pass | suite | `uv run python -m pytest tests/market -q` | Wave 0 |

Manual-only (justified): backend kill and restart with a browser open (dot green -> yellow -> red -> green) is verified once in UAT; the automated equivalent (spawn/kill a server from Playwright on Windows) is brittle and belongs to Phase 6's SSE-reconnection scenario. Live Massive smoke is manual and only possible with a key.

### Sampling Rate
- **Per task commit:** the matching quick command (`tests/market -q` or `npm --prefix frontend test`)
- **Per wave merge:** full backend suite + full frontend suite
- **Phase gate:** backend + frontend suites green, `npm --prefix frontend run build` green, `npm --prefix test run smoke` green, before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `backend/tests/market/` test files listed above (unique basenames)
- [ ] `pytest-asyncio` install + `asyncio_mode = "auto"` in `pyproject.toml`
- [ ] `frontend/vitest.config.ts`, `frontend/vitest.setup.ts` (FakeEventSource, jest-dom), `"test": "vitest run"` script
- [ ] Replace `test/smoke.spec.ts`; retire or rewrite `test/health-status.spec.ts`; add `DB_PATH`/`SIM_SEED`/`SIM_EVENT_PROBABILITY` and `--timeout-graceful-shutdown` to `test/playwright.config.ts` `webServer`
- [ ] Remove or rewrite `test_health_is_side_effect_free`

## Security Domain

`security_enforcement` is enabled (absent = enabled; config shows `security_enforcement: true`, ASVS level 1, block on high).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Single hardcoded user by design (PROJECT.md Out of Scope) |
| V3 Session Management | no | No sessions |
| V4 Access Control | no | No multi-user; document as accepted |
| V5 Input Validation | yes (limited) | Phase 2 has no request bodies; path/query inputs none. Ticker normalization/regex arrives in Phase 3, but put `normalize_ticker()` in one module now. Parameterized SQL only (no string-built queries) |
| V6 Cryptography | no | Nothing hand-rolled; TLS to Massive stays verified |
| V7 Error handling / logging | yes | Existing generic 500 envelope; never log the API key; `logger.exception` in the Massive loop must not include request headers (client `trace`/`verbose` stay off) |
| V10/V14 Config & secrets | yes | `MASSIVE_API_KEY` only from env/`.env` (gitignored), never returned by any endpoint, never in the frontend bundle |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key leakage via logs/exceptions | Information disclosure | Do not log `settings`; `BadResponse` text is the response body only; keep client `trace=False` |
| Supply-chain (new PyPI/npm packages, LiteLLM-style compromise) | Tampering | Pinned `==` versions, committed lockfiles, `uv sync --locked`, `npm ci`, one human-verify checkpoint |
| Unbounded SSE connections | Denial of service | Accepted for a single-user local app; each connection costs a 0.1 s integer-compare loop |
| SQL injection | Tampering | Parameterized statements; all Phase 2 SQL is constant |
| XSS via ticker strings | Tampering | React escapes by default; no `dangerouslySetInnerHTML`; tickers come from the DB seed in this phase |
| Disabled TLS verification to "fix" an interception error | Spoofing | Forbidden by user rules; per-stack trust-store opt-in only |

## Project Constraints (from CLAUDE.md)

- All docs in `planning/`; `planning/API_CONTRACT.md` is the single API/SSE contract - change the API only by editing that file (so the 404-for-wrong-method sentence is an edit to that file).
- Read PLAN.md-derived specs; consult market docs only as needed.
- Python: `uv add` / `uv run` only; tests as `uv run python -m pytest` (App Control blocks bare pytest.exe); dev deps via `uv sync --extra dev`.
- Simple, incremental, short modules and functions; no defensive programming; exception handling only where needed; clear docstrings, sparse comments; no emojis in code, prints or logs; concise README.
- Use latest APIs (verify with docs): FastAPI native SSE, Lightweight Charts v5, `massive`, Tailwind v4 CSS-first.
- Hand-written Next project; no `cacheComponents`; no `next/font/google`; no `create-next-app` defaults.
- TLS verification always on; secrets only via `.env`.
- GSD workflow: do not edit repo files outside a GSD command.
- Always `/gsd-ui-phase` first for UI work (STATE.md blocker).
- `.env` cannot be read by agents here (secret-read guard); use `.env.example` for variable names.

## Suggested Plan Split (MVP, tracer-first)

Tracer slice (first plan, proves the whole path end to end): `PriceCache` + `GBMSimulator`/`SimulatorDataSource` (default tickers as a constant) + `price_frames`/SSE route + lifespan wiring + `useMarketStream`/store + one `WatchlistRow` rendering a live AAPL price. Then expand.

- **Wave 1** - 02-01 Market engine + SSE tracer (backend: models, cache, interface, seed_prices, simulator incl. MKT-03/04, factory simulator branch, stream route, lifespan, `--timeout-graceful-shutdown` in dev commands; TEST-01 simulator/cache/stream/shutdown tests). In parallel 02-02 Frontend foundation (Vitest setup, types, `format.ts`, store reducers, `useMarketStream` + FakeEventSource tests; no UI-SPEC needed because it is logic only). Package checkpoint first.
- **Wave 2** - 02-03 SQLite layer + `GET /api/watchlist` + `GET /api/portfolio` (DB-01..03, WL-01, PORT-01; lifespan loads `watchlist UNION positions`; 404-vs-405 decision pinned; contract edit). In parallel 02-04 Massive poller + factory branch (MKT-05/06; stub-based tests; free-tier call budget).
- **Wave 3** - 02-05 Terminal UI (header, connection dot, watchlist rows, flash, sparklines, layout, `data-testid`s) after `/gsd-ui-phase 2`; 02-06 Phase integration: new Playwright smoke, README/CLAUDE status lines, Docker build re-proof, UAT checklist (backend restart dot cycle).

## Sources

### Primary (HIGH confidence)
- Local files read this session: `planning/API_CONTRACT.md`, `MARKET_INTERFACE.md`, `MARKET_SIMULATOR.md`, `MASSIVE_API.md`, `backend/app/{main,config,errors}.py`, `backend/pyproject.toml`, `backend/tests/*`, `frontend/{package.json,next.config.ts,src/**}`, `test/*`, `Dockerfile`, `.planning/{REQUIREMENTS,ROADMAP,STATE,PROJECT}.md`, Phase 1 review/UI-review/skeleton docs
- Installed `fastapi/sse.py` and `fastapi/routing.py` (0.142.2) - SSE serialization, keepalive, `_PING_INTERVAL = 15.0`
- Probes run this session (scratchpad): FastAPI SSE wire output and `Request` injection; uvicorn shutdown in three modes; `httpx.ASGITransport` non-streaming; Cholesky positive-definiteness over 300 random ticker sets; sha256-derived prices; Python 3.12 `sqlite3` `autocommit=True` + `BEGIN IMMEDIATE`; `massive` 2.8.0 model fields, `BadResponse`/`AuthError`, urllib3 `Retry` config, certifi `ca_certs`; plain-certifi request to `api.massive.com` (HTTP 401, no TLS error); Chromium EventSource kill/restart and HTTP-500 behavior via Playwright
- `lightweight-charts@5.2.1` `dist/typings.d.ts` (scratch install) - option names
- Context7 `/tradingview/lightweight-charts` (attributionLogo licence text, autoSize), `/websites/tailwindcss` (`@keyframes` inside `@theme`)
- npm registry via `npm view` and PyPI resolution via `uv pip install --dry-run` (this session)

### Secondary (MEDIUM confidence)
- https://massive.com/pricing (5 API calls/min on Basic; End of Day data; Snapshot from Starter; Trades from Developer)
- https://massive.com/docs/rest/stocks/aggregates/daily-market-summary (parameters; weekend/holiday behavior NOT documented)
- `.planning/research/STACK.md`, `PITFALLS.md` (two statements disproved above)

### Tertiary (LOW confidence)
- Massive `NOT_AUTHORIZED` response body and `resultsCount: 0` on non-trading days: from `planning/MASSIVE_API.md` only, untestable without a key

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - versions confirmed on both registries; legitimacy seam gave `SUS` only for missing-download/too-new reasons
- Architecture: HIGH - design pre-written and key mechanisms probed (SSE, shutdown, test transports, EventSource)
- Massive free tier: MEDIUM-LOW - no key; behavior from project docs and pricing page
- Pitfalls: HIGH - most reproduced this session

**Research date:** 2026-10-08
**Valid until:** 2026-11-07 (30 days; FastAPI, Next and Vitest majors move quickly, re-check versions before install)
