# Phase 5: AI Trading Copilot - Pattern Map

**Mapped:** 2026-10-09
**Files analyzed:** 22 new/modified
**Analogs found:** 20 / 22
All analog paths below are git-tracked (verified via `git ls-files`).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `backend/app/chat.py` (router + run_turn/execute) | route + service | request-response | `backend/app/trading.py` (route over shared service) + `backend/app/history.py` (router/conn) | role-match |
| `backend/app/chat_store.py` (load_recent, save_turn) | model/db helper | CRUD | `backend/app/history.py` (SQL, ordering, transaction) | role-match |
| `backend/app/llm/schema.py` | model | transform | `backend/app/trading.py` `TradeRequest` (lines 17-23) | role-match |
| `backend/app/llm/prompt.py` | utility | transform | `backend/app/portfolio.py` (`build_portfolio` for context) | partial |
| `backend/app/llm/client.py` (`complete`) | service | request-response | none (RESEARCH Pattern 1) | no analog |
| `backend/app/llm/mock.py` | utility | transform | none (RESEARCH mock rules) | no analog |
| `backend/app/main.py` (modify: `include_router(chat.router)`) | config | n/a | itself, lines 45-49 | exact |
| `backend/app/config.py` (no change; `llm_mock`, `openrouter_api_key` exist) | config | n/a | itself | exact |
| `backend/pyproject.toml` / `uv.lock` (add `litellm==1.104.0`, human gate) | config | n/a | existing pins | exact |
| `backend/tests/test_chat.py` | test | request-response | `backend/tests/test_watchlist.py` (TestClient) + `test_trading.py` | exact |
| `backend/tests/test_llm_schema.py`, `test_llm_prompt.py`, `test_llm_client.py`, `test_llm_mock.py` | test | transform | `backend/tests/test_trading.py` (fixtures, plain funcs) | role-match |
| `planning/API_CONTRACT.md` (modify per D-13) | doc | n/a | existing sections of itself | exact |
| `frontend/src/lib/types.ts` (add ChatAction/ChatMessage/ChatReply) | model | n/a | existing types in same file | exact |
| `frontend/src/lib/api.ts` (add `postChat`, `getChatHistory`) | service | request-response | `api.ts` `postTrade` / `getPortfolioHistory` | exact |
| `frontend/src/lib/chatStore.ts` (+ test) | store | event-driven | `frontend/src/lib/portfolioStore.ts` (+ `portfolioStore.test.ts`) | exact |
| `frontend/src/lib/watchlistStore.ts` (+ test) | store | pub-sub | `frontend/src/lib/selectionStore.ts` | exact |
| `frontend/src/components/WatchlistPanel.tsx` (modify: effect on pushed list) | component | pub-sub | itself, lines 25-52 | exact |
| `frontend/src/components/ChatPanel.tsx` (+ test) | component | request-response | `TradeBar.tsx` / `TradeBar.test.tsx` | role-match |
| `ChatMessageRow.tsx`, `ChatActionLine.tsx` | component | transform | `PositionRow.tsx`, `FormMessage.tsx` | role-match |
| `ChatToggle` (in `Header.tsx`, modify) | component | event-driven | `Header.tsx` | exact |
| `frontend/src/app/page.tsx` (modify: third column) | component | n/a | itself, line 19 | exact |

## Pattern Assignments

### `backend/app/chat.py` (route + orchestration)

**Analog:** `backend/app/trading.py` (shared-service + thin route) and `backend/app/history.py`.

**Imports/route shape** (`trading.py` 1-23, 128-131 of the shown excerpt):
```python
import asyncio
from fastapi import APIRouter, Request
from pydantic import BaseModel, Field
from .db import USER_ID, connect, now_iso, transaction
from .errors import DomainError
router = APIRouter()

class TradeRequest(BaseModel):
    ticker: str
    quantity: float = Field(strict=True, allow_inf_nan=False)
    side: Literal["buy", "sell"]

@router.post("/api/portfolio/trade")
async def trade(body: TradeRequest, request: Request) -> dict:
    return await place_trade(request.app.state, body.ticker, body.side, body.quantity)
```
Copy: `ChatRequest(BaseModel): message: str`; route `async def post_chat(body, request)` calls `run_turn(request.app.state, body.message)`. Over-2000-char -> `raise DomainError("Message is too long")`; empty -> `DomainError("Message must not be empty")` (400 via `errors.py` handler).

**Executing actions (reuse, do not re-validate):**
- `place_trade(state, raw_ticker, side, quantity) -> {"trade": {...}, "portfolio": ...}` (`trading.py` ~107)
- `add_to_watchlist(state, raw_ticker)`, `remove_from_watchlist(state, raw_ticker)` (`watchlist.py` 68, 100); `NotFoundError` subclasses `DomainError` (`errors.py` 14-22), so one `except DomainError` per action.
- Post-action payloads: `read_watchlist(state)` (`watchlist.py` 52, opens its own connection) and `build_portfolio(conn, state.cache)` inside `with connect(state.settings.db_path) as conn`.

