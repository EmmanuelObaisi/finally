# FinAlly Team Contract

Binding agreements for the agent team. Resolves PLAN.md section 13. If something here
must change, the owner edits this file and messages every affected teammate.

## 1. Ownership (only the owner edits these paths)

| Role | Name | Owns |
|---|---|---|
| Backend API engineer | `backend-api` | `backend/pyproject.toml`, `backend/uv.lock`, `backend/app/main.py`, `backend/app/deps.py`, `backend/app/market/**`, `backend/app/portfolio/**`, `backend/app/routes/**`, matching tests |
| Database engineer | `database` | `backend/app/db/**`, `backend/tests/db/**` |
| LLM engineer | `llm` | `backend/app/llm/**`, `backend/tests/llm/**` |
| Frontend engineer | `frontend` | `frontend/**` |
| Integration tester | `integration-tester` | `test/**` |
| DevOps engineer | `devops` | `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `scripts/**`, `.env.example`, `db/.gitkeep`, `.gitignore` |

Only `backend-api` runs `uv add`. Others message it for dependencies.
Nobody commits to git; the lead does that.

## 2. Environment

- Python commands: `uv run ...` from `backend/`. Tests: `uv run python -m pytest` (App Control
  blocks the `pytest` shim on this machine). Dev deps: `uv sync --extra dev`.
- TLS is intercepted on this machine. Set `UV_SYSTEM_CERTS=1` for uv and `NODE_USE_SYSTEM_CA=1`
  for Node/npm if you see unknown-issuer errors. Never disable verification.
- `.env` lives at the project root. `app/main.py` calls `load_dotenv()` on the root `.env`
  (no override), so local dev and `docker --env-file` both work.
- `DB_PATH` env var; default `<project root>/db/finally.db`. Docker sets `DB_PATH=/app/db/finally.db`.
- `STATIC_DIR` env var; default `backend/static`. Docker copies the Next.js `out/` there.

## 3. Market data

Rebuild `backend/app/market/` from `planning/MARKET_INTERFACE.md` and `planning/MARKET_SIMULATOR.md`
(the code is in those docs). Key rules:
- Tracked tickers = watchlist ∪ open positions (MARKET_INTERFACE.md section 6).
- `day_change_percent` = change vs `reference_price` (seed price for the simulator).
- SSE: `GET /api/stream/prices`, one `data:` event per cache change, payload
  `{"AAPL": {"ticker","price","previous_price","timestamp","change","direction","day_change_percent"}, ...}`.
- New ticker validation per MARKET_INTERFACE.md section 12.

## 4. Database (`backend/app/db/`, stdlib `sqlite3`, synchronous)

Schema (natural keys, user_id everywhere, default `"default"`):

```sql
users_profile(user_id TEXT PRIMARY KEY, cash_balance REAL NOT NULL, created_at TEXT NOT NULL)
watchlist(user_id TEXT NOT NULL, ticker TEXT NOT NULL, added_at TEXT NOT NULL, PRIMARY KEY(user_id, ticker))
positions(user_id TEXT NOT NULL, ticker TEXT NOT NULL, quantity REAL NOT NULL, avg_cost REAL NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(user_id, ticker))
trades(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, ticker TEXT NOT NULL, side TEXT NOT NULL, quantity REAL NOT NULL, price REAL NOT NULL, executed_at TEXT NOT NULL)
portfolio_snapshots(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, total_value REAL NOT NULL, recorded_at TEXT NOT NULL)
chat_messages(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, actions TEXT, created_at TEXT NOT NULL)
```

Seed: `default` user with 10000.0 cash; watchlist AAPL GOOGL MSFT AMZN TSLA NVDA META JPM V NFLX.
Timestamps: ISO 8601 UTC strings. IDs: `uuid4` strings.

Public API (`from app.db import ...`). All take `user_id: str = "default"` as the last arg.

```python
init_db() -> None                                  # idempotent: create tables, seed if empty
transaction() -> ContextManager[sqlite3.Connection]  # one atomic unit; functions below accept conn=None
get_cash(conn=None) -> float
set_cash(amount, conn=None) -> None
get_watchlist() -> list[str]                       # ordered by added_at
add_watchlist(ticker) -> bool                      # False if already present
remove_watchlist(ticker) -> bool                   # False if absent
get_positions() -> list[dict]                      # {ticker, quantity, avg_cost, updated_at}
get_position(ticker, conn=None) -> dict | None
upsert_position(ticker, quantity, avg_cost, conn=None) -> None
delete_position(ticker, conn=None) -> None
insert_trade(ticker, side, quantity, price, conn=None) -> dict   # returns the row
insert_snapshot(total_value) -> None
get_snapshots(limit=1000) -> list[dict]            # {total_value, recorded_at}, oldest first
insert_chat_message(role, content, actions=None) -> None   # actions: dict, stored as JSON
get_chat_messages(limit=20) -> list[dict]          # {role, content, actions, created_at}, oldest first
```

## 5. Services (`backend/app/portfolio/service.py`, owned by backend-api)

Singletons `price_cache` and `market_source` live in `app/deps.py`. The LLM engineer calls:

```python
class TradeError(ValueError): ...
class WatchlistError(ValueError): ...
async def execute_trade(ticker: str, side: str, quantity: float) -> dict   # returns trade dict; raises TradeError
async def add_to_watchlist(ticker: str) -> None                           # raises WatchlistError
async def remove_from_watchlist(ticker: str) -> None                      # raises WatchlistError
def get_portfolio() -> dict                                               # shape of GET /api/portfolio
def get_watchlist_with_prices() -> list[dict]                             # shape of GET /api/watchlist
```

Trade rules: ticker upper-cased; quantity must be > 0 (fractional ok); side `buy|sell`;
buy of an untracked ticker calls `add_ticker` first; no price -> TradeError "Unknown ticker";
buy needs cash >= qty*price; sell needs held qty >= qty (1e-9 tolerance); position row deleted
when quantity reaches 0; buying does NOT add to the watchlist. Snapshot recorded after every
trade and every 30 s by a background task.

## 6. REST API (errors: FastAPI default `{"detail": "..."}`)

| Endpoint | Success | Errors |
|---|---|---|
| `GET /api/health` | `{"status": "ok"}` | |
| `GET /api/portfolio` | `Portfolio` | |
| `POST /api/portfolio/trade` `{ticker, quantity, side}` | `{"trade": Trade, "portfolio": Portfolio}` | 400 validation |
| `GET /api/portfolio/history` | `[{"total_value", "recorded_at"}]` (last 1000) | |
| `GET /api/watchlist` | `[WatchItem]` | |
| `POST /api/watchlist` `{ticker}` | `[WatchItem]` (full list; already present is a no-op) | 400 invalid/unknown |
| `DELETE /api/watchlist/{ticker}` | `[WatchItem]` | 404 not on watchlist |
| `POST /api/chat` `{message}` | `ChatResponse` | 502 LLM failure |

```
Portfolio = {cash_balance, total_value, positions_value, unrealized_pnl,
             positions: [{ticker, quantity, avg_cost, current_price, market_value, unrealized_pnl, pnl_percent}]}
Trade     = {ticker, side, quantity, price, executed_at}
WatchItem = {ticker, price, previous_price, change, direction, day_change_percent}   # price fields null if no price yet
ChatResponse = {message,
                actions: {trades: [{ticker, side, quantity, status: "ok"|"error", price?, error?}],
                          watchlist_changes: [{ticker, action: "add"|"remove", status, error?}]},
                portfolio: Portfolio}
```

## 7. LLM (`backend/app/llm/`)

- Use the `cerebras-inference` skill (`.claude/skills/cerebras/SKILL.md`): LiteLLM,
  `openrouter/openai/gpt-oss-120b`, Cerebras provider, Pydantic structured output.
- Exposes `create_chat_router() -> APIRouter` with `POST /api/chat`; backend-api includes it in main.py.
- Context: portfolio, watchlist with prices, last 20 chat messages.
- Failure (exception, malformed JSON, missing key): 502 `{"detail": ...}`; user message still stored.
- Each requested action runs through the services in section 5; per-action errors go in `actions`.
- `LLM_MOCK=true` responses (case-insensitive substring match on the user message, first match wins):

| Message contains | Response message | Actions |
|---|---|---|
| `buy` | `Mock: buying 1 AAPL.` | trade buy 1 AAPL |
| `sell` | `Mock: selling 1 AAPL.` | trade sell 1 AAPL |
| `add` | `Mock: adding PYPL to your watchlist.` | watchlist add PYPL |
| `remove` | `Mock: removing PYPL from your watchlist.` | watchlist remove PYPL |
| anything else | `Mock: I am FinAlly, your AI trading assistant.` | none |

## 8. Frontend

- Next.js + TypeScript + Tailwind, `output: 'export'`, same-origin `/api/*` calls.
- Lightweight Charts for sparklines, main chart and P&L chart; treemap is custom.
- Required `data-testid`s (Playwright depends on them):
  `cash-balance`, `total-value`, `connection-status` (attribute `data-status="connected|reconnecting|disconnected"`),
  `watchlist-row-{TICKER}`, `watchlist-price-{TICKER}`, `watchlist-add-input`, `watchlist-add-button`,
  `watchlist-remove-{TICKER}`, `main-chart`, `trade-ticker`, `trade-quantity`, `trade-buy`, `trade-sell`,
  `trade-error`, `positions-table`, `position-row-{TICKER}`, `heatmap`, `pnl-chart`,
  `chat-input`, `chat-send`, `chat-message` (each message; attribute `data-role`), `chat-loading`, `chat-action`.

## 9. E2E tests

Playwright runs on the host against a running app (`BASE_URL`, default `http://localhost:8000`),
started with `LLM_MOCK=true` (PLAN.md 13.23). No Playwright container.

## 10. Docker

Node 24 LTS build stage, Python 3.12 slim runtime, uv, port 8000, volume `finally-data:/app/db`,
`--env-file .env`. Four scripts in `scripts/` as thin idempotent wrappers.
