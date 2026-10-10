# Phase 3: Trading & Watchlist Management - Research

**Researched:** 2026-10-08
**Domain:** Atomic SQLite trade execution, runtime ticker tracking (watchlist ∪ positions), FastAPI mutation routes, React/zustand trade and watchlist UI
**Confidence:** HIGH (every backend claim below was checked by reading the repo or running code against the installed stack this session)
**Mode:** MVP, vertical slices, tracer-first. No CONTEXT.md exists (user skipped discuss-phase).

## Summary

Phases 1-2 already built almost everything this phase sits on: the SQLite schema with CHECK constraints, `build_portfolio`, the price cache, `MarketDataSource.add_ticker/remove_ticker`, the `{error}` envelope, a frozen API contract, a zustand price store, and `load_tracked_tickers` for startup. Phase 3 adds three backend pieces (a transaction helper plus `execute_trade`, a `tracking` module that is the single place deciding what the market source tracks, and watchlist POST/DELETE) and three frontend pieces (a shared portfolio store, a trade bar plus positions table, and add/remove controls on the watchlist panel). No new packages are needed on either side.

The three things most likely to go wrong, all reproduced or read in the code this session: (1) `remove_ticker` evicts a held ticker's price unconditionally (`massive_client.py:86-88`, `simulator.py:155-157`), so every watchlist/trade path must go through one `sync_ticker` that tracks a ticker exactly when it is watched or held; (2) Pydantic's default `float` accepts `NaN`, `"1e3"` and `true`, and a NaN quantity slips past `quantity <= 0` (I reproduced a NaN reaching the handler and crashing JSON encoding), so the request model needs `Field(strict=True, allow_inf_nan=False)` and `execute_trade` must test `not quantity > 0`; (3) `PriceCell` hard-codes `data-testid="price-<TICKER>"`, so reusing it in the positions table creates duplicate test ids and breaks the existing Playwright smoke spec (strict-mode locator violation).

**Primary recommendation:** Build `execute_trade(conn, cache, ticker, side, quantity)` as one synchronous function inside `BEGIN IMMEDIATE`/`COMMIT` (trade row, position upsert/delete, cash, snapshot, portfolio view all in one transaction), orchestrate it from `async def` routes via `asyncio.to_thread` with a `try/finally: await sync_ticker(...)`, and move the portfolio into a zustand store with a ticket-based stale-response guard so Header, TradeBar and PositionsTable all read one source of truth.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MKT-08 | Tracked tickers = watchlist ∪ open positions; buying an untracked ticker starts tracking before pricing | `tracking.sync_ticker` + `add_ticker` before price read; Pitfall 1, Pattern 2; startup half already done (`db.py:98-108`) |
| WL-02 | `POST /api/watchlist`: upper-case, format check, 400 "Unknown ticker" if no price appears | Pattern 3, `normalize_ticker`, Massive unknown-symbol behavior (`planning/MASSIVE_API.md:353`) |
| WL-03 | `DELETE /api/watchlist/{ticker}`: 404 unknown, held ticker keeps streaming | Pattern 3, Pitfall 1 (IN-03) |
| PORT-02 | Buy at current price, cash down, qty/avg cost update, fractional allowed | Pattern 1 (weighted average, 6 dp quantity, 2 dp money) |
| PORT-03 | Sell, cash up, row deleted at zero (float residue handled) | Pattern 1, Pitfall 3 |
| PORT-04 | Invalid trades 400 `{"error"}`, change nothing | Pattern 1 (validation inside the transaction), Pitfall 2 |
| PORT-05 | Atomic, appended to `trades`, followed by snapshot | `transaction()` helper, verified rollback/commit under `autocommit=True` |
| PORT-06 | Trade response includes updated portfolio | `build_portfolio` reused inside the transaction (one call serves snapshot and response) |
| UI-06 | Add/remove watchlist tickers from the panel | Watchlist UI pattern; mutation responses replace panel state |
| PUI-01 | Trade bar: ticker, quantity, Buy, Sell; inline success/error; disabled in flight | TradeBar pattern; strict numeric parse; no Enter-submit |
| PUI-02 | Positions table, live updating | `livePosition` helper, per-row store selection, distinct testids |
| TEST-02 | Backend pytest for portfolio (execution, P&L, oversell, insufficient cash, selling at a loss) | Validation Architecture, test list below |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Extracted from `./CLAUDE.md`, `./.claude/CLAUDE.md` and the user-scope `CLAUDE.md`. Treated as locked.

- Python tooling: always `uv run` / `uv add`, never `pip`/`python3`. Tests run as `uv run --directory backend python -m pytest` (App Control blocks the bare `pytest.exe`).
- Simple and incremental; short modules and functions; do not over-engineer; no defensive programming; use exception handling only where needed; clear docstrings, sparse comments elsewhere.
- No emojis in code, print statements or logs.
- Use the latest library APIs (verify against docs).
- `planning/API_CONTRACT.md` is the single API/SSE contract; change the API only by editing that file.
- Stack is fixed: FastAPI + stdlib `sqlite3` (no ORM, no `aiosqlite`), `def`/threadpool for DB work, Next.js static export + Tailwind v4, zustand, Vitest + RTL + jsdom, Playwright on the host.
- TLS verification stays on; never `verify=False` or equivalents. (No network installs are needed this phase.)
- Concise README; the Phase 6 owns README and `data-testid` audit, but stable testids are cheap now.
- GSD workflow enforcement: file changes go through a GSD command (planned phase work uses `/gsd-execute-phase`).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Trade validation and fill (cash, position, trade log, snapshot) | API / Backend (sync, one SQLite transaction) | Database (CHECK constraints as backstop) | Money rules must be identical for manual and (Phase 5) LLM trades and atomic against concurrent requests |
| Decide which tickers are streamed | API / Backend (`tracking.py`) | Market source (add/remove) | Only the backend knows watchlist ∪ positions; the frontend must never derive membership from SSE keys |
| Ticker format and "Unknown ticker" check | API / Backend | Market source (price appears or not) | Source-dependent: simulator accepts any well-formed symbol, Massive drops unknown symbols |
| Live P&L per position | Browser / Client (recompute from SSE price) | API (authoritative snapshot in trade/portfolio responses) | Prices tick 2x/s; server values are the baseline, the client recomputes display-only numbers |
| Portfolio state shared by Header / TradeBar / PositionsTable | Browser / Client (zustand store) | API (response of trade and `GET /api/portfolio`) | One store avoids three components each holding a stale copy |
| Inline errors and in-flight lock | Browser / Client | API (`{"error"}` text) | Server text is rendered verbatim as text, never as HTML |
| Watchlist membership and order | API (`GET/POST/DELETE /api/watchlist`) | Browser (panel state from responses) | Per API contract, clients must not derive the watchlist from the SSE payload |