**Sync DB off the loop** (`trading.py`): `return await asyncio.to_thread(run_trade, state, ticker, side, quantity)`. Use `asyncio.to_thread` for `read_context` and `finish_turn`; never hold a connection across `await complete(...)`.

**GET history route** (copy `history.py` 51-60):
```python
@router.get("/api/portfolio/history")
def get_history(request: Request) -> dict:
    with connect(request.app.state.settings.db_path) as conn:
        rows = conn.execute("... ORDER BY recorded_at DESC, rowid DESC LIMIT ?", (USER_ID, MAX_POINTS)).fetchall()
    return {"history": [dict(r) for r in reversed(rows)]}
```
Chat: sync `def`, `LIMIT 100`, return `{"messages": [...]}`.

**Error handling:** only one broad `except Exception` around `complete()` + `ChatReply.model_validate_json()` with `logger.warning(..., exc_info=True)`; `execute()` stays outside (RESEARCH Pattern 2/Pitfall 6). `LLMUnavailable` -> "not configured" text. Cap: 10 trades / 10 watchlist changes; extras become `ok: false` "Too many actions in one reply" actions (D-07/D-08). Trades first, then watchlist (D-09).

### `backend/app/chat_store.py` (CRUD)

**Analog:** `backend/app/history.py` (ordering, `transaction`, `USER_ID`).
```python
from .db import USER_ID, now_iso, transaction   # transaction = BEGIN IMMEDIATE / COMMIT / ROLLBACK (db.py 75-83)
...
"ORDER BY created_at DESC, rowid DESC LIMIT ?"   # history.py 22-23, 47-48
```
Copy `save_turn` / `load_recent` from RESEARCH "Code Examples" (user row first with `asked_at`; user `actions` NULL, assistant `json.dumps(actions)`). Table already exists (`db.py` 47-54): no migration. Insert id via `str(uuid.uuid4())` as in `history.py` 29-33.

### `backend/app/llm/schema.py`

**Analog:** `TradeRequest` in `trading.py` (Pydantic + `allow_inf_nan=False`). Use RESEARCH Pattern 4 verbatim (`extra="forbid"`, `Literal`, `Field(allow_inf_nan=False)`, list defaults `[]`; no `gt`/`pattern`/`Optional`).

### `backend/app/llm/prompt.py`

**Analog:** `build_portfolio` output shape (`portfolio.py` 12) feeds context. Pre-compute per-position `quantity`, `weight_percent` and `cash_percent` (D-03). History: last 20 rows, append `[Executed: ...]` / `[Failed: ...]` suffixes to assistant content at build time only (D-04). Use `qty_text` from `trading.py` for quantity text.

### `backend/app/llm/client.py` and `mock.py`

No analog. Use RESEARCH Pattern 1 with D-05/D-06 changes: PROVIDER = `{"order": ["cerebras"], "allow_fallbacks": False, "require_parameters": True}`, `timeout=30`, `num_retries=0`, `max_tokens=2000`, `reasoning_effort="low"`, `response_format=ChatReply`, lazy `import litellm`, own missing-key check (never `api_key=""`). Settings already provide `settings.llm_mock` and `settings.openrouter_api_key` (`config.py` 16-24). Mock replaces only `complete()`; precedence per D-10/D-11: `malformed` > `broke` > `add|remove TICKER` > `buy` > `sell` > plain; `malformed` returns `"not json"`.

### `backend/app/main.py` (modify)

Add `chat` to `from . import history, portfolio, trading, watchlist` and `app.include_router(chat.router)` after line `app.include_router(history.router)`, before the `/api/{path:path}` catch-all and static mount.

### `backend/tests/test_chat.py` and `test_llm_*.py`

**Analog:** `tests/test_watchlist.py` (lines 1-18) and `tests/conftest.py`.
```python
from fastapi.testclient import TestClient
from app.main import create_app
def test_...(settings):
    with TestClient(create_app(settings)) as client:
        r = client.get("/api/watchlist")
```
`settings` fixture (`conftest.py` 35-40) is a frozen dataclass; for mock mode use `dataclasses.replace(settings, llm_mock=True)`. Run: `uv run python -m pytest`. Unit-level fixtures (`db`, `cache`) from `test_trading.py` 10-30 (`init_db(tmp_path/...)`, `PriceCache().update("AAPL", 100.0)`). No real network: patch `app.llm.client.complete` or use `llm_mock`; for the real branch use LiteLLM `mock_response=`/monkeypatch the `acompletion` seam. Cover: valid parse, malformed -> graceful error with no actions, missing key text, cap overflow, insufficient-cash failure action, persistence ordering, history `actions: null` for user rows, response always carries `portfolio` + `watchlist`.

### `frontend/src/lib/chatStore.ts`

