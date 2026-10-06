# Domain Pitfalls

**Domain:** AI-powered simulated trading workstation (FastAPI + SSE + SQLite + Next.js static export + Lightweight Charts + LiteLLM/OpenRouter/Cerebras, single Docker container, Windows dev machine)
**Project:** FinAlly
**Researched:** 2026-10-06
**Overall confidence:** MEDIUM-HIGH (library/API facts verified against Context7 and official docs; some Windows/Docker interactions are flagged LOW and need an early spike)

## Phase labels used in this file

The roadmap does not exist yet. These labels are a suggested decomposition; remap them to the real ROADMAP phases.

| Label | Scope |
|-------|-------|
| **P0 Foundation** | Repo hygiene, toolchain smoke test on this Windows box (uv, Node, TLS, App Control), contract freeze |
| **P1 Market data + SSE** | Simulator, Massive poller, PriceCache, `/api/stream/prices`, lifespan wiring |
| **P2 DB + Portfolio/Watchlist API** | SQLite init, trade execution, snapshots, watchlist, tracking rule |
| **P3 LLM chat** | LiteLLM -> OpenRouter -> Cerebras, structured output, auto-exec, mock mode |
| **P4 Frontend** | Next.js export, SSE client, charts, heatmap, trade bar, chat panel |
| **P5 Packaging** | Dockerfile, volume, scripts, `.env` handling, static serving |
| **P6 Test suites** | pytest, frontend tests, Playwright E2E |

---

## Critical Pitfalls

Mistakes that cause rewrites, silent wrong money numbers, or a "works on my machine, dies in Docker" capstone.

### Pitfall 1: Contract drift between the planning docs, PROJECT.md and the code

**What goes wrong:** The sources already disagree. PROJECT.md decision 3 says the SSE payload carries `change_percent`; `planning/MARKET_INTERFACE.md` `PriceUpdate.to_dict()` emits `day_change_percent` (and has no `change_percent`). PLAN.md section 13 #18 notes Massive polling "2-15s" vs "2-5s". `CLAUDE.md`/README claim market data is done while no `.py` source exists. Backend, frontend and tests built by separate agents each pick a different name; everything compiles and the UI shows `undefined%` or NaN.
**Why it happens:** Agents coordinate through prose files; no machine-checked contract. The same field is named in 3 documents.
**Consequences:** Frontend/back-end mismatch found only at E2E time; "daily change %" column blank; tests assert the wrong key.
**Prevention:**
- P0: freeze one written contract (`planning/API_CONTRACT.md` or a section in PROJECT.md): exact SSE keys (pick `day_change_percent` OR `change_percent`, delete the other everywhere), REST request/response bodies, error shape `{"error": "..."}`, per-action result shape for chat.
- Implement the contract once as Pydantic response models in the backend; generate the TypeScript types by hand from them in one `frontend/src/types.ts` and reference that file from every component. One schema test per endpoint (`response.model_validate`) in pytest.
- Add a contract test: a backend test that loads one SSE `data:` line and asserts the exact key set; a frontend test that feeds the same fixture JSON through the SSE parser.
**Warning signs:** Two spellings of the same field in `grep -r change_percent`; frontend components reading optional fields with `?? 0`; README "done" status not matching the tree.
**Phase to address:** P0 (freeze), enforced in P1/P2/P4.

---

### Pitfall 2: Float money math produces ghost positions, off-by-a-cent cash and wrong avg cost

**What goes wrong:** Schema stores `REAL` for cash, quantity, avg_cost. Classic failures: buy 0.1 + 0.2 shares then sell 0.3 leaves a `1e-17` residual position (row never deleted, shows "AAPL 0.00" forever); buying "all my cash" fails with "insufficient cash" because `cash - cost = -1e-13`; avg cost recomputed on sells (it must NOT change on a sell); avg cost on buys computed as the average of prices instead of the quantity-weighted average; total value shows 10000.000000000002; P&L% divides by zero for a position with avg_cost 0.
**Why it happens:** Python floats are fine for display but not for equality/threshold checks. Fractional shares make exact zero-comparisons unreliable. The spec says "position row deleted when quantity reaches 0" which is a float equality test.
**Consequences:** Failing E2E "sell shares: position disappears"; flaky unit tests; money that does not reconcile.
**Prevention:**
- Quantize at one boundary in a single `portfolio/service.py`: price already rounded to cents by the cache; `cost = round(price * qty, 2)`; quantity rounded to 6 decimals (or store integer micro-shares); cash rounded to 2 decimals after every mutation. Do the arithmetic in `decimal.Decimal` inside the function and convert to float only when binding to SQLite (this is small and does not violate the "do not over-engineer" rule: one helper `money()` and one `shares()`).
- Delete the position when `qty < 1e-6` after rounding, never `== 0`.
- Sell: `avg_cost` unchanged. Buy: `new_avg = (old_qty*old_avg + qty*price) / (old_qty + qty)`. Realized P&L is not tracked (out of scope) so do not invent it.
- Read the price from the cache exactly once per trade and use that value for validation, cash math, the `trades` row and the snapshot.
- Validate `quantity > 0`, finite (`math.isfinite`; reject NaN/inf from LLM JSON), and cap to a sane max so `1e308` cannot overflow.
- Unit-test the edge cases explicitly: 0.1+0.2 then sell 0.3; buy with exactly all cash; sell exactly all shares; sell more than owned; sell at a loss; buy-sell-buy avg cost.
**Warning signs:** `-0.0` or `1e-15` anywhere in a JSON response; a positions table row with quantity "0.00"; tests using `==` on floats instead of `pytest.approx`.
**Phase to address:** P2.

---

### Pitfall 3: Trade execution is not atomic, and concurrency (manual trade + LLM trade) corrupts cash

**What goes wrong:** Trade = read cash -> check -> update cash -> upsert position -> insert trade -> insert snapshot. If these are separate autocommit statements, a crash or a concurrent request (user clicks Buy while the chat auto-executes a trade) interleaves and cash/position diverge. The chat endpoint is worse: it holds the DB while waiting for the LLM, or executes N LLM trades non-atomically and a mid-sequence failure leaves a half-applied batch.
**Why it happens:** `sqlite3` defaults to deferred transactions; two connections both read the same cash and both write (lost update). FastAPI runs sync handlers in a threadpool, so this concurrency is real even with one user.
**Consequences:** Negative cash, duplicated trades, positions that do not match the trade log.
**Prevention:**
- One function `execute_trade(conn, ...)` used by BOTH `/api/portfolio/trade` and the chat flow (the spec already says "same validation"; make it literally the same function).
- Wrap each trade in `BEGIN IMMEDIATE ... COMMIT` (takes the write lock up front, so check-then-write is safe). Each LLM trade is its own transaction so one failure does not roll back the others; report per-trade success/failure.
- Never hold a transaction or an open write cursor across the LLM call. Order in the chat handler: load context (short read) -> call LLM (no DB handle held) -> execute actions (short write transactions) -> persist message.
- Connection setup: `PRAGMA journal_mode=WAL`, `PRAGMA busy_timeout=5000`, `PRAGMA foreign_keys=ON`; one connection per request (or per thread), not one global connection shared across threads (`check_same_thread` errors or silent corruption).
- Keep handlers that touch SQLite as plain `def` (FastAPI offloads to a threadpool) rather than `async def` with blocking `sqlite3` calls, which block the event loop and stall the SSE generator and price simulator. If you use `aiosqlite` instead, use it consistently; do not mix.
**Warning signs:** `async def` route bodies calling `conn.execute` directly; SSE ticks becoming irregular while a chat request is in flight; `database is locked` in logs; a module-level `conn = sqlite3.connect(...)`.
**Phase to address:** P2 (service + connection helper), re-verified in P3.

---

### Pitfall 4: SSE stream never ends on shutdown; `docker stop` takes 10 seconds and Ctrl+C hangs