## Standard Stack

No new dependencies. Everything below is already pinned in `backend/pyproject.toml` and `frontend/package.json` (read this session).

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | 0.142.2 | Routes, Pydantic request models | `[VERIFIED: backend/pyproject.toml:7]` `"fastapi==0.142.2"` |
| stdlib `sqlite3` | Python 3.12 | Transactions (`BEGIN IMMEDIATE`) | Project decision: no ORM; `[VERIFIED: backend/app/db.py:66]` `conn = sqlite3.connect(db_path, autocommit=True)` |
| Pydantic | via FastAPI (2.x) | `TradeRequest`, `WatchlistRequest` | Already produces the 400 envelope through `errors.py` |
| zustand | 5.0.15 | `useMarketStore` exists; add a portfolio store | `[VERIFIED: frontend/package.json:17]` `"zustand": "5.0.15"` |
| Vitest / RTL / jsdom | 5.0.3 / 16.3.3 / 30.1.2 | Component and store tests | Existing setup (`vitest.config.ts`, `vitest.setup.ts`) |
| @playwright/test | 1.63.0 | Optional trade E2E on the host | Existing `test/` project; chromium already installed (`ms-playwright/chromium-1243`) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled `transaction()` ctx manager | `conn.autocommit = False` + `with conn:` | Python 3.12 `autocommit=False` mode opens a deferred transaction implicitly; we need `BEGIN IMMEDIATE`, so an explicit 8-line helper is clearer |
| `asyncio.to_thread` for DB calls | `anyio.from_thread.run` inside a plain `def` route | Works but obscure; `async def` + `to_thread` matches `massive_client.py` usage |
| `Decimal` arithmetic | `round(x, 2)` / `round(x, 6)` at one boundary | Decimal is safer in theory but the cache already rounds prices to 2 dp; rounding helpers with the edge-case tests below are enough and match "do not over-engineer" |
| `Field(gt=0)` on the request model | Check in `execute_trade` | `gt=0` produces a Pydantic message and does not cover the chat path; one check in `execute_trade` serves both |

**Installation:** none.

**Version verification:** `uv run --directory backend python -m pytest -q` -> `112 passed` and `npm --prefix frontend test` -> `87 passed (8 files)` on this machine today (baseline before any Phase 3 change). Node is v26.8.1, uv 0.12.17.

## Package Legitimacy Audit

No external packages are installed in this phase, so the audit is not applicable.
`@testing-library/user-event` is named in STACK.md but is NOT in `frontend/package.json`; do not add it. Existing tests drive the DOM with `fireEvent`, which is sufficient for button clicks and input changes.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Verified In-Repo Values (quoted verbatim)

These are the discrete values the plans and code skeletons below rely on. Each was read from the source file this session.

`[VERIFIED: backend/app/db.py:15]` `cash_balance REAL NOT NULL DEFAULT 10000.0 CHECK (cash_balance >= 0),`
`[VERIFIED: backend/app/db.py:27-28]` `quantity REAL NOT NULL CHECK (quantity > 0),` and `avg_cost REAL NOT NULL CHECK (avg_cost > 0),`
`[VERIFIED: backend/app/db.py:36]` `side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),`
`[VERIFIED: backend/app/db.py:32-40]` trades columns: `id`, `user_id`, `ticker`, `side`, `quantity`, `price`, `executed_at`; snapshots (`db.py:41-46`): `id`, `user_id`, `total_value`, `recorded_at`; positions (`db.py:24-31`): `user_id`, `ticker`, `quantity`, `avg_cost`, `updated_at`, PRIMARY KEY `(user_id, ticker)`.
`[VERIFIED: backend/app/db.py:58-60]` `now_iso()` returns `datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")` (one-second resolution).
`[VERIFIED: backend/app/main.py:49]` `app.add_route("/api/{path:path}", JSONResponse({"error": "Not found"}, status_code=404))`; routers must be included above it (`main.py:42-44`).
`[VERIFIED: backend/app/market/interface.py:17-27]` `add_ticker(self, ticker: str) -> None` ("No-op if already tracked."), `remove_ticker(self, ticker: str) -> None` ("Stop tracking a ticker and drop it from the cache. No-op if not tracked."), `get_tickers(self) -> list[str]`.
`[VERIFIED: backend/app/market/cache.py:47-50]` `get_price(self, ticker: str) -> float | None`; `remove` bumps `version` only when the ticker existed (`cache.py:57-61`).
`[VERIFIED: planning/API_CONTRACT.md:16-17]` "Ticker identity is the upper-cased ASCII symbol matching `[A-Z][A-Z.]{0,9}`. Input is upper-cased before the format check; anything that fails the check is rejected."
`[VERIFIED: planning/API_CONTRACT.md:104-108]` re-add idempotent 200; `400 {"error": "Invalid ticker: PYPL$"}` for a malformed input (message quotes the rejected input); `400 {"error": "Unknown ticker"}` when well formed but no price appears.
`[VERIFIED: planning/API_CONTRACT.md:112-114]` `DELETE` returns `200 {"watchlist": [WatchlistItem]}`; `404 {"error": "Ticker not in watchlist"}`.
`[VERIFIED: planning/API_CONTRACT.md:122-129]` trade body `{"ticker": "AAPL", "quantity": 1.5, "side": "buy"}`; `200 {"trade": Trade, "portfolio": Portfolio}`; `400 {"error": "..."}` for quantity <= 0, a ticker with no price, insufficient cash, insufficient shares, or a bad `side`; "A trade is all-or-nothing: a rejected trade changes nothing (no cash movement, no position change, no trade row, no snapshot)."
`[VERIFIED: planning/API_CONTRACT.md:173]` Trade: `{id, ticker, side, quantity, price, executed_at}`. Rounding (`API_CONTRACT.md:11-12`): "prices and money amounts to 2 dp, quantities to 6 dp".

## Architecture Patterns

### System Architecture Diagram

```
Browser (Next static export, one origin)
  TradeBar --POST /api/portfolio/trade--+      WatchlistPanel --POST/DELETE /api/watchlist--+
  PositionsTable / Header read           |                                                   |
  portfolioStore + marketStore           v                                                   v
        ^                        +--------------------------- FastAPI async routes -----------------------------+
        | trade/watchlist        | 1 normalize_ticker (ASCII, upper, fullmatch)  -> DomainError 400            |
        | responses              | 2 buy / watchlist-add: await source.add_ticker(t)  (price appears in cache) |
        |                        | 3 await asyncio.to_thread(sync DB fn)                                       |
        |                        |      execute_trade:  BEGIN IMMEDIATE                                        |
        |                        |        validate -> read price once -> write cash/position/trade             |
        |                        |        build_portfolio -> insert snapshot -> COMMIT (ROLLBACK on error)     |
        |                        | 4 finally: await sync_ticker(t)  = tracked iff watched or held              |
        |                        +-------------------------------+---------------------------------------------+
        |                                                        |
        |   SSE frame (all tracked)                              v
        +------------- PriceCache <-- Simulator / Massive poller (add_ticker, remove_ticker)
```