**Analog:** `portfolioStore.ts` (zustand `create<State & Actions>()`, `initialXState()`, `resetXStore()` for `beforeEach`).
```ts
export const usePortfolioStore = create<PortfolioState & Actions>()((set) => ({ ...initialPortfolioState(), ... }));
export function resetPortfolioStore() { usePortfolioStore.setState(initialPortfolioState()); }
```
On successful `postChat`: `usePortfolioStore.getState().applyTrade(reply.portfolio)` then `useWatchlistStore.getState().publish(reply.watchlist)`. `applyTrade` takes a fresh ticket so stale GETs cannot overwrite (`portfolioStore.ts` 33-36); P&L chart refetches on `portfolio` change automatically.

### `frontend/src/lib/watchlistStore.ts`

**Analog:** `selectionStore.ts` (small store + initial/reset fns). Shape: `{ pushed: WatchlistItem[] | null, seq: number, publish(items) }`, with `resetWatchlistStore()`.

### `frontend/src/components/WatchlistPanel.tsx` (modify)

Existing local state and sync effect (lines 25-52):
```tsx
const [view, setView] = useState<View>({ kind: "loading" });
useEffect(() => { useSelectionStore.getState().sync(view.kind, view.kind === "ready" ? view.items.map(i => i.ticker) : []); }, [view]);
```
Add `const seq = useWatchlistStore(s => s.seq)` and `useEffect(() => { const p = useWatchlistStore.getState().pushed; if (p) setView({ kind: "ready", items: p }); }, [seq]);` (skip when seq is the initial value). Existing `[view]` effect keeps selection valid.

### `frontend/src/lib/api.ts` (modify)

Reuse `send<T>` (lines 27-39) and the GET style of `getPortfolioHistory` (lines 19-24). Add `postChat(message) => send<ChatReply>("POST", "/api/chat", { message })` as `postTrade` does (lines 55-61), and `getChatHistory()` copying `getPortfolioHistory`'s `!res.ok` throw + `{messages}` unwrap.

### `ChatPanel.tsx` + tests

**Analog:** `TradeBar.tsx` / `TradeBar.test.tsx`: busy flag, `FormMessage` for errors, `data-testid` per element, `focus-visible:outline-*` class constants (as in `WatchlistPanel.tsx` 11-18). Test pattern (`TradeBar.test.tsx` 1-40): `vi.stubGlobal("fetch", vi.fn(async () => response))`, `ok/failure` response helpers, `beforeEach(() => resetXStore())`, `fireEvent.change` then click, assert `JSON.parse(fn.mock.calls[0][1]?.body)`. Auto-scroll via `ref.scrollTop = ref.scrollHeight` (jsdom lacks `scrollIntoView`). Default open/closed state set in an effect, not from `window` in initial state. Render message text as plain nodes (`whitespace-pre-wrap`). Testids and copy: `05-UI-SPEC.md`.

### `Header.tsx` (modify: Chat toggle) and `page.tsx` (modify)

`Header.tsx` is a client component reading stores; add toggle button with existing token classes. `page.tsx` line 19: `lg:grid-cols-[480px_1fr]` becomes a third column only at >= 1536 px (`2xl:`), overlay drawer below (Pitfall 12).

## Shared Patterns

### Error envelope
**Source:** `backend/app/errors.py` (`DomainError` 400 -> `{"error": msg}`). **Apply to:** `chat.py` request validation (empty, too long). LLM failures are NOT HTTP errors: return 200 with an assistant error message and `actions: []`.

### Shared services, no re-validation
**Source:** `place_trade`, `add_to_watchlist`, `remove_from_watchlist` (hold `state.tracking_lock`). **Apply to:** every chat action.

### Connection / transaction
**Source:** `db.py` `connect`, `transaction` (75-83), `now_iso()` 1 s resolution (`db.py` 58-60). **Apply to:** `chat_store.py`. Order by `created_at DESC, rowid DESC`; take `asked_at` before the LLM call.

### Settings access
`request.app.state.settings` / `state.cache` / `state.tracking_lock` (set in `main.py` lifespan, lines 28-35); `Settings` fields `llm_mock`, `openrouter_api_key`.

### Style
Short modules/functions, one-line docstrings, no emojis, uv-only (`uv run python -m pytest`), lazy `litellm` import, `UV_SYSTEM_CERTS=1 uv add "litellm==1.104.0"` behind a `checkpoint:human-verify`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `backend/app/llm/client.py` | service | request-response | No external-API client exists yet in the app (`market/massive_client.py` is a poller, a weak partial analog for lazy third-party use); use RESEARCH Pattern 1 and `.claude/skills/cerebras/SKILL.md` |
| `backend/app/llm/mock.py` | utility | transform | No mock seam exists; use D-10/D-11 and RESEARCH mock rules |

## Metadata

**Analog search scope:** `backend/app`, `backend/tests`, `frontend/src/{lib,components,app}`
**Files read:** history.py, main.py, errors.py, config.py, trading.py, watchlist.py, conftest.py, test_trading.py, test_watchlist.py, portfolioStore.ts, selectionStore.ts, api.ts, page.tsx, Header.tsx, WatchlistPanel.tsx, TradeBar.test.tsx
**Not read:** RESEARCH.md lines 532-705 (validation architecture, UI inputs) and 05-UI-SPEC.md; planner should consult them for testids/copy.
**Pattern extraction date:** 2026-10-09