**What goes wrong:** The `price_events` generator loops forever. On SIGTERM uvicorn stops accepting new connections and waits for in-flight responses to finish. A long-lived SSE response never finishes, so uvicorn logs "Waiting for connections to close" until killed (Docker sends SIGKILL after 10 s). `lifespan` shutdown (`market_source.stop()`) may never run on a hard kill, and on Windows dev Ctrl+C appears to hang. Verified: with no `timeout_graceful_shutdown`, uvicorn waits indefinitely for in-flight requests.
**Why it happens:** `request.is_disconnected()` only reports client disconnects, not server shutdown.
**Consequences:** Slow/ugly stop scripts ("idempotent stop" scripts take 10 s), occasionally half-written state, annoying dev loop, flaky E2E teardown.
**Prevention:**
- Start uvicorn with `--timeout-graceful-shutdown 2` (or equivalent in code) in the Dockerfile CMD and dev command.
- In `lifespan`, create an `asyncio.Event` `shutdown` set after `yield`; the SSE generator loop checks `shutdown.is_set()` as well as `is_disconnected()` and returns.
- Keep the generator trivially cancellable: wrap nothing in `except Exception` that would swallow `asyncio.CancelledError` (catching bare `Exception` does not catch it in 3.8+, but a bare `except:` does).
- Add `stop_grace_period: 5s` in compose so a slow stop is visible, not silent.
**Warning signs:** `docker stop` takes ~10 s; uvicorn log line "Waiting for connections to close"; "ASGI callable returned without completing response".
**Phase to address:** P1 (generator + lifespan), verified in P5 (stop script timing).

---

### Pitfall 5: Background task lifecycle bugs in `lifespan`

**What goes wrong:** (a) `MARKET_INTERFACE.md` section 11 creates `price_cache` and `market_source` at module import time; pytest imports the app multiple times / a `TestClient` per test and tasks leak or a second cache is created, so tests read an empty cache. (b) The simulator task dies silently on the first exception (a single `ZeroDivisionError` in the step loop) and prices freeze with the SSE still "connected" and the green dot lit. (c) `asyncio.create_task` result not referenced -> garbage collected (Python only keeps weak refs to tasks). (d) `stop()` only calls `cancel()` without awaiting it, so the task is still running when the loop closes ("Task was destroyed but it is pending"). (e) `TestClient(app)` without a `with` block never runs lifespan, so tests see no tickers.
**Prevention:**
- Build cache/source inside `lifespan` and store on `app.state`; routes read `request.app.state.price_cache`. Provide an app factory `create_app(settings)` so tests can inject a stub source and a temp `DB_PATH`.
- Keep the task reference on the source object (the doc does: `self._task`); in `stop()` do `task.cancel()` then `await asyncio.gather(task, return_exceptions=True)` / `contextlib.suppress(CancelledError)`.
- Wrap the loop body (not the loop) in try/except-log-continue (MARKET_INTERFACE.md already does this for Massive; require the same for the simulator) and expose `last_update_age` on `/api/health` so a frozen feed is observable.
- Tests use `with TestClient(app) as client:` (or `httpx.AsyncClient` + `LifespanManager`).
**Warning signs:** Prices stop moving but no error; `RuntimeWarning: coroutine ... was never awaited`; tests passing alone but failing when run together.
**Phase to address:** P1.

---

### Pitfall 6: Tracked-ticker rule (watchlist U open positions) is only half-enforced

**What goes wrong:** The service layer must call `sync_ticker` in every place that changes watchlist or positions: manual watchlist add/remove, manual trade, **LLM trade**, **LLM watchlist change**, startup, and position-closed-by-sell. Missing one path (usually the chat path) re-creates the PLAN.md section 13 #1 bug: a held ticker with no price, so total portfolio value silently drops it (or crashes with `None * qty`). Other consequence: `SimulatorDataSource.remove_ticker` evicts the cache entry and bumps `version`; if a position exists the heatmap tile loses its price.
**Prevention:**
- Single choke point: `portfolio.service` and `watchlist.service` are the only callers of `add_ticker/remove_ticker`; chat calls those same services (never the market source directly). Add a `reconcile_tracking()` function that recomputes watchlist U positions from the DB and diff-syncs the source; call it at the end of every mutating service function. This is simpler and more robust than per-event rules.
- Valuation code treats a missing price as an error to log and falls back to `avg_cost` for that position (never `None`).
- Unit tests: remove a watched+held ticker (still priced); sell the last share of an unwatched ticker (untracked); AI buys an unwatched ticker (tracked, appears in SSE but NOT in watchlist panel).
**Warning signs:** Portfolio total jumps down after a watchlist removal; `TypeError: unsupported operand type(s) for *: 'NoneType'`.
**Phase to address:** P2 (service), P3 (chat path).

---

### Pitfall 7: Frontend treats the SSE dict as "the watchlist"

**What goes wrong:** The SSE payload carries every TRACKED ticker (watchlist U positions). A watchlist panel rendered from `Object.keys(prices)` shows held-but-unwatched tickers and keeps removed ones. Also, a reducer that merges each event into a map (`{...old, ...new}`) never drops a ticker that the server stopped sending, so sparkline buffers and "removed" tickers linger. Conversely, with the Massive free plan the stream is nearly silent after the first event.
**Prevention:**
- Watchlist membership comes from `GET /api/watchlist` (refetched/updated from the mutation responses); SSE only supplies prices keyed by ticker. Render watchlist rows by joining the two.
- Replace (not merge) the price map on each event; keep sparkline buffers in a separate map keyed by ticker, capped (e.g. last 300 points), pruned when a ticker leaves both the watchlist and positions.
- Treat "no event for N seconds" as normal (EOD mode); drive the connection dot from EventSource `readyState`, not event arrival (see Pitfall 9).
**Warning signs:** Watchlist shows a ticker the user never added; deleted ticker still ticks.
**Phase to address:** P4.

---

### Pitfall 8: LLM structured output assumed to be schema-enforced when it may not be