### Recommended Project Structure (additions only; flat modules match Phase 2)
```
backend/app/
├── errors.py        # + DomainError (400) / NotFoundError (404) and one handler
├── db.py            # + transaction(conn) context manager
├── tracking.py      # NEW: normalize_ticker, is_wanted, sync_ticker (single choke point)
├── trading.py       # NEW: execute_trade (sync core), place_trade (async orchestration), POST route
├── watchlist.py     # + add/remove (sync DB cores + async orchestration) and POST/DELETE routes
└── portfolio.py     # unchanged (build_portfolio is reused)
backend/tests/
├── conftest.py      # + FixedPriceSource and a `client` fixture (no ticking prices)
├── test_trading.py  # NEW: TEST-02 unit tests on execute_trade + route shape tests
└── test_tracking.py # NEW: MKT-08, WL-02, WL-03 tests
frontend/src/
├── lib/portfolioStore.ts      # NEW: portfolio + ticket-guarded setters
├── lib/positions.ts           # NEW: livePosition(p, price) pure helper
├── lib/api.ts                 # + postTrade, addTicker, removeTicker, shared send()
├── components/TradeBar.tsx    # NEW
├── components/PositionsTable.tsx (+ PositionRow) # NEW
├── components/Header.tsx      # reads portfolioStore instead of local state
├── components/WatchlistPanel.tsx / WatchlistRow.tsx # add form, remove button
└── app/page.tsx               # mounts TradeBar + PositionsTable in the 1fr workspace column
test/trade.spec.ts             # optional tracer E2E (Phase 6 owns the formal suite)
```

### Pattern 1: `execute_trade` as one synchronous transaction

**What:** One function, shared later by the Phase 5 chat path, doing validation and all writes inside `BEGIN IMMEDIATE`. It reads the price from the cache once and uses that value for validation, cash math, the `trades` row and the snapshot.
**Verified this session (scratch run against Python 3.12 with `autocommit=True`):** `BEGIN IMMEDIATE ... ROLLBACK` leaves 0 rows and `in_transaction` False; `BEGIN IMMEDIATE ... COMMIT` persists; a second connection blocked on `BEGIN IMMEDIATE` waited 0.55 s while the first held the lock and then proceeded (default `PRAGMA busy_timeout` is 5000 ms, so no extra pragma is needed). Float behavior: `round(0.1+0.2, 6) == 0.3` and `round(round(0.1+0.2,6)-0.3, 6) == 0.0`; `round(1e-9, 6) == 0.0`.

```python
# db.py
@contextmanager
def transaction(conn: sqlite3.Connection):
    """Run the block under BEGIN IMMEDIATE: commit on success, roll back on any error."""
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    conn.execute("COMMIT")
```

```python
# trading.py (sync core; wording of messages is the planner's choice, see Assumptions)
def execute_trade(conn, cache, ticker: str, side: str, quantity: float) -> dict:
    """Fill a market order atomically and return {"trade", "portfolio"}."""
    quantity = round(quantity, 6)
    if not quantity > 0:                       # also false for NaN
        raise DomainError("Quantity must be greater than 0")
    with transaction(conn):
        cash = conn.execute("SELECT cash_balance FROM users_profile WHERE user_id = ?", (USER_ID,)).fetchone()[0]
        row = conn.execute("SELECT quantity, avg_cost FROM positions WHERE user_id = ? AND ticker = ?",
                           (USER_ID, ticker)).fetchone()
        held, avg = (row["quantity"], row["avg_cost"]) if row else (0.0, 0.0)
        if side == "sell" and quantity > held:
            raise DomainError(f"Insufficient shares: you hold {held:g} {ticker}")
        price = cache.get_price(ticker)        # read ONCE
        if price is None:
            raise DomainError(f"No price available for {ticker}")
        amount = round(price * quantity, 2)
        if side == "buy" and amount > cash:
            raise DomainError("Insufficient cash")
        ...  # buy: new_qty = round(held + quantity, 6); new_avg = (held*avg + quantity*price) / new_qty
             # sell: new_qty = round(held - quantity, 6); avg unchanged; new_qty == 0 -> DELETE row
             # cash = round(cash -/+ amount, 2); INSERT trades row; UPSERT positions (ON CONFLICT DO UPDATE)
        portfolio = build_portfolio(conn, cache)       # same connection sees the uncommitted writes
        conn.execute("INSERT INTO portfolio_snapshots (id, user_id, total_value, recorded_at) VALUES (?, ?, ?, ?)", ...)
    return {"trade": trade, "portfolio": portfolio}
```

Rules to encode (all from PITFALLS.md Pitfall 2/3 and verified numerically above):
- Quantize quantity to 6 dp **before** every comparison and store only 6-dp quantities, so `held - quantity` is exact enough to compare with `0`. Delete the row when the rounded remainder is `0` (equivalently `< 1e-6`), never rely on raw float equality.
- Compare money in 2-dp values: `amount = round(price * quantity, 2)`, `cash = round(cash - amount, 2)`.
- Sell leaves `avg_cost` unchanged. Buy uses the quantity-weighted average. Round `avg_cost` to 6 dp when storing (stabilizes the stored value; the API already rounds to 2 dp for display).
- Check ownership before the price check on sells, so selling a never-held ticker reports "insufficient shares" instead of a confusing "no price".
- Parameterized SQL only (existing convention).
- The `cash_balance >= 0`, `quantity > 0`, `avg_cost > 0` CHECKs are a backstop only; an `IntegrityError` here is a bug and surfaces as the generic 500.

### Pattern 2: Async orchestration with `tracking.sync_ticker` (the single choke point)

Routes are `async def` because `source.add_ticker/remove_ticker` are coroutines and a plain `def` handler cannot await them. The blocking SQLite calls go through `await asyncio.to_thread(...)` so the event loop (SSE and the simulator tick) never blocks on SQLite. `[CITED: .planning/research/PITFALLS.md Pitfall 3/6]`

```python
# tracking.py
TICKER = re.compile(r"[A-Z][A-Z.]{0,9}")

def normalize_ticker(raw: str) -> str:
    """Upper-case an ASCII ticker and check its format; the message quotes the rejected input."""
    ticker = raw.upper() if raw.isascii() else ""
    if not TICKER.fullmatch(ticker):
        raise DomainError(f"Invalid ticker: {raw}")
    return ticker

def is_wanted(db_path, ticker) -> bool:
    """True when the ticker is on the watchlist or has an open position."""

async def sync_ticker(state, ticker: str) -> None:
    """Track the ticker exactly when it is watched or held; idempotent in both directions."""
    if await asyncio.to_thread(is_wanted, state.settings.db_path, ticker):
        await state.source.add_ticker(ticker)
    else:
        await state.source.remove_ticker(ticker)
```

```python
# trading.py (async orchestration; the route body is two lines around this)
async def place_trade(state, raw_ticker: str, side: str, quantity: float) -> dict:
    ticker = normalize_ticker(raw_ticker)
    try:
        if side == "buy":
            await state.source.add_ticker(ticker)     # start streaming BEFORE reading the price (MKT-08)
        return await asyncio.to_thread(run_trade, state, ticker, side, quantity)  # opens conn, calls execute_trade
    finally:
        await sync_ticker(state, ticker)               # failed buy of an unwatched ticker untracks it; full sell untracks
```

Why this shape: the state is `request.app.state` (`settings`, `cache`, `source` are set in the lifespan, `main.py:25-27`). Passing `state` keeps signatures short and lets Phase 5's chat call the same `place_trade`, `add_to_watchlist`, `remove_from_watchlist` functions with its own `request.app.state`. `execute_trade` itself stays pure `(conn, cache, ...)` so TEST-02 unit tests need no FastAPI.

Notes:
- A sell must NOT call `add_ticker` first: a sell of a never-held symbol would start tracking an arbitrary string. A held ticker is already tracked (startup union + this rule).
- After the final sell of an unwatched ticker, `sync_ticker` calls `remove_ticker`; the response `portfolio` was built inside the transaction so it already omits the position, and the next SSE frame drops the ticker (cache `remove` bumps `version`).
- Accepted limitation: two concurrent requests for the same ticker could interleave `add`/`remove` around a price read. Single-user app; do not add locking.

### Pattern 3: Watchlist mutations

```python
async def add_to_watchlist(state, raw_ticker: str) -> list[dict]:
    ticker = normalize_ticker(raw_ticker)
    if await asyncio.to_thread(on_watchlist, state, ticker):        # idempotent 200, no market calls
        return await asyncio.to_thread(read_watchlist, state)
    await state.source.add_ticker(ticker)
    if state.cache.get_price(ticker) is None:
        await sync_ticker(state, ticker)                             # untracks (not watched, not held)
        raise DomainError("Unknown ticker")
    return await asyncio.to_thread(insert_and_read, state, ticker)   # INSERT, then build_watchlist
```

```python
async def remove_from_watchlist(state, raw_ticker: str) -> list[dict]:
    ticker = raw_ticker.upper()
    items = await asyncio.to_thread(delete_and_read, state, ticker)  # raises NotFoundError("Ticker not in watchlist") if no row
    await sync_ticker(state, ticker)                                 # held ticker stays tracked; others evicted
    return items
```

- Routes for POST/DELETE live in `watchlist.py` (included above the catch-all already, `main.py:43`). Path param `{ticker}` handles dots (`BRK.B`).
- `Massive` unknown symbols are dropped silently from Snapshot and Grouped Daily responses, so "no price appeared" is the signal `[CITED: planning/MASSIVE_API.md:353]`. `MassiveDataSource.add_ticker` puts the candidate into `_tickers` before polling (`massive_client.py:76-84`), so a rejected symbol MUST be cleaned up through `sync_ticker` -> `remove_ticker` (otherwise it is polled forever).
- The simulator never rejects a well-formed symbol (`SimulatorDataSource.add_ticker` writes a price immediately, `simulator.py:149-153`), so "Unknown ticker" is only reachable in tests with a stub source that never prices.

### Pattern 4: Typed request models and the error envelope

```python
class TradeRequest(BaseModel):
    ticker: str
    quantity: float = Field(strict=True, allow_inf_nan=False)
    side: Literal["buy", "sell"]
```

Verified this session against the installed Pydantic through the app's own handlers (`errors.py`): `"NaN"`, JSON `NaN` and `1e999` -> `400 {'error': 'quantity: Input should be a finite number'}`; `"1e3"` and `true` with `strict=True` -> rejected as `Input should be a valid number`; missing field -> `400 {'error': 'quantity: Field required'}`; `side: "hold"` -> `400 {'error': "side: Input should be 'buy' or 'sell'"}`; `ticker: 123` -> `400 {'error': 'ticker: Input should be a valid string'}`; `GET /api/portfolio/trade` (wrong method on a known path) -> `404 {'error': 'Not found'}` because the catch-all route is a full match and beats the partial match. Without `strict`/`allow_inf_nan` a NaN quantity reaches the handler and even crashes `json.dumps` on echo.

Add to `errors.py` (Starlette resolves handlers by exception MRO; `DomainError` handlers registered via `@app.exception_handler(DomainError)` are used by the exception middleware, only the bare `Exception` handler goes to the server-error layer):

```python
class DomainError(Exception):
    """A rule violation the client can fix: 400 {"error": message}."""
    status_code = 400

class NotFoundError(DomainError):
    status_code = 404
```
One handler returns `JSONResponse({"error": str(exc)}, status_code=exc.status_code)`. Chat (Phase 5) catches `DomainError` per action and records `ok: false`.

### Pattern 5: Frontend portfolio store with a stale-response guard (closes 02-REVIEW IN-01)

`Header.tsx` currently owns `useState<Portfolio | null>` and refetches on connect (`Header.tsx:13-29`). With a trade bar and positions table, three components need the same portfolio, and a slow `GET /api/portfolio` must never overwrite a newer trade response. Rule: a GET takes its ticket when it starts; a mutation takes its ticket when its response arrives; apply only if the ticket is newer than the last applied one.

```ts
// lib/portfolioStore.ts
let issued = 0;
let applied = 0;

export const usePortfolioStore = create<{ portfolio: Portfolio | null; load: () => void; applyTrade: (p: Portfolio) => void }>()((set) => ({
  portfolio: null,
  load: () => {
    const ticket = ++issued;
    getPortfolio().then((p) => { if (ticket > applied) { applied = ticket; set({ portfolio: p }); } }).catch(() => {});
  },
  applyTrade: (p) => { applied = ++issued; set({ portfolio: p }); },   // authoritative and newest
}));
```
Provide a test-reset helper (module counters plus `setState`) because Header tests call `useMarketStore.setState(initialMarketState())` in `beforeEach` and will need the same for this store. Header keeps its "load on mount and on each transition to connected" behavior by calling `load()`; existing Header tests (`Header.test.tsx:25-44`) assert `fetch` call counts and `"/api/portfolio"`, which still hold.

### Pattern 6: Live position numbers on the client