**What goes wrong:** The skill uses `response_format=PydanticModel` with `reasoning_effort="low"` and `extra_body={"provider": {"order": ["cerebras"]}}`. Failure modes: (a) OpenRouter structured-output support is per endpoint/provider; with default `allow_fallbacks: true` a Cerebras outage or unsupported-parameter response silently routes to another provider that ignores `json_schema` (there are public reports of `openai/gpt-oss-120b` ignoring `response_format.json_schema` on some hosts) and returns prose or fenced JSON. (b) Cerebras strict mode requires `additionalProperties: false` on every object and rejects `oneOf/allOf`, string `pattern`/`format`, array `minItems/maxItems`, `nullable`, recursive schemas, schema text over 5,000 chars, nesting over 10 levels. A Pydantic model with `Optional[...]`, `Field(gt=0)`, `conf`-style constraints or a `Literal` union may emit keywords the provider rejects -> 400 for every chat call. (c) With a reasoning model, a too-small `max_tokens` is consumed by reasoning and `message.content` is `None`/truncated JSON. (d) `litellm.completion` is synchronous; calling it in an `async def` route blocks the event loop for the whole LLM latency, freezing SSE.
**Why it happens:** "Structured Outputs" is treated as a guarantee instead of a request; the schema is written for Pydantic ergonomics, not provider limits.
**Consequences:** Intermittent chat failures in the demo; E2E passes (mock) while production chat is broken.
**Prevention:**
- Keep the response model minimal and strict-friendly: `message: str`, `trades: list[Trade] = []`, `watchlist_changes: list[WatchlistChange] = []` (empty list, not `Optional`/null), `side: Literal["buy","sell"]`, `action: Literal["add","remove"]`, `quantity: float` with NO `gt`/`ge` constraints (validate `> 0` server-side), `model_config = ConfigDict(extra="forbid")` so `additionalProperties:false` is emitted. Print `Model.model_json_schema()` once and eyeball it against the Cerebras unsupported-keyword list.
- Add `"require_parameters": True` to the provider preferences so OpenRouter will not route to a provider that cannot honor `response_format`; decide deliberately about `allow_fallbacks` (leave default for demo resilience, but then assume the output may be unenforced).
- Parse defensively, one place: `Model.model_validate_json(content)` inside try/except; on failure strip ```` ```json ```` fences once and retry validation; on second failure return the graceful assistant error message (PROJECT.md decision 8) and execute nothing. Handle `content is None`.
- Set an explicit `timeout=` (e.g. 30 s), a generous `max_tokens`, and use `litellm.acompletion` (or `asyncio.to_thread(completion, ...)`) so the event loop is not blocked.
- One manual live smoke script (not in CI): real call, assert the response validates. Run it in P3 and again before declaring done. This is the only place the Cerebras-specific behavior is exercised.
- Verify `reasoning_effort` is accepted by the installed LiteLLM version for the `openrouter/` route (drop it if LiteLLM rejects/ignores it; check with Context7 at implementation time).
**Warning signs:** `content` is `None`; `JSONDecodeError`/`ValidationError` in logs; 400 "unsupported schema" from provider; chat latency suddenly several seconds (fallback provider); SSE visibly stalls during a chat request.
**Phase to address:** P3 (design + live smoke), P6 (malformed-response unit tests).

---

### Pitfall 9: EventSource reconnection assumptions are wrong (and the connection dot lies)

**What goes wrong:** EventSource only auto-reconnects on network errors and on responses it considers valid. If the server returns a non-200 status (e.g. 500 while starting, 404, a proxy HTML page) or a wrong `Content-Type`, the connection is failed permanently: `readyState === CLOSED`, no retry. The UI then shows a stale "connected" dot or a dead feed until reload. Other traps: React 18/19 StrictMode runs effects twice in dev, opening two EventSources unless the cleanup calls `close()`; the dot is driven by "last message time" so the Massive free plan (silent stream) looks disconnected; reconnect backoff `retry: 1000` hammers the server during an outage; the browser caps ~6 HTTP/1.1 connections per origin, so many tabs on `localhost:8000` can starve REST calls.
**Prevention:**
- One `usePriceStream()` hook: create in `useEffect`, `close()` in cleanup. `onopen` -> green, `onerror` -> if `readyState === EventSource.CONNECTING` yellow else if `CLOSED` red and schedule a manual re-create with capped backoff (1s, 2s, 4s ... 10s).
- Server: respond `200` with `text/event-stream` always (return the stream even before first prices exist; `start()` already waits for prices); send a comment heartbeat (`: ping\n\n`) every ~15 s so idle proxies and the Massive-free silent stream keep the connection alive.
- Hydrate initial prices from `GET /api/watchlist` (which carries latest prices) so the UI is not blank until the first event.
**Warning signs:** Dot stays green while prices are frozen; two simultaneous `/api/stream/prices` requests in the Network tab in dev; E2E "reconnection" test hangs.
**Phase to address:** P1 (heartbeat, headers), P4 (hook), P6 (resilience E2E).

---

### Pitfall 10: Static serving mistakes: mount order, missing `static/` at import time, SPA routing

**What goes wrong:** (a) `app.mount("/", StaticFiles(directory="static", html=True))` registered BEFORE the API routers shadows `/api/*` (mounts match in order); registered with a relative path it breaks when uvicorn is started from a different cwd. (b) `StaticFiles` raises `RuntimeError: Directory 'static' does not exist` at import time when the frontend has not been built, so `uv run pytest` and local backend dev crash. (c) Next export emits `foo.html` for each route; Starlette's `html=True` serves `foo/index.html` and `404.html`, not `foo.html`, so any second route 404s unless `trailingSlash: true`. (d) Unknown `/api/...` paths fall through to the static mount and return an HTML 404 instead of JSON. (e) FastAPI's `StaticFiles` does not set cache headers; a rebuilt export with new hashed chunks is fine but `index.html` is cached by browsers.
**Prevention:**
- Mount static LAST, after all routers, using an absolute path derived from `Path(__file__)` or a `STATIC_DIR` env var (`/app/static` in Docker); mount only `if static_dir.is_dir()`.
- The product is a single page (`/`); keep it that way (no dynamic routes, no `/ticker/[symbol]` pages: selecting a ticker is client state). If a second page is ever added, set `trailingSlash: true`.
- Add a catch-all `/api/{path:path}` 404 JSON handler registered before the static mount, or rely on the "API routers first" order plus a test: `GET /api/nope` returns JSON 404.
- Note: recent FastAPI/Starlette may offer a built-in SPA helper (`app.frontend()` was mentioned in one secondary source; unverified) - do not rely on it; use the explicit `StaticFiles` approach and verify the installed version's docs with Context7 before choosing.
**Warning signs:** `/api/health` returns HTML; backend tests fail on import with "Directory 'static' does not exist"; page refresh on a non-root URL 404s.
**Phase to address:** P5 (and the conditional mount in P1's `main.py`).

---

### Pitfall 11: Next.js static export gotchas bite late (server-only features, build-time data, dev proxy)

**What goes wrong:** With `output: 'export'` these are unsupported or misbehave: route handlers needing Request, rewrites/redirects/headers, default `next/image` loader (build error unless `images: { unoptimized: true }`), Server Actions, dynamic routes without `generateStaticParams`, ISR. Server Components that `fetch('/api/...')` run at BUILD time against a backend that does not exist (build fails or bakes stale data). `next/font/google` downloads fonts at build time: fails behind the TLS interceptor on the Windows host and in offline Docker builds. In dev, `next dev` runs on port 3000, so `fetch('/api/...')` and `new EventSource('/api/stream/prices')` hit the Next server (no rewrites in export mode), not FastAPI.
**Prevention:**
- Everything data-driven is a Client Component (`"use client"`), fetch only inside effects/handlers. Add `export const dynamic = 'error'` in the root layout during development to fail fast on unsupported features.
- `next.config.ts`: `output: 'export'`, `images: { unoptimized: true }`, and `turbopackUseSystemTlsCerts` on this machine (per user CLAUDE.md). Use a system font stack or `next/font/local` instead of `next/font/google`.
- Dev loop: decide in P0. Recommended: `NEXT_PUBLIC_API_ORIGIN` (empty in production = same origin; `http://localhost:8000` in `next dev`), plus a dev-only CORS allowance in FastAPI gated on an env var, off in Docker. Alternative: rewrites gated on `NODE_ENV === 'development'` (verify that Next 16 tolerates this with `output: 'export'`; LOW confidence). Do not leave the team in a "must rebuild the export for every CSS tweak" loop.
- Pin Node 24 LTS in the Docker build stage and in `.nvmrc`/`engines`; use `npm ci` with a committed lockfile.
- Tailwind is on its v4 line (CSS-first `@import "tailwindcss"` and `@theme`, no `tailwind.config.js` by default); agents trained on v3 patterns will write v3 config. Verify with Context7 before generating config.
**Warning signs:** Build error mentioning "export" + a feature name; blank page in `next dev` with 404s on `/api/*`; a build that works on Docker but not on the host (fonts/TLS).
**Phase to address:** P0 (dev-loop decision, TLS), P4.

---

### Pitfall 12: Lightweight Charts v5 API drift, strict time ordering and React lifecycle

**What goes wrong:** (a) Agents write the v4 API (`chart.addLineSeries()`); v5 (current, 5.2) uses `chart.addSeries(LineSeries, opts)` with series classes imported from the package. (b) Series data requires strictly ascending, unique `time`; `setData` throws on duplicates/disorder and `update()` throws "Cannot update oldest data" if time is older than the last point. With 500 ms ticks and second-resolution `UTCTimestamp`, two ticks share a second; Massive `lastTrade` timestamps can repeat or go backwards; EOD mode has a constant timestamp. (c) P&L chart: two snapshots in the same second (trade + history request) duplicate a time. (d) React: chart created in render or in an effect without `chart.remove()` cleanup -> two charts stacked in the container under StrictMode, memory leak on ticker switch. (e) `autoSize: true` needs a container with a non-zero CSS height; in a flex/grid cell with `height: auto` the chart renders at 0px and looks "broken". (f) Creating the chart during Next's static prerender touches `window`/`document` and throws "window is not defined" if done at module/render scope. (g) Calling `setData` on every tick re-renders the whole series; use `update()`.
**Prevention:**
- One `<LineChart>` wrapper component used for sparklines, main chart and P&L: `useEffect(() => { const chart = createChart(el, {autoSize: true, ...}); const s = chart.addSeries(LineSeries); ...; return () => chart.remove(); }, [])`. Fill initial data once with `setData`, then `series.update(point)` per tick.
- Time normalization helper: use client arrival time `Math.floor(Date.now()/1000)` for live price series (ignore server timestamps for chart x-axis); if the new second equals the last, `update` replaces the last point (allowed); if less, drop the point. For snapshots, group by second and keep the last.
- Give every chart container an explicit height (`h-full min-h-[...]` on a flex child with `min-h-0`).
- Sparklines for 10 tickers: disable axes, crosshair, grid, and `handleScroll/handleScale: false` to keep it cheap; cap buffers (e.g. 300 points).
- Treemap: Lightweight Charts has no treemap. If using Recharts `Treemap`, set `isAnimationActive={false}` (animation restarts every SSE tick and flickers) and throttle the data feeding it (e.g. recompute at 1 Hz); handle 0 and 1 positions; colour scale clamps (e.g. +/-5 % -> full saturation).
- Context7 query "lightweight-charts v5" before generating chart code.
**Warning signs:** Console error "Assertion failed: data must be asc ordered by time"; a second chart appears after hot reload; chart area invisible but no error.
**Phase to address:** P4.

---

### Pitfall 13: Re-render storm and the flash animation that only works once

**What goes wrong:** Putting the SSE dict in a top-level React state re-renders the entire page (every chart wrapper, treemap, table) twice a second. The "flash green/red then fade" is implemented by toggling a class; re-adding the same class while it is already present does nothing, so repeated same-direction ticks do not flash; or the class is removed in a `setTimeout` that races with the next tick and leaves the cell permanently coloured. Also `direction: "flat"` events (cents unchanged) wipe a flash prematurely.
**Prevention:**
- Use a tiny store with per-ticker selectors (`zustand` with `useShallow`/selector, or `useSyncExternalStore`) so only the row for a changed ticker re-renders; memoize chart/treemap components and feed them throttled data.
- Flash: key the flash element on `(ticker, timestamp)` or restart the CSS animation via a `key` change; prefer a CSS `@keyframes` (300-500 ms) over `transition` + timer so no JS cleanup is needed; ignore `flat` direction.
- Unit-test the flash with fake timers (spec: "price flash animation triggers correctly on price changes").
**Warning signs:** React Profiler shows the whole tree re-rendering per tick; flash fires only on the first tick of a run.
**Phase to address:** P4.

---

### Pitfall 14: SQLite lazy-init race and a volume that does not work as expected

**What goes wrong:** (a) Lazy init "on first request" with two simultaneous first requests (the browser fires `/api/watchlist`, `/api/portfolio`, SSE together) both see "no tables" and both create/seed -> `UNIQUE constraint failed` or duplicate seed rows. (b) `DB_PATH` parent directory missing (`db/` not created) -> `unable to open database file`. (c) In Docker, a bind mount of a Windows directory (`-v ${PWD}/db:/app/db`) goes through the Docker Desktop file-sharing layer, where SQLite locking/WAL is unreliable; the spec's named volume (`finally-data`) is correct, but docs/scripts that use a bind mount "for convenience" break. (d) If the image runs as a non-root user (as in the uv-docker example), a fresh named volume mounted at `/app/db` is root-owned unless the directory exists in the image with the right owner -> `attempt to write a readonly database`. (e) WAL creates `finally.db-wal`/`-shm` files; copying only `finally.db` for backup loses data.
**Prevention:**
- Initialize in `lifespan` startup (before the first request can arrive), synchronously, `CREATE TABLE IF NOT EXISTS ...` and `INSERT OR IGNORE` for seed rows in one transaction; `Path(db_path).parent.mkdir(parents=True, exist_ok=True)`. This satisfies "lazy init" in spirit (no manual step) without the race.
- Dockerfile: `RUN mkdir -p /app/db && chown <user> /app/db` before `USER`, or just run as root (simplest for this demo; note the tradeoff). Use the named volume in compose and scripts; never a Windows bind mount.
- Schema: also add `CHECK (cash_balance >= 0)`, `CHECK (quantity > 0)` constraints as a safety net behind the service validation (cheap, catches Pitfall 2/3 bugs loudly).
- Seed initial portfolio snapshot (value 10000) at init so the P&L chart has a first point (see Pitfall 17).
**Warning signs:** Sporadic 500s on first page load only; `readonly database`; duplicate watchlist rows.
**Phase to address:** P2 (init), P5 (volume/ownership).

---

### Pitfall 15: Docker multi-stage + uv packaging errors

**What goes wrong:** (a) A Windows-created `.venv` or `__pycache__` copied into the Linux image (no `.dockerignore`) -> broken interpreter paths. (b) Virtualenv shebangs are absolute; building the venv at `/build/.venv` and copying to `/app/.venv` in the final stage breaks the console scripts. (c) `CMD ["uv", "run", ...]` re-syncs at container start (network, slow, may re-resolve) - use the venv's binary directly. (d) `uv sync` without `--locked` silently re-locks; with `--locked` it fails if `pyproject.toml` and `uv.lock` disagree (uncommitted lock). (e) Python mismatch: uv downloads its own CPython in the builder but the slim runtime image has a different one. (f) `COPY` order lets the stale committed `backend/static/` (flagged in PROJECT.md) or `test/node_modules/` into the context, or overwrites the fresh frontend build. (g) Node stage cache-busting: copying all of `frontend/` before `npm ci` re-installs deps on every source edit. (h) `UV_COMPILE_BYTECODE`/`UV_LINK_MODE=copy` omitted -> slow start / hardlink warnings with cache mounts.
**Prevention:**
- `.dockerignore`: `.venv`, `**/__pycache__`, `**/node_modules`, `frontend/.next`, `frontend/out`, `backend/static`, `db/*.db*`, `.env`, `.git`, `test/`, `planning/`, `.planning/`.
- Pattern from the official uv Docker example: `ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_NO_DEV=1 UV_PYTHON_DOWNLOADS=0`; two-step `uv sync --locked --no-install-project` (deps layer, bind-mount `uv.lock` + `pyproject.toml`) then copy source and `uv sync --locked`; `ENV PATH="/app/.venv/bin:$PATH"`; same absolute `WORKDIR /app` in builder and runtime so the venv path is identical; base image `python:3.12-slim` (or the `ghcr.io/astral-sh/uv:python3.12-*-slim` image) in both stages.
- CMD: `["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-graceful-shutdown", "2"]` (note `--host 0.0.0.0`; the default 127.0.0.1 makes the published port unreachable).
- Node stage: `COPY frontend/package*.json` -> `npm ci` -> `COPY frontend/` -> `npm run build` -> `COPY --from=frontend /app/out /app/static`.
- Node 24 LTS (PROJECT.md decision 15), not 20.
- Add a Docker `HEALTHCHECK` hitting `/api/health` (use `python -c urllib` or `curl` installed; slim images lack curl).
**Warning signs:** `exec format error`/`No such file or directory` on a console script; container "Up" but `localhost:8000` refuses; image rebuilds reinstall everything.
**Phase to address:** P5.

---

### Pitfall 16: Windows dev environment: per-tool TLS opt-in, App Control, and CRLF

**What goes wrong:**
- **TLS interception** (user CLAUDE.md): every stack needs its own OS-trust opt-in. Concretely here: `uv` -> `UV_SYSTEM_CERTS=1`; Python (`litellm`/`httpx`, `massive`'s urllib3/certifi, `requests`) -> `truststore.inject_into_ssl()` at app startup (and in pytest `conftest.py` if any test touches TLS); Node/npm/Playwright browser download -> `NODE_USE_SYSTEM_CA=1` (supported by Node 22.15+/23.9+/24, reads the Windows store) ; Next/Turbopack -> `turbopackUseSystemTlsCerts`; Docker build steps (`npm ci`, `uv sync` inside the Linux VM) may or may not be intercepted: unverified (LOW), test early. Never `verify=False`, `NODE_TLS_REJECT_UNAUTHORIZED=0`, `strict-ssl false`.
- **Truststore in production code:** injecting truststore unconditionally in the Docker image is harmless but unnecessary; gate on an env var or only in dev so the container behaves normally. (Keep it simple: one line at the top of `main.py`/`conftest.py` guarded by `sys.platform == "win32"`.)
- **App Control blocks unsigned native binaries.** pytest's launcher is already blocked (memory note: use `uv run python -m pytest`). Expect the same class of failure for native executables Node tooling downloads: Playwright's browsers, SWC/Turbopack, lightningcss/Tailwind oxide `.node` files, esbuild. If Playwright cannot run on the host, PROJECT.md decision (#23: no Playwright container) must be reversed and E2E run inside a Docker Playwright image against the app container (the original `docker-compose.test.yml` design).
- **CRLF:** a Windows checkout with `core.autocrlf=true` turns `scripts/*.sh`, `Dockerfile`, and `.env` into CRLF; macOS/Linux then fails with `/bin/bash^M: bad interpreter`, and a `.env` value gets a trailing `\r` (a silently-invalid API key).
- **Docker `--env-file`** does not strip quotes: `OPENROUTER_API_KEY="sk-..."` keeps the quotes in the container (python-dotenv strips them, Docker does not). Local dev (dotenv) and Docker (env-file) then behave differently.
**Prevention:**
- P0 toolchain smoke test (one short checklist, run before any feature work): `uv sync`, `uv run python -m pytest -q` (empty suite passes), `npm ci && npm run build` on the host, `npx playwright install chromium` + a trivial test launches a browser, `docker build` of a hello-world two-stage image. Record the exact env vars needed in README (concise) and a `scripts/dev_env` note. If any step fails, you learn it before 5 phases of work depend on it.
- `.gitattributes`: `*.sh text eol=lf`, `Dockerfile text eol=lf`, `*.ps1 text eol=crlf` optional, `.env* text eol=lf`.
- Document `.env` as unquoted `KEY=value`; `.strip()` all secrets when read (the factory already strips `MASSIVE_API_KEY`; do the same for `OPENROUTER_API_KEY`).
- `.env.example` committed; `.env` gitignored.
**Warning signs:** `unknown issuer`/`UnknownIssuer`/`CERTIFICATE_VERIFY_FAILED` from a tool never run before (expected per user CLAUDE.md; fix by that tool's switch, do not bypass); "This program is blocked by your organization" / `Access is denied` on a binary; `$'\r': command not found`.
**Phase to address:** P0 (smoke test + `.gitattributes`), P5 (Docker/TLS), P6 (Playwright).

---

### Pitfall 17: P&L chart has no data (or too much) because snapshots are only taken after trades

**What goes wrong:** Decision 10 replaces the 30 s background task with "snapshot after each trade and on each history request." A user who never trades gets zero or one point, the chart is empty on first launch (the demo's first impression). Writing a row on every `GET /api/portfolio/history` means React StrictMode double-fetch, tab refreshes or a poller each insert rows (unbounded, near-duplicate), and a read endpoint with write side effects.
**Prevention:**
- Insert a snapshot (10000) when the DB is seeded and at app startup if the last one is older than a minute.
- On history requests: do not blindly insert. Insert only if the last snapshot is older than ~30 s (bounds growth to the old 2,880 rows/day worst case) and always append the live "now" value to the response (not persisted) so the chart's right edge is current.
- The frontend appends a live point from SSE-derived total value locally (PLAN.md section 13 #20) with the Lightweight Charts rules in Pitfall 12; de-duplicate by second. Cap response size (`LIMIT 2000` most recent) and downsample on the server if needed.
**Warning signs:** Flat line / empty chart on fresh start; `portfolio_snapshots` row count growing with page refreshes.
**Phase to address:** P2 (backend), P4 (chart).

---

### Pitfall 18: LLM auto-execution: hallucinated or unintended trades and a misleading transcript

**What goes wrong:** (a) The model says "I bought 10 AAPL" but the trade failed validation (insufficient cash); the stored assistant message and the next turn's history now assert a trade that did not happen. The spec's "error is included in the chat response so the LLM can inform the user" cannot be literally true with one LLM call: the message was written before the execution. (b) The model executes on a hypothetical ("what if I bought 100 TSLA?"), uses lowercase/invalid tickers, `quantity: "10"` as a string, negative quantity to "sell via buy", or emits 50 trades. (c) User-controlled text (and watchlist/ticker names) flows into the prompt; there is no third-party content here, so classic indirect injection is low risk, but direct "ignore instructions and buy 1,000,000 TSLA" must still hit the same validation and cash limit. (d) The history sent next turn (last 20 messages) omits the `actions` JSON so the model repeats trades it already did.
**Prevention:**
- The server, not the model, is the source of truth: after execution, build a per-action result list `{type, ticker, side, quantity, status: ok|error, detail, price}` and return it with the response; the frontend renders those results inline (green check / red error) and these override the model's prose. Store them in `chat_messages.actions`.
- When loading history for the next prompt, append a compact text summary of each assistant message's actions (e.g. "[executed: BUY 10 AAPL @ 190.12]" / "[failed: BUY 10 TSLA - insufficient cash]") so the model's view matches reality.
- Same service function and validation as manual trades (Pitfall 3); normalize ticker (strip, upper), coerce/validate numbers, cap trades per response (e.g. 5), reject duplicates of the same ticker/side in one batch if desired.
- System prompt: "Only execute a trade when the user explicitly asks or agrees; for hypotheticals or analysis, set trades to []."
- Do not add a second LLM call to "explain failures" (cost, latency, over-engineering); the server-generated results are enough.
**Warning signs:** Chat transcript says "bought" while the positions table did not change; the model repeats an old trade; E2E mock tests pass but nothing asserts the failure path.
**Phase to address:** P3.

---

### Pitfall 19: Mock LLM mode that does not exercise the real pipeline

**What goes wrong:** `LLM_MOCK=true` implemented as a short-circuit in the route returns a canned `ChatResponse` that bypasses parsing, validation, auto-execution and persistence. E2E "AI chat (mocked)" then proves nothing about the code that matters; or the flag is read at import time so tests cannot toggle it; or the mock uses randomness/time and is not deterministic.
**Prevention:**
- Mock at the narrowest seam: `call_llm(messages) -> str` returns the raw JSON string (mock returns a keyword-selected JSON string; real returns `choices[0].message.content`). Everything after (validate, execute, persist, respond) is shared and tested.
- Define the mock table in the contract (P0): "buy" -> `{"message": "...", "trades":[{"ticker":"AAPL","side":"buy","quantity":1}]}`; "sell" -> sell 1 AAPL; "add X" / "remove X" -> watchlist change; "invalid"/"broke" -> trade that fails (insufficient cash) to cover the failure path; "malformed" -> not-JSON string to cover the error path; default -> message only.
- Read `LLM_MOCK` at call time via a settings object, and also skip the "missing OPENROUTER_API_KEY" check when mocking.
**Warning signs:** Mock branch inside the route handler; no E2E for a failed AI trade.
**Phase to address:** P3 (design), P6 (tests).

---

## Moderate Pitfalls

### Pitfall 20: Massive free plan burns its 5 calls/min on startup

**What goes wrong:** On the free plan the first snapshot call fails (`NOT_AUTHORIZED`, 1 call), then `_fetch_latest_closes` walks back day by day (each skipped weekend/holiday costs a call: Monday = Sunday, Saturday, Friday = 3 calls; after a holiday up to 4-5). Total can hit 5 calls inside a minute; the client's own 429 retries then add more, and `start()` raises, so the app fails to boot with a free key. Also, the `NOT_AUTHORIZED` detection is a substring match on an exception message; a wording change breaks the free-plan fallback. Timestamps differ by endpoint (ns vs ms).
**Prevention:** Derive the last trading day locally (skip Sat/Sun before the first call; optionally a small US holiday table) so the typical case is 1-2 calls; treat `start()` failure for Massive as "log loudly and fall back to the simulator" only if that fits the user's intent, otherwise fail fast with a clear message; keep one stubbed-client test per path (paid, free, invalid ticker, weekend walk-back). Convert timestamps to seconds at the boundary (already in the doc).
**Phase to address:** P1.

### Pitfall 21: Simulator realism/tuning and state leaks across tests

**What goes wrong:** Per-tick vol is tiny with the real-time `dt` (0.5 s over a trading year): about 0.009 % per tick, so prices change by a cent or two and the demo looks sluggish; sparklines look flat; conversely a too-aggressive event rate makes P&L swing wildly. Unknown tickers get a random $50-300 start price that differs per run, so tests asserting on it are flaky. Random state is global.
**Prevention:** Make the RNG injectable (`np.random.default_rng(seed)`) with `SIM_SEED` env var; expose `SIM_EVENT_PROBABILITY` (E2E sets it to 0 and seeds; the default demo uses events). Tune vol/time-scale once in P1 by watching a sparkline for 60 s; unit tests assert statistical properties with tolerances and a fixed seed.
**Phase to address:** P1 (hooks), P6 (E2E uses them).

### Pitfall 22: `GET /api/watchlist` and price formats leak float noise and inconsistent rounding

**What goes wrong:** Cache rounds to 2 decimals but `day_change_percent` rounds to 4 and portfolio values are unrounded; UI formats each differently (`toFixed` vs raw) so header total, positions table sum and treemap disagree by a cent.
**Prevention:** One formatting helper in the frontend (`fmtMoney`, `fmtPct`, `fmtQty`), one rounding rule in the backend responses; Intl.NumberFormat with fixed locale `en-US` (tests assert strings).
**Phase to address:** P2/P4.

### Pitfall 23: Ticker validation edge cases

**What goes wrong:** Regex `[A-Z][A-Z.]{0,9}` accepts `A.` and `A..B`; case handling differs between endpoints; the simulator accepts anything well-formed (an LLM typo `APPL` becomes a tracked ticker with a fake price); path param `DELETE /api/watchlist/BRK.B` fine but `BRK/B` is not routable; adding a ticker already present returns 500 on the UNIQUE constraint instead of an idempotent 200/409.
**Prevention:** one `normalize_ticker()` used by all entry points (REST + chat); handle duplicate add explicitly (decide 200 idempotent vs 409 in the contract); in simulator mode consider a small known-symbols list to reject obvious typos (optional, note as a design decision rather than defaulting to "accept anything").
**Phase to address:** P2/P3.

### Pitfall 24: Trade bar UX: double-submit and instant-fill surprises

**What goes wrong:** No confirmation dialog + instant fill means a double-click or Enter-key repeat buys twice; the button stays enabled during the request; the quantity field accepts "1e3" or "10,5"; the UI shows the stale pre-trade state until the next poll.
**Prevention:** Disable buttons while a trade request is in flight; parse with a strict numeric check; apply the portfolio state returned by the trade endpoint (decision 24) directly to the store; show server error text (`{"error": ...}`) inline.
**Phase to address:** P4.

### Pitfall 25: `.env` loading differs between dev and Docker

**What goes wrong:** Section 5 of PLAN.md and Section 11 disagree (backend reads `.env` vs `--env-file`). Local `uv run` from `backend/` does not find the project-root `.env`; Docker `--env-file` keeps quotes (see Pitfall 16); `docker compose` auto-reads `.env` for variable substitution but does not necessarily pass it into the container unless `env_file:` is set.
**Prevention:** Decision 12 stands: Docker passes the file (`env_file: .env` in compose and `--env-file` in scripts); local dev loads the root `.env` with `python-dotenv` using an explicit path (`Path(__file__).parents[N] / ".env"`), `override=False` so real env vars win. Settings read in one `settings.py`. Missing `.env` must not crash when `LLM_MOCK=true`.
**Phase to address:** P0/P5.

### Pitfall 26: LiteLLM import cost and a network call at import

**What goes wrong:** `import litellm` is slow (seconds) and, by default, tries to fetch the model price/context map from GitHub at import time; behind the TLS interceptor or offline (Docker without egress) this causes long delays or noisy warnings. Importing it at module top-level slows every pytest run and app startup.
**Prevention:** Set `LITELLM_LOCAL_MODEL_COST_MAP=True` (uses the bundled backup map; documented by LiteLLM) in the Dockerfile and dev env; import litellm lazily inside the real `call_llm` function (mock mode and unit tests never pay for it).
**Phase to address:** P3, P5.

### Pitfall 27: Playwright E2E flakiness from streaming prices and shared state

**What goes wrong:** Prices change every 500 ms, so a test that reads the price, clicks buy, then asserts "cash == 10000 - 10*price" is off by whatever tick landed in between; fixed `waitForTimeout`s; assertions on the 500 ms flash fade; heatmap colour assertions flipping when a random 2-5 % event hits; tests share one SQLite file so "fresh start: $10k, 10 tickers" fails after the buy test ran; `workers > 1` runs tests concurrently against the same single-user DB; the app container is "up" before the DB seed/first prices exist; the "SSE resilience" test cannot easily sever an already-open EventSource.
**Prevention:**
- Assert invariants, not values: cash decreased; position row exists with qty 10; cash + qty*avg_cost approximately equals prior cash (tolerance); read the executed price from the trade API response / trades list instead of the ticking cell. Use `expect(...).toPass()` / `expect.poll` and web-first assertions; ban `waitForTimeout`.
- Determinism: run the app container with `SIM_SEED` and `SIM_EVENT_PROBABILITY=0` (Pitfall 21) and `LLM_MOCK=true`.
- Isolation: `workers: 1`, `fullyParallel: false`; reset state per test via either a fresh container/volume per run (`docker compose down -v` in global setup) or a test-only `POST /api/test/reset` enabled only when `E2E=true` (document it as a test seam; never in default config). Order tests so read-only scenarios (fresh start) run first or reset in `beforeEach`.
- Readiness: Playwright `webServer`/global setup polls `/api/health` AND `/api/watchlist` for prices before tests; health returns 200 only after `start()` completed.
- Flash animation and reconnection: cover the flash in a React unit test with fake timers; for SSE resilience, `docker compose restart app` (or stop/start) mid-test and assert dot goes non-green then green again and prices resume; `context.setOffline` may not close an open stream (LOW confidence; spike it).
- Run Playwright from the host only after the P0 smoke test confirms App Control allows it; otherwise run it inside a Docker Playwright image (Pitfall 16).
**Warning signs:** Tests pass locally, fail in CI order; flaky heatmap assertions; failures only when run together.
**Phase to address:** P6 (with hooks from P1/P2).

### Pitfall 28: Frontend unit-test setup trips on canvas, ResizeObserver and EventSource

**What goes wrong:** jsdom has no canvas, `ResizeObserver` or `EventSource`; Lightweight Charts `createChart` throws or warns in tests; Recharts `ResponsiveContainer` reports 0 width. Tests either crash or mock so heavily they test nothing.
**Prevention:** Test components with the chart wrapper mocked at the module boundary (`vi.mock('../components/LineChart')`), and test the data-transform helpers (time dedupe, treemap data, P&L math, flash logic) as pure functions where the real logic lives. Provide a tiny `FakeEventSource` in test setup. Prefer Vitest + React Testing Library (current Next.js guidance); verify config with Context7.
**Phase to address:** P4/P6.

---

## Minor Pitfalls

### Pitfall 29: Stale committed artifacts (`backend/static/`, `test/node_modules/`, `__pycache__`)
**What goes wrong:** They get copied into images, show up in grep results, and mask the fact that the real build did not run.
**Prevention:** First commit in P0: `git rm -r --cached` them, add to `.gitignore` and `.dockerignore`; fix README/CLAUDE.md status lines (they currently claim market data is done and reference missing `planning/MARKET_DATA_SUMMARY.md`).

### Pitfall 30: Port 8000 unavailable or already bound on Windows
**What goes wrong:** Hyper-V/WSL excluded port ranges or a leftover container make `docker run -p 8000:8000` fail with an opaque bind error.
**Prevention:** Start script checks/prints the error clearly and uses `docker compose up -d`; `netsh int ipv4 show excludedportrange protocol=tcp` is the diagnostic. Stop script uses `docker compose down` (no `-v`) to keep the volume.

### Pitfall 31: Start/stop scripts not actually idempotent or cross-platform
**What goes wrong:** `docker run --name finally` twice fails ("name already in use"); PowerShell script uses bash-isms; `start` opens a browser before the app is healthy.
**Prevention:** Scripts are thin wrappers around `docker compose up -d --build` / `down`; start polls `/api/health` before printing the URL/opening a browser.

### Pitfall 32: Health endpoint lies
**What goes wrong:** `/api/health` returns 200 as soon as uvicorn is up, before the DB is initialized and the first prices are cached; Docker HEALTHCHECK and Playwright proceed too early.
**Prevention:** Health reports `{status, db: ok, prices: n, feed_age_s}` and returns 503 until lifespan startup finished.

### Pitfall 33: Console/UX details that cost the demo
**What goes wrong:** Chat panel loading indicator missing while the LLM runs (several seconds on fallback); conversation scroll not pinned to bottom; long assistant text overflows; chat history not restored on reload (spec stores it; the UI must fetch it - note there is no `GET /api/chat` in PLAN.md section 8, so decide: add `GET /api/chat/history` to the contract or restore nothing).
**Prevention:** Add `GET /api/chat/history` in P0 contract if history-on-reload is wanted; otherwise state it is out of scope.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Floats everywhere with no rounding helper | Fastest to write | Ghost positions, cent drift, flaky tests | Never (one `money()`/`shares()` helper is cheap) |
| Global `sqlite3` connection shared across threads | Less plumbing | `ProgrammingError` / corruption under threadpool | Never |
| `async def` routes calling `sqlite3` or `litellm.completion` directly | Looks "async" | Blocks event loop, SSE stalls | Never; use `def` routes or `to_thread` |
| Merge SSE payload into state object | One-liner | Stale/removed tickers linger | Never |
| Mock LLM short-circuiting at the route | Quick E2E | Tests prove nothing about real pipeline | Never |
| Skipping `--timeout-graceful-shutdown` | Nothing to configure | 10 s stop, hung Ctrl+C | Never |
| Hard-coded `static/` mount at import | Simple `main.py` | Tests/dev crash without a build | Never (conditional mount) |
| Rewriting v3-style Tailwind/LWC v4 code from memory | Faster first draft | Build/runtime errors | Never; look up current API |
| Writing a snapshot on every history GET | Satisfies decision 10 literally | Row growth, side effects on GET | Only with a min-interval guard |
| Test-only reset endpoint | Fast E2E isolation | Backdoor if enabled in prod | OK only behind `E2E=true`, off by default |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| LiteLLM -> OpenRouter -> Cerebras | Assuming `response_format` is always enforced; Pydantic schema using `Optional`, `gt`, `Literal` unions that strict mode rejects; no timeout; sync call in async route | Strict-friendly minimal schema (`extra="forbid"`, lists default `[]`), `require_parameters: True`, validate + fence-strip + graceful fallback, `acompletion`/`to_thread`, explicit timeout and `max_tokens`, `LITELLM_LOCAL_MODEL_COST_MAP=True` |
| OpenRouter provider routing | `provider.order` without considering `allow_fallbacks` default `true` | Decide explicitly; either accept fallback and rely on defensive parsing, or set `allow_fallbacks: false` and surface a clear error |
| Massive REST (`massive` client) | Calling the sync client on the event loop; `NOT_AUTHORIZED` string match; mixing ns/ms timestamps; spending the 5/min free budget on walk-back | `asyncio.to_thread`; convert timestamps at the boundary; compute last trading day locally; stubbed-client tests |
| Browser `EventSource` | Trusting auto-reconnect for all failures; dot driven by message arrival | Manual re-create on `CLOSED`; dot from `readyState`; heartbeat comments |
| Lightweight Charts v5 | v4 `addLineSeries`; duplicate/disordered `time`; no `remove()` | `addSeries(LineSeries)`; time normalization helper; cleanup in effect |
| FastAPI + `StaticFiles` | Mount before routers; relative dir; `html=True` expecting `foo.html` | Mount last, absolute dir, single page |
| uv in Docker | `uv run` at CMD; non-identical venv path; no `--locked` | Direct venv binary; `/app` in both stages; `uv sync --locked --no-install-project` pattern |
| Docker volume + SQLite | Windows bind mount, root-owned volume with non-root user | Named volume; `mkdir`/`chown` in image or run as root |
| Windows TLS interceptor | Disabling verification when a new tool fails | Per-tool OS-store switch (`UV_SYSTEM_CERTS`, `truststore`, `NODE_USE_SYSTEM_CA`, `turbopackUseSystemTlsCerts`) |

## Performance Traps

Scale here is one user, ~10-30 tickers; the traps are about smoothness, not throughput.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Whole-page React re-render per SSE event | Choppy UI, high CPU, flash lag | Per-ticker selectors/store, memoized charts, throttle treemap to ~1 Hz | Immediately (2 events/s x 10 tickers) |
| `setData` on every tick | Chart flicker, CPU | `series.update()` | From the first minute |
| Unbounded sparkline/price arrays | Memory growth over hours | Cap at ~300 points per ticker | After a few hours open |
| Unbounded `portfolio_snapshots` / chat history in prompt | Slow history call, big prompts | Min-interval snapshot guard, `LIMIT`, last 20 messages only | Weeks of use / long chats |
| SSE payload sends all tickers every change | Fine at 10 tickers; wasteful at hundreds | Keep dict-of-all (contract decided); not a concern for this scope | > ~200 tickers |
| Blocking calls on the event loop (sqlite, litellm, Massive client) | SSE jitter during chat/trade | `def` routes / `to_thread` / `acompletion` | Any request > ~100 ms |
| Treemap animation restarting each tick | Flicker | `isAnimationActive={false}`, throttle | Immediately |
| LiteLLM import at app import | 2-5 s slower startup/tests | Lazy import, local cost map | Every start |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| `.env` or key baked into the image / committed | Leaked OpenRouter/Massive key | `.dockerignore` and `.gitignore` `.env`; pass at runtime; commit `.env.example` only |
| Disabling TLS verification to get past Avast | MITM exposure, violates user policy | Per-tool OS-store opt-in (see Pitfall 16) |
| LLM output executed without server-side validation | Unbounded/invalid trades, negative amounts, NaN | Same validated service as manual trades; cap per-response trades; reject non-finite numbers |
| Test-only reset/seed endpoints left enabled | Anyone can wipe the portfolio | Gate on `E2E=true`; absent from default compose |
| Binding/serving beyond localhost with no auth | Anyone on the LAN can trade/chat and spend the OpenRouter key | Documented as single-user local demo; publish port as `127.0.0.1:8000:8000` in scripts by default; note in README before any cloud deploy (stretch goal) |
| Reflecting raw LLM text into the DOM as HTML | XSS from model output | Render chat as text/markdown-escaped; never `dangerouslySetInnerHTML` |
| Logging full prompts with portfolio and key | Key/PII leakage in logs | Log lengths/ids, not bodies; never log headers |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Dot green while feed is frozen | False confidence | Dot from EventSource state + `feed_age` from health |
| Blank panels until first SSE event | Looks broken on load | Hydrate from REST (`/api/watchlist` has prices, `/api/portfolio`) |
| "Daily change %" naming for session-start change | Misleading | Label as "Chg %" or "Since start" in simulator mode |
| Empty states (no positions -> blank heatmap, 1-point P&L chart) | Looks broken | Explicit empty-state text and a seeded first snapshot |
| Trade failure shown only as console error | User unsure whether trade happened | Inline error from `{"error": ...}`; chat shows per-action result badges |
| Chat panel blocks layout on small screens | Unusable on tablet | Collapsible/docked; desktop-first, verify at 1024 px |
| Colour-only P&L signal | Accessibility | Pair colour with +/- sign and arrows |

## "Looks Done But Isn't" Checklist

- [ ] **SSE stream:** Often missing graceful shutdown and heartbeat - verify `docker stop` < 3 s and an idle stream survives 60 s.
- [ ] **Reconnection:** Often only tested on network drop - verify behavior when the server restarts AND when it returns a 500 once (dot goes red, client re-creates, prices resume).
- [ ] **Trade logic:** Often missing exact-zero sell and exact-all-cash buy - verify position row deleted and no `-0.0`/`1e-15`.
- [ ] **Tracking rule:** Often missing the chat path - verify AI buy of unwatched ticker is priced, SSE-tracked, NOT in watchlist panel, and selling it untracks it.
- [ ] **LLM chat:** Often only mock-tested - verify one real call with `LLM_MOCK=false` validates against the schema and routes through Cerebras (check OpenRouter activity/generation metadata for the provider).
- [ ] **LLM failures:** Verify missing key, timeout, non-JSON and fenced JSON each return a graceful assistant message with no actions executed.
- [ ] **Static serving:** Verify `/api/does-not-exist` returns JSON 404, `/` loads, and backend tests run with no `static/` directory.
- [ ] **Docker:** Verify a fresh `docker build` on a clean clone (no `.venv`, no `node_modules`, no `backend/static`), data persists across `down`/`up`, `down -v` resets to $10,000.
- [ ] **Windows path:** Verify scripts work from PowerShell and a clean Git Bash; `.sh` files are LF.
- [ ] **Charts:** Verify no duplicate chart after hot reload / ticker switch, no console "asc ordered" assertions after 5 minutes, P&L chart is non-empty on first launch.
- [ ] **Heatmap:** Verify 0, 1 and many positions; all-loss, all-profit; resize.
- [ ] **E2E:** Verify the suite passes 3x in a row on a clean volume and when run in a different order.
- [ ] **Repo hygiene:** Verify `backend/static/` and `test/node_modules/` are untracked and README/CLAUDE.md statuses match reality.
- [ ] **TLS:** Verify nothing in the repo or scripts disables certificate verification.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Contract drift (1) | MEDIUM | Freeze names, grep-replace, add schema contract tests, re-run E2E |
| Float/ghost positions (2) | LOW-MEDIUM | Add rounding helpers, migrate stored values with a one-off SQL `ROUND`, add `CHECK` constraints and tests |
| Non-atomic trades (3) | MEDIUM | Refactor to one service function with `BEGIN IMMEDIATE`; add concurrent-trade test |
| SSE shutdown hang (4) | LOW | Add shutdown event + `--timeout-graceful-shutdown` |
| Tracking half-enforced (6) | LOW | Introduce `reconcile_tracking()` and call it from all mutators |
| Structured output not enforced (8) | LOW-MEDIUM | Simplify schema, add `require_parameters`, add fence-strip/validate fallback |
| Chart time errors (12) | LOW | Add one time-normalization helper in the chart wrapper |
| Volume permissions / bind mount (14) | LOW | Switch to named volume, chown in image, `docker compose down -v` once |
| Docker venv/uv breakage (15) | MEDIUM | Align `WORKDIR`, use official uv multi-stage pattern, add `.dockerignore` |
| App Control blocks host Playwright (16) | MEDIUM-HIGH | Move E2E into a Docker Playwright image (revives `docker-compose.test.yml`); decide in P0 not P6 |
| Flaky E2E (27) | MEDIUM | Add `SIM_SEED`/`SIM_EVENT_PROBABILITY`, state reset, invariant assertions |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 Contract drift | P0 (freeze), P1/P2/P4 | Contract tests on SSE/REST shapes; single grep for field names |
| 2 Float money math | P2 | Edge-case unit tests (0.1+0.2, all-cash, all-shares) |
| 3 Non-atomic/concurrent trades | P2, P3 | Concurrent trade test; no `async def` + raw sqlite |
| 4 SSE shutdown | P1, P5 | `docker stop` < 3 s; shutdown test |
| 5 Task lifecycle | P1 | Tests with lifespan context; frozen-feed health signal |
| 6 Tracking rule | P2, P3 | Unit tests for watched+held, closed position, AI buy |
| 7 SSE dict != watchlist | P4 | Component test with held-but-unwatched ticker |
| 8 Structured output assumptions | P3, P6 | Live smoke; malformed-response unit tests; schema printed and reviewed |
| 9 EventSource reconnect | P1, P4, P6 | Resilience E2E incl. 500 response case |
| 10 Static serving | P1 (conditional mount), P5 | `/api/nope` JSON 404; backend tests without `static/` |
| 11 Next export gotchas | P0, P4 | `next build` green on host and Docker; dev loop documented |
| 12 Lightweight Charts v5 | P4 | No console errors after 5 min; chart wrapper unit tests of time helper |
| 13 Re-render storm/flash | P4 | React Profiler check; fake-timer flash test |
| 14 SQLite init/volume | P2, P5 | Concurrent first-request test; persistence across `down`/`up` |
| 15 Docker/uv | P5 | Clean-clone build; image runs as intended user |
| 16 Windows TLS/App Control/CRLF | P0 (smoke), P5, P6 | Smoke checklist passes; `.gitattributes` in place |
| 17 Snapshot/P&L chart | P2, P4 | Fresh start has a non-empty chart; row count bounded |
| 18 LLM auto-exec truthfulness | P3 | Failed-trade chat test shows server-generated result |
| 19 Mock pipeline | P3, P6 | Mock exercises parse/validate/execute/persist |
| 20 Massive free-plan budget | P1 | Stub tests for weekend/holiday walk-back call count |
| 21 Simulator tuning/seed | P1, P6 | Seeded deterministic test; 60 s eyeball of sparkline |
| 27 Playwright flakiness | P6 | 3 consecutive green runs on clean volume, random order |

## Items that need deeper phase-specific research or a spike

- **P0 spike (highest value):** App Control vs host-side Playwright/Next native binaries; Docker-build TLS under Avast; Next 16 dev-loop strategy with `output: 'export'`. These can force reversing PROJECT.md decision #23.
- **P3:** live check of Cerebras via OpenRouter with the exact Pydantic schema and the installed LiteLLM version (`reasoning_effort`, `response_format`, `extra_body.provider`); confirm `require_parameters` behavior.
- **P4:** confirm Lightweight Charts v5 current React patterns and a treemap library choice (Recharts `Treemap` vs `d3-hierarchy` + custom SVG) at the start of the phase.
- **P6:** a concrete approach for severing an open EventSource in Playwright.

## Sources

Confidence levels: HIGH = official docs/Context7; MEDIUM = web search of reputable docs/issue discussions, or well-established behavior; LOW = inference, unverified.

- Project documents (HIGH, primary): `planning/PLAN.md` (incl. section 13 review), `.planning/PROJECT.md`, `planning/MARKET_INTERFACE.md`, `planning/MASSIVE_API.md`, `planning/MARKET_SIMULATOR.md`, `.claude/skills/cerebras/SKILL.md`
- Cerebras structured outputs constraints (strict mode `additionalProperties:false`, unsupported keywords, schema size limits; `gpt-oss-120b` supported) - https://inference-docs.cerebras.ai/capabilities/structured-outputs.md (HIGH)
- OpenRouter provider routing (`order`, `allow_fallbacks`, `require_parameters`; structured-output support is per provider endpoint) - search results incl. https://openrouter.ai/blog/tutorials/langchain-chatopenrouter-setup/ and community guides (MEDIUM)
- Reports of `openai/gpt-oss-120b` ignoring `response_format.json_schema` on some hosts - https://community.groq.com/t/structured-outputs-ignored-by-openai-gpt-oss-120b/687 (MEDIUM, different provider, supports the "do not assume enforcement" stance)
- LiteLLM `response_format` with Pydantic, `LITELLM_LOCAL_MODEL_COST_MAP` - https://docs.litellm.ai/docs/completion/json_mode , https://docs.litellm.ai/docs/proxy/custom_model_cost_map (HIGH/MEDIUM)
- Lightweight Charts v5.2 (`addSeries(LineSeries)`, `update()` for real-time, `autoSize` via ResizeObserver, React lifecycle tutorial) - Context7 `/tradingview/lightweight-charts` v5.2.0 (HIGH)
- Next.js static export unsupported features (dynamic routes without `generateStaticParams`, rewrites/redirects/headers, default image loader, Server Actions, ISR) and `dynamic = 'error'` - Context7 `/vercel/next.js` v16.2.9 static-exports guide (HIGH)
- uv Docker pattern (`UV_COMPILE_BYTECODE`, `UV_LINK_MODE=copy`, `UV_NO_DEV`, `UV_PYTHON_DOWNLOADS=0`, two-step `uv sync --locked --no-install-project`, `.dockerignore` `.venv`) - Context7 `/astral-sh/uv-docker-example` (HIGH)
- Uvicorn shutdown waiting on open SSE connections / `timeout_graceful_shutdown` - search results incl. https://blog.est.im/2023/stdout-12 and sse-starlette docs (MEDIUM)
- EventSource reconnection semantics (no reconnect on non-200 or wrong content-type) - WHATWG HTML spec section 9.2 https://html.spec.whatwg.org/multipage/server-sent-events.html (HIGH)
- Starlette `StaticFiles` `html=True` / `404.html` behavior; Next `trailingSlash` - FastAPI/Starlette docs and https://nextjs.org/docs/pages/guides/static-exports (MEDIUM)
- Node system CA support (`--use-system-ca`, `NODE_USE_SYSTEM_CA=1`; Windows store; v22.15+/v23.9+/v24) - https://nodejs.org/learn/http/enterprise-network-configuration , https://nodejs.org/en/blog/release/v23.8.0 (MEDIUM-HIGH)
- Windows/Avast TLS and App Control specifics - user `CLAUDE.md` and project memory (HIGH for what was observed; the extrapolation to Playwright/Next native binaries and Docker-build TLS is LOW and flagged as a P0 spike)
- A secondary source mentioned a native `app.frontend()` SPA helper in FastAPI - unverified, deliberately not recommended (LOW)

---
*Pitfalls research for: AI-powered simulated trading workstation (FinAlly)*
*Researched: 2026-10-06*