Server `avg_cost` is rounded to 2 dp on the wire (`portfolio.py:33`), so recomputing P&L as `(price - avg_cost) * qty` on the client can be off by up to `0.005 * qty` (about $0.50 at 100 shares). Derive the cost basis from fields that are already consistent: `cost_basis = p.market_value - p.unrealized_pnl` (each rounded to cents, error <= 1 cent). Then, for a live price `price = prices[ticker]?.price ?? p.current_price`:

```ts
// lib/positions.ts
export function livePosition(p: Position, price: number) {
  const cost = p.market_value - p.unrealized_pnl;
  const value = p.quantity * price;
  return { price, value, pnl: value - cost, pnlPercent: cost > 0 ? ((value - cost) / cost) * 100 : 0 };
}
```
`liveTotals` (`totals.ts`) is unchanged and already tracks the header total from live prices.

### Pattern 7: Trade bar and watchlist controls

- TradeBar: ticker `<input>` (trimmed, sent as typed; server upper-cases), quantity `<input type="text" inputMode="decimal">` parsed with a strict pattern (digits with optional decimal part up to 6 dp; reject `1e3`, `10,5`, empty, `0`). Buttons are `type="button"`, inside a `<form onSubmit={e => e.preventDefault()}>` so Enter never fires an implicit buy. Buy and Sell both disabled while a request is in flight. Success text from the response (`side`, `quantity`, `price` via `fmtQty`/`fmtMoney`), error text from the server `{"error"}` rendered as plain text (React escapes it; never `dangerouslySetInnerHTML`). Network failure shows a fixed "Could not reach the server" message. Apply `res.portfolio` with `usePortfolioStore.getState().applyTrade`.
- Submit buttons use `bg-secondary` (`#753991`, white text contrast about 7.6:1, computed from the WCAG luminance formula) per PLAN.md section 2 and the Phase 2 UI-SPEC reservation (`02-UI-SPEC.md` color table: "Not used in this phase (reserved for Phase 3/5 submit buttons)").
- WatchlistPanel: keep local `view` state (Phase 5 will lift it). After add/remove set `{kind: "ready", items: response.watchlist}`; do NOT call `load()` (it flips to the skeleton). Add form: input + Add button, disabled in flight, inline error (server message verbatim), clear input on success. Per-row remove button with `aria-label="Remove AAPL"` and a fixed narrow column. A removed ticker's row disappears; a held ticker stays priced because its position row reads the same SSE map.
- API helpers: one `send(method, url, body?)` that, on `!res.ok`, reads `{error}` from the body (falling back to a fixed message if the body is not JSON) and throws `new Error(error)`. The existing Phase 2 tests deliberately assert that GET failures do NOT echo status/body; keep `getWatchlist`/`getPortfolio` as they are and use the new helper only for mutations.
- Workspace layout: `page.tsx` currently has the watchlist as the only child of `<main className="min-h-0 flex-1 lg:grid lg:grid-cols-[480px_1fr]">`. Mount `TradeBar` above `PositionsTable` in a new `<section className="min-h-0 overflow-y-auto">` in the `1fr` column (the Phase 2 UI-SPEC reserved that slot: "Phase 3 mounts the trade bar"). Below 1024px the grid collapses to stacked blocks, so give `main` `overflow-y-auto` there.

### Anti-Patterns to Avoid
- **Calling `remove_ticker` directly from a route.** It evicts held tickers (the Phase 2 review's IN-03). Always go through `sync_ticker`.
- **`async def` route calling `conn.execute` directly.** Blocks the loop and the SSE stream; use `asyncio.to_thread` for the DB part.
- **Checking `quantity <= 0` only.** `NaN <= 0` is False; use `not quantity > 0` plus `allow_inf_nan=False`.
- **Deriving watchlist rows or position rows from SSE keys.** Rows come from REST; prices from SSE.
- **Reusing `PriceCell` in the positions table.** It emits `data-testid="price-<TICKER>"` (`PriceCell.tsx:14`), which would duplicate the watchlist row's id and break `page.getByTestId("price-AAPL")` in `test/smoke.spec.ts`. Use `position-price-AAPL`-style ids.
- **Refetching the watchlist after every mutation via `load()`.** It resets to the loading skeleton; use the mutation response.
- **`re.match(r"...$")` for ticker validation.** `$` matches before a trailing newline; `"AAPL\n"` passes `re.match(...$)` (verified) but fails `re.fullmatch`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic multi-statement write | Manual try/except around autocommit statements | `transaction()` helper with `BEGIN IMMEDIATE` | Verified rollback and writer serialization; avoids lost updates between concurrent requests |
| 400 envelope for bad bodies | Per-route validation text | Pydantic model + existing `RequestValidationError` handler | Already maps every body error to `400 {"error": ...}` |
| Tracking rule | Per-route add/remove calls | `tracking.sync_ticker` | One rule, idempotent, reused by Phase 5 chat |
| Portfolio valuation | A second valuation in the trade path | `build_portfolio(conn, cache)` | Same numbers for snapshot, response and `GET /api/portfolio` |
| Number formatting | New formatters | `lib/format.ts` (`fmtMoney`, `fmtQty`, `fmtSigned`, `fmtPct`, `toneClass`) | UI-08 shared formatters |
| SSE price subscription | A second EventSource | `useMarketStore` selectors | Single stream (UI-03) |
| DB test fixtures | Per-test boilerplate | Move `make_db` from `tests/test_portfolio.py:11-21` into a shared conftest fixture | Trade tests need seeded positions too |

**Key insight:** the hard part of this phase is not any one feature but making five code paths (manual buy, manual sell, failed buy, watchlist add, watchlist remove) agree on what is tracked. Centralizing that in `sync_ticker` plus one trade function is what removes the bug class.

## Runtime State Inventory

Not a rename/refactor/migration phase. Omitted. (Schema is unchanged; no new tables or columns.)

## Common Pitfalls

### Pitfall 1: Removing a held ticker blanks its price (carry-over IN-03)
**What goes wrong:** `DELETE /api/watchlist/AAPL` while holding AAPL calls `remove_ticker`, which pops the price (`simulator.py:155-157`, `massive_client.py:86-88`). The position is then valued at `avg_cost` with an ERROR log (`portfolio.py:28-29`) and the header total jumps.
**How to avoid:** `sync_ticker` after every watchlist or trade mutation. Test: hold a ticker, remove it from the watchlist, assert `cache.get_price(t) is not None` and the position's `current_price != avg_cost` in `GET /api/portfolio`.
**Warning signs:** ERROR log line "No cached price for held ticker".

### Pitfall 2: Non-finite and loosely typed quantities
**What goes wrong:** default Pydantic float coercion accepts `"1e3"`, `true`, and non-finite values; `NaN <= 0` is False so validation passes; JSON encoding of NaN then raises. `[VERIFIED: scratch run, see Pattern 4]`
**How to avoid:** `Field(strict=True, allow_inf_nan=False)` plus `not quantity > 0` in `execute_trade` (the chat path bypasses the request model). Huge finite values such as `1e308` need no cap: they fail as insufficient cash or shares.

### Pitfall 3: Float ghost positions and exact-cash buys
**What goes wrong:** `0.1 + 0.2` shares then selling `0.3` leaves a `5.5e-17` row. 
**How to avoid:** store 6-dp quantities, round remainders to 6 dp, delete at 0. Tests (all verified numerically): buy 0.1 then 0.2, sell 0.3 -> row gone; buy exactly all cash (`100 x $100.00` on $10,000 -> cash `0.0`, accepted); sell exactly all shares. Note a "max affordable" quantity like `round(cash/price, 6)` can cost a cent more than cash after rounding at some prices; the UI has no "max" button, so this is not a defect.

### Pitfall 4: Rejected trade leaks a streamed ticker
**What goes wrong:** buy of an unwatched, unaffordable ticker calls `add_ticker`, the trade fails, and the ticker streams forever (or is polled forever on Massive).
**How to avoid:** the `finally: sync_ticker` in `place_trade`. Test: failed buy of an unwatched ticker leaves `source.get_tickers()` without it and the cache without its price.

### Pitfall 5: Ticker normalization holes
**What goes wrong:** `"ß".upper() == "SS"` and `"ı".upper() == "I"` both pass the regex (verified), so a non-ASCII input becomes a valid symbol; the contract says ASCII.
**How to avoid:** check `raw.isascii()` before `upper()`, use `re.fullmatch`. The DELETE path param only needs `.upper()` then a DB lookup (an invalid shape is simply "not in watchlist" -> 404).

### Pitfall 6: Duplicate `data-testid` across panels
Described in Anti-Patterns. Also keep PUI-08 in mind: use unique, stable ids (`trade-ticker`, `trade-quantity`, `trade-buy`, `trade-sell`, `trade-message`, `positions-table`, `position-row-<T>`, `position-price-<T>`, `watchlist-add-input`, `watchlist-add-button`, `watchlist-add-error`, `watchlist-remove-<T>`). Phase 6 audits ids but Phase 3 E2E needs them now.

### Pitfall 7: Stale portfolio overwrite
**What goes wrong:** Header mount fetch or reconnect fetch resolves after a trade response and rewrites old cash. (02-REVIEW IN-01.)
**How to avoid:** Pattern 5 ticket guard, with a unit test that resolves a slow GET after a trade and asserts the trade state wins.

### Pitfall 8: Snapshot timestamp collisions
`now_iso()` has one-second resolution (`db.py:58-60`), so a trade snapshot and a Phase 4 history-request snapshot can share a second. Phase 3 should simply insert (no uniqueness), and Phase 4's P&L chart must group by second (already noted in PITFALLS.md). Not a Phase 3 defect.

### Pitfall 9: Massive transient errors become 500s
`MassiveDataSource.add_ticker` awaits `_poll()` which can raise on a network or rate-limit error (`massive_client.py:84`), surfacing as the generic 500 on a trade or watchlist add. Accepted for this phase (no defensive programming); `finally: sync_ticker` still restores consistency.

### Pitfall 10: Shared E2E database
Playwright's single `webServer` shares one temp DB across all spec files (`test/playwright.config.ts`, `workers: 1`). Trade state persists between specs: assert invariants relative to observed state (cash decreased, row appears) and use a ticker no other spec uses for removal tests.

## Code Examples

### Route shapes (thin)
```python
# trading.py
@router.post("/api/portfolio/trade")
async def trade(body: TradeRequest, request: Request) -> dict:
    """Execute a market order; returns the fill and the updated portfolio."""
    return await place_trade(request.app.state, body.ticker, body.side, body.quantity)
```
`main.py` adds `app.include_router(trading.router)` next to the existing `include_router` lines, above the catch-all.

### Test double that does not tick (conftest)
```python
class FixedPriceSource(MarketDataSource):
    """Prices known tickers once at add time and never ticks; unknown tickers stay unpriced."""
    def __init__(self, cache, known: dict[str, float]): ...
    async def add_ticker(self, ticker):            # writes cache only if ticker in known
    async def remove_ticker(self, ticker):         # cache.remove + drop from tracked set
```
Install it by monkeypatching `app.main.create_market_data_source` (as `main.py:21` calls it at app creation) or by assigning `client.app.state.source` after the lifespan starts (routes read `request.app.state.source` per request). The real simulator ticks every 0.5 s and would overwrite hand-set cache prices, so route tests with exact expected cash must use this double.

### Frontend trade call
```ts
export async function postTrade(ticker: string, quantity: number, side: "buy" | "sell") {
  return send<{ trade: Trade; portfolio: Portfolio }>("POST", "/api/portfolio/trade", { ticker, quantity, side });
}
```
`Trade` type goes into `types.ts` as `{ id: string; ticker: string; side: "buy" | "sell"; quantity: number; price: number; executed_at: string }` (contract shape, `API_CONTRACT.md:173`).

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `@app.on_event`, `sse-starlette` | `lifespan`, native `fastapi.sse` | Already in place; no change |
| `sqlite3` implicit transaction control | `autocommit=True` (3.12) plus explicit `BEGIN IMMEDIATE` | The repo's connection helper already uses it; `transaction()` builds on it |
| `fastapi.testclient` default transport | Plain `httpx` with the Starlette deprecation warning filtered | Existing decision (STATE.md); tests keep using `TestClient` as in `test_watchlist.py` |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Error message wording ("Quantity must be greater than 0", "Insufficient cash", "Insufficient shares: you hold N T", "No price available for T") | Pattern 1 | Low. Contract fixes only three strings; Phase 5 mock "broke" path and E2E assertions should match whatever is chosen, so freeze them in `API_CONTRACT.md` if E2E asserts text |
| A2 | Rounding stored `avg_cost` to 6 dp | Pattern 1 | Low; tests use `pytest.approx` |
| A3 | Deriving cost basis as `market_value - unrealized_pnl` on the client keeps live P&L within ~1 cent of server values | Pattern 6 | Low; worst case cents of display drift |
| A4 | Both Buy and Sell use the purple `bg-secondary` style | Pattern 7 | Visual only; a UI-SPEC can differentiate |
| A5 | Accepting a tiny race between concurrent same-ticker requests (no lock) | Pattern 2 | Single-user; only a spurious "No price available" in a contrived double-submit |
| A6 | `asyncio.to_thread` and `starlette.concurrency.run_in_threadpool` are interchangeable here | Pattern 2 | None functionally |

## Open Questions

1. **Missing UI design contract for a UI phase.**
   - What we know: ROADMAP marks Phase 3 `UI hint: yes`; `.planning/config.json` has `ui_phase: true` and `ui_safety_gate: true`; `.planning/phases/03-trading-watchlist-management/` is empty (no `03-UI-SPEC.md`). Phase 1 overrode this gate by user decision (STATE.md).
   - What's unclear: whether the user wants `/gsd-ui-phase 3` first or another override.
   - Recommendation: orchestrator should surface this decision before planning. This research gives enough layout/behavior direction to plan without a UI-SPEC, but visual details (button treatment, remove-icon style, trade bar density) are unspecified.

2. **Success criterion 4 vs the frozen contract on "Unknown ticker".**
   - What we know: criterion 4 says "A malformed or unknown ticker is rejected with an inline 'Unknown ticker' error". The contract says malformed -> `400 {"error": "Invalid ticker: PYPL$"}` and only well-formed-but-unpriced -> `400 {"error": "Unknown ticker"}` (`API_CONTRACT.md:106-108`). The simulator prices every well-formed symbol, so "Unknown ticker" cannot occur in default simulator mode.
   - Recommendation: keep the contract; the UI shows the server message verbatim as the inline error (so a malformed entry shows "Invalid ticker: ...", still an inline rejection). Prove the literal "Unknown ticker" text with the `FixedPriceSource` double (backend) and a mocked-fetch component test (frontend). If the user wants the literal string for malformed input too, that is a contract edit (single file) plus a one-line change in `normalize_ticker`.

3. **Freeze trade error strings in the contract?** Phase 5's mock "broke" path and Phase 6 E2E may assert them. Cheap to add three lines to `API_CONTRACT.md` now.

4. **Lift watchlist state to a store now or in Phase 5?** Recommendation: keep it local to `WatchlistPanel` in Phase 3 (only the panel consumes it), lift in Phase 5 when chat responses must push `watchlist` into the panel.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| uv | Backend tests/dev | yes | 0.12.17 | none needed |
| Python 3.12 (uv-managed) | Backend | yes | cpython-3.12 | none needed |
| Node | Frontend tests/build | yes | v26.8.1 (engines `>=24`) | none needed |
| Playwright chromium | Optional E2E | yes | chromium-1243 present | skip E2E, rely on unit tests |
| Built frontend export (`frontend/out`) | E2E webServer (`STATIC_DIR`) | yes (stale until rebuilt) | n/a | `npm --prefix frontend run build` before E2E |
| Docker | Not needed this phase | yes | 29.7.2 | n/a |

No missing dependencies.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Backend framework | pytest 9.1.1 + pytest-asyncio 1.4.0 (`asyncio_mode = "auto"`), config `backend/pyproject.toml` |
| Frontend framework | Vitest 5.0.3 + RTL 16.3.3 + jsdom 30.1.2, config `frontend/vitest.config.ts`, setup `frontend/vitest.setup.ts` (stubs `EventSource` with `FakeEventSource`) |
| E2E | Playwright 1.63.0 on the host, `test/playwright.config.ts` (starts uvicorn with `SIM_SEED=1`, `SIM_EVENT_PROBABILITY=0`, `LLM_MOCK=true`, temp DB) |
| Quick run (backend) | `uv run --directory backend python -m pytest tests/test_trading.py tests/test_tracking.py tests/test_watchlist.py -q` |
| Full backend | `uv run --directory backend python -m pytest -q` (baseline 112 passed) |
| Frontend | `npm --prefix frontend test` (baseline 87 passed, 8 files) |
| Build + E2E | `npm --prefix frontend run build && npm --prefix test run smoke` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PORT-02 | Buy deducts `round(price*qty,2)`, creates position; second buy gives weighted avg_cost; fractional qty works | unit | `uv run --directory backend python -m pytest tests/test_trading.py -k "buy" -q` | Wave 0 |
| PORT-03 | Partial sell keeps avg_cost; full sell deletes the row; `0.1+0.2` then sell `0.3` leaves no row; selling at a loss credits cash at the lower price | unit | `... tests/test_trading.py -k "sell or residue or loss" -q` | Wave 0 |
| PORT-04 | qty `0`, `-1`, `NaN`, `1e-9`; unpriced ticker; insufficient cash; oversell; unheld sell; each leaves cash, positions, `trades`, `portfolio_snapshots` unchanged | unit | `... tests/test_trading.py -k "reject" -q` | Wave 0 |
| PORT-05 | One `trades` row and one new snapshot per fill, snapshot `total_value` equals response total; forced mid-transaction failure rolls everything back; two concurrent buys that only one can afford -> exactly one succeeds | unit | `... tests/test_trading.py -k "atomic or snapshot or concurrent" -q` | Wave 0 |
| PORT-06 / PORT-04 (wire) | `POST /api/portfolio/trade` 200 shape `{trade, portfolio}`; 400 `{"error"}` for NaN, bad side, missing field; `GET /api/portfolio/trade` is 404 | API | `... tests/test_trading.py -k "route" -q` | Wave 0 |
| MKT-08 | Buy of unwatched ticker is tracked and priced in the response; sell-to-zero of an unwatched ticker untracks and evicts cache; failed buy untracks; remove held ticker from watchlist keeps it priced; startup union (exists) | API | `uv run --directory backend python -m pytest tests/test_tracking.py tests/test_db.py -q` | Wave 0 (`test_db.py` exists) |
| WL-02 | `pypl` -> `PYPL` appended, order kept; re-add idempotent 200; `PYPL$` -> 400 `Invalid ticker: PYPL$`; non-ASCII `ß` and `AAPL\n` rejected; unpriced (stub) -> 400 `Unknown ticker`, nothing stored, source untracked | API | `... tests/test_tracking.py -k "add" -q` | Wave 0 |
| WL-03 | Delete returns updated list; unknown -> 404 `Ticker not in watchlist`; lower-case path works; held ticker keeps price | API | `... tests/test_tracking.py -k "remove" -q` | Wave 0 |
| TEST-02 | Aggregate: execution, P&L (portfolio view after price move), oversell, insufficient cash, selling at a loss | suite | `uv run --directory backend python -m pytest tests/test_trading.py -q` | Wave 0 |
| PUI-01 | Parses strict numbers (rejects `1e3`, `10,5`, `0`, empty); buttons disabled in flight (second click does not refetch); server error shown inline; success text; applies response portfolio to the store; Enter does not submit | unit | `npm --prefix frontend test -- TradeBar` | Wave 0 |
| PUI-02 | Rows render fmt values; live SSE price recomputes value, P&L and % (cost basis consistent with server); empty state; distinct testids | unit | `npm --prefix frontend test -- PositionsTable positions` | Wave 0 |
| UI-06 | Add: success appends row from response, error inline verbatim ("Unknown ticker" and "Invalid ticker: ..."), in flight disabled; remove drops row; no skeleton flash | unit | `npm --prefix frontend test -- WatchlistPanel` | extend existing |
| IN-01 guard | Slow GET resolving after a trade response does not overwrite it; Header still refetches on connect | unit | `npm --prefix frontend test -- portfolioStore Header` | Wave 0 / update existing |
| API helper | `send()` extracts `{error}`; non-JSON error body falls back to a fixed message; GET helpers still do not echo bodies | unit | `npm --prefix frontend test -- api` | Wave 0 |
| UI + MKT-08 end to end (recommended) | Buy 1 AAPL: header cash drops, `position-row-AAPL` appears, rejected oversell shows inline error and cash unchanged; add ticker `PYPL` -> row streams a price; remove it | e2e | `npm --prefix frontend run build && npm --prefix test run smoke` | `test/trade.spec.ts` Wave 0 (optional; Phase 6 owns TEST-06) |

### Sampling Rate
- **Per task commit:** the matching quick command (backend test file or `npm --prefix frontend test -- <name>`).
- **Per wave merge:** full backend suite and full frontend suite.
- **Phase gate:** backend + frontend + `npm --prefix frontend run build` + `npm --prefix test run smoke` green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `backend/tests/conftest.py` - `FixedPriceSource` and a `client` fixture; shared `make_db`/position seeding (moved from `test_portfolio.py:11-21`).
- [ ] `backend/tests/test_trading.py`, `backend/tests/test_tracking.py` - new.
- [ ] `frontend/src/lib/portfolioStore.test.ts`, `positions.test.ts`, `api.test.ts`; `components/TradeBar.test.tsx`, `PositionsTable.test.tsx` - new; `WatchlistPanel.test.tsx` and `Header.test.tsx` updated (store reset in `beforeEach`).
- [ ] `test/trade.spec.ts` - optional tracer E2E.
- Framework install: none.

## Security Domain

`security_enforcement` is enabled (absent/true in `.planning/config.json`, ASVS level 1).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Single hardcoded user by design (PROJECT.md out of scope) |
| V3 Session Management | no | No sessions |
| V4 Access Control | no | No multi-user |
| V5 Input Validation | yes | Pydantic strict model (`allow_inf_nan=False`, `Literal` side), `normalize_ticker` (ASCII + `fullmatch`), parameterized SQL; frontend strict numeric parse |
| V6 Cryptography | no | None used |
| V7 Error Handling | yes | Existing envelope: domain errors are `{"error": message}`, anything unexpected is the generic 500 text (no exception text) |
| V11 Business Logic | yes | `BEGIN IMMEDIATE` atomic trades, CHECK constraints as backstop, no negative or non-finite quantities, all-or-nothing |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via ticker | Tampering | Parameterized queries only (existing convention) |
| NaN/Infinity/negative quantity to mint cash or corrupt state | Tampering | `allow_inf_nan=False`, `not quantity > 0`, CHECK constraints |
| Double spend through concurrent requests | Tampering | `BEGIN IMMEDIATE` serializes writers; test with two threads |
| Reflected text in the inline error (`Invalid ticker: <script>`) | XSS | React renders text nodes escaped; never `dangerouslySetInnerHTML` (none exists in `frontend/src`) |
| Unbounded ticker echo in error messages | DoS (low) | Accepted; single-user local app. Optionally truncate the quoted input |
| Arbitrary symbol floods the simulator (`add_ticker` per unique symbol, Cholesky rebuild each) | DoS (low) | Failed/non-held symbols are untracked by `sync_ticker`; watchlist adds are user-driven. Accepted for a local demo |

## Suggested Plan Slicing (for the planner, MVP / tracer-first)

1. **Plan A - Buy/sell backend slice (tracer base):** `DomainError`/`NotFoundError` + handler, `transaction()`, `tracking.normalize_ticker`/`is_wanted`/`sync_ticker`, `trading.execute_trade`/`place_trade` + route, `main.py` include, conftest `FixedPriceSource`, `test_trading.py`. Covers PORT-02..06, TEST-02, the trade half of MKT-08.
2. **Plan B - Trade UI slice:** `portfolioStore`, `Header` moved onto it, `api.send`/`postTrade`, `TradeBar`, `PositionsTable`, `livePosition`, `page.tsx` mounting, tests, optional `test/trade.spec.ts`. Covers PUI-01, PUI-02, IN-01 guard. Depends on A.
3. **Plan C - Watchlist backend slice:** `watchlist.py` POST/DELETE cores and routes using `tracking`, `test_tracking.py`. Covers WL-02, WL-03, the watchlist half of MKT-08. Depends on A (shares `tracking.py`).
4. **Plan D - Watchlist UI slice:** add form, remove buttons, inline errors, tests. Covers UI-06. Depends on C (and shares `api.ts` with B, so run after B or merge the `send` helper into B first).

A and C can be written as one backend wave if the planner prefers fewer plans; B and D touch different components but share `api.ts`.

## Sources

### Primary (HIGH confidence)
- Repo files read this session: `backend/app/{main,db,portfolio,watchlist,errors,config}.py`, `backend/app/market/{cache,interface,factory,models,stream,simulator,massive_client}.py`, `backend/tests/{conftest,test_portfolio,test_watchlist,test_db}.py`, `backend/pyproject.toml`, `frontend/src/{app/page.tsx,app/globals.css,lib/*,components/*}`, `frontend/package.json`, `frontend/vitest.*`, `test/{playwright.config.ts,smoke.spec.ts,package.json}`.
- `planning/API_CONTRACT.md`, `planning/MARKET_INTERFACE.md` (sections 6 and 12), `planning/MASSIVE_API.md:353`, `.planning/{REQUIREMENTS,STATE,ROADMAP}.md`, `.planning/phases/02-live-market-terminal/{02-UI-SPEC,02-REVIEW,02-VERIFICATION,02-VALIDATION}.md`, `.planning/research/{PITFALLS,ARCHITECTURE}.md`.
- Executed this session against the installed stack: sqlite3 `BEGIN IMMEDIATE`/rollback/writer-wait under `autocommit=True`; float rounding cases; ticker regex/unicode behavior; Pydantic default vs `strict`/`allow_inf_nan=False` through the app's error handlers; wrong-method 404 with a new POST route ahead of the catch-all; baseline test suites (112 backend, 87 frontend passing).

### Secondary (MEDIUM confidence)
- `.planning/research/PITFALLS.md` design guidance (written earlier in the project; consistent with the verified behavior above).

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new packages; versions read from manifests.
- Architecture: HIGH - grounded in the existing code and exercised by scratch runs.
- Pitfalls: HIGH for items marked verified; MEDIUM for Massive transient-failure behavior (not exercised; no key).

**Research date:** 2026-10-08
**Valid until:** 2026-11-07 (stable stack; re-check only if FastAPI/Pydantic or Next versions move)
