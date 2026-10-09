# FinAlly API and SSE Contract

This is the single reference for the backend and the frontend. The wire format of every
endpoint is defined here, and changes happen only by editing this file.

## Conventions

- Every request and response body is UTF-8 JSON (the SSE stream is UTF-8 text frames carrying JSON).
- Success is always `200`, never `201`.
- Every error body is `{"error": "..."}`, where the value is a human-readable message string.
- Rounding: prices and money amounts to 2 dp, quantities to 6 dp, `change`, `change_percent` and
  `pnl_percent` to 4 dp.
- SSE `timestamp` is epoch seconds as a float. REST timestamps (`recorded_at`, `executed_at`,
  `created_at`) are ISO-8601 UTC strings.
- Ticker identity is the upper-cased ASCII symbol matching `[A-Z][A-Z.]{0,9}`. Input is
  upper-cased before the format check; anything that fails the check is rejected.
- Status codes:
  - `200` success.
  - `400` validation or domain failure, including FastAPI body validation errors (remapped
    from `422` so clients see one error shape).
  - `404` unknown watchlist ticker on `DELETE`, or any unknown `/api/*` path with any method. A
    wrong method on a known `/api/*` path (for example `PUT /api/watchlist`) is also
    `404 {"error": "Not found"}`; the API never answers `405`.
  - `500` `{"error": "Internal server error"}`. The message is always this generic string;
    exception text is never returned to the client.
- A chat LLM failure is not an HTTP error (see `POST /api/chat`).

## Shared shapes

### PriceUpdate

One ticker's latest price. It is the value type of the SSE payload.

| Field | Type | Meaning |
|-------|------|---------|
| `ticker` | string | Upper-cased symbol |
| `price` | number | Latest price |
| `previous_price` | number | The price at the previous tick |
| `timestamp` | number | Epoch seconds (float) of this price |
| `change` | number | `price - previous_price`, tick-over-tick |
| `change_percent` | number | `round((price / session_start_price - 1) * 100, 4)` |
| `direction` | `"up"`, `"down"` or `"flat"` | `price` versus `previous_price` (the previous tick) |
| `session_start_price` | number | The first price cached for that ticker since the process started, for the simulator and Massive alike |

`change` and `change_percent` measure different things. `change` and `direction` are
tick-over-tick and drive the green/red price flash. `change_percent` is the change since the
session start (`session_start_price`), not since the previous tick and not a daily change.

## GET /api/stream/prices

Wire format only; the implementation belongs to Phase 2.

- Content type `text/event-stream`, with an initial `retry: 1000` line so a browser
  reconnects after 1 s.
- Each frame is `data: ` followed by one JSON object, with no `event:` name.
- One frame is sent per price-cache version change, not on a fixed cadence.
- The payload is an object keyed by ticker over all tracked tickers (watchlist plus open
  positions). Each value is a PriceUpdate:

```
retry: 1000

data: {"AAPL": {"ticker": "AAPL", "price": 190.12, "previous_price": 190.1, "timestamp": 1759507199.12, "change": 0.02, "change_percent": 0.0632, "direction": "up", "session_start_price": 190.0}, "GOOGL": {...}}
```

- A `: ping` comment is sent about every 15 s to keep the connection alive.
- Every frame carries the full tracked set, so a reconnecting client needs no replay.
- Clients must not derive the watchlist from the payload keys: a held ticker that was removed
  from the watchlist keeps streaming. Use `GET /api/watchlist` for the watchlist.

## Endpoints

| Method and path | Request body | Success (200) | Errors |
|-----------------|--------------|---------------|--------|
| `GET /api/health` | none | `{"status": "ok"}` | none |
| `GET /api/stream/prices` | none | SSE stream (above) | none |
| `GET /api/watchlist` | none | `{"watchlist": [WatchlistItem]}` | none |
| `POST /api/watchlist` | `{"ticker"}` | `{"watchlist": [WatchlistItem]}` | 400 |
| `DELETE /api/watchlist/{ticker}` | none | `{"watchlist": [WatchlistItem]}` | 404 |
| `GET /api/portfolio` | none | Portfolio | none |
| `POST /api/portfolio/trade` | `{"ticker", "quantity", "side"}` | `{"trade": Trade, "portfolio": Portfolio}` | 400 |
| `GET /api/portfolio/history` | none | `{"history": [...]}` | none |
| `POST /api/chat` | `{"message"}` | `{"message", "actions", "portfolio", "watchlist"}` | 400 |
| `GET /api/chat/history` | none | `{"messages": [...]}` | none |

Any unknown `/api/*` path, with any method, is `404 {"error": "Not found"}`, as is a known path
called with a method it does not support. Any unexpected
failure is `500 {"error": "Internal server error"}`.

### GET /api/health

`200 {"status": "ok"}`. Extra keys may be added later. The port does not open until startup
has completed, so a reachable health endpoint means the app is ready.

### GET /api/watchlist

`200 {"watchlist": [WatchlistItem]}`. A WatchlistItem has the PriceUpdate keys, and every
non-ticker field is `null` until the ticker has its first price.

### POST /api/watchlist

Body `{"ticker": "PYPL"}`. `200 {"watchlist": [WatchlistItem]}` with the updated list.

- Re-adding a ticker already on the watchlist is an idempotent 200 (no error, no duplicate).
- `400 {"error": "Invalid ticker: PYPL$"}` when the input fails the ticker format check; the
  message quotes the rejected input.
- `400 {"error": "Unknown ticker"}` when the ticker is well formed but no price appears for it
  (Massive rejects symbols that do not exist; the simulator accepts any well-formed symbol).

### DELETE /api/watchlist/{ticker}

`200 {"watchlist": [WatchlistItem]}` with the updated list. A held ticker (open position) keeps
streaming after it leaves the watchlist. `404 {"error": "Ticker not in watchlist"}` when the
ticker is not on the watchlist.

### GET /api/portfolio

`200` Portfolio (see shared shapes).

### POST /api/portfolio/trade

Body `{"ticker": "AAPL", "quantity": 1.5, "side": "buy"}`. `side` is `"buy"` or `"sell"`;
`quantity` must be greater than 0 (fractional shares are allowed).

`200 {"trade": Trade, "portfolio": Portfolio}`. Otherwise `400 {"error": "..."}`. The checks run
in this order, with these exact messages:

1. Ticker format: `{"error": "Invalid ticker: AAPL$"}` (quotes the rejected input).
2. `{"error": "Quantity must be greater than 0"}` (the quantity is rounded to 6 dp first).
3. A sell of more than is held: `{"error": "Insufficient shares: you hold 1.5 AAPL"}` (held
   quantity to 6 dp, trailing zeros dropped; a never-held ticker says `you hold 0 AAPL`).
4. `{"error": "No price available for AAPL"}`.
5. An order worth less than a cent (`round(price x quantity, 2)` is 0), so no shares change
   hands for free: `{"error": "Order value is too small"}`. The one exception is a sell of the
   whole position, which always fills (even for $0.00) so a dust position can be closed.
6. A buy that costs more than the cash balance: `{"error": "Insufficient cash"}`.

A bad `side`, or a quantity that is non-finite, a string or a boolean, is a body validation 400
(`{"error": "side: Input should be 'buy' or 'sell'"}`,
`{"error": "quantity: Input should be a finite number"}`).

A fill moves cash by `round(price x quantity, 2)` at the current cached price, appends one trade
and records one portfolio snapshot; a sell down to zero removes the position. A trade is
all-or-nothing: a rejected trade changes nothing (no cash movement, no position change, no
trade row, no snapshot). A buy starts streaming the ticker before reading its price, and a
ticker that is afterwards neither watched nor held stops streaming.

### GET /api/portfolio/history

`200 {"history": [{"total_value": 10000.0, "recorded_at": "2026-10-07T12:00:00Z"}]}`, ascending by
`recorded_at`, at most the 2000 most recent entries. Before reading, the server records one
snapshot only when at least 10 seconds (`MIN_INTERVAL_SECONDS`) have passed since the latest
snapshot and the current total value differs from it, so a never-traded portfolio keeps exactly
one history point; every trade still records its own snapshot.

### POST /api/chat

Body `{"message": "..."}`.
`200 {"message": str, "actions": [Action], "portfolio": Portfolio, "watchlist": [WatchlistItem]}`.

- `400 {"error": "..."}` only for an empty message.
- An LLM failure (timeout, malformed output, missing key) is not an HTTP error: the response is
  `200` with an assistant error message in `message` and `"actions": []`.
- The last 20 stored messages are sent to the LLM as conversation history.

### GET /api/chat/history

`200 {"messages": [{"id", "role", "content", "actions", "created_at"}]}`, oldest first, the most
recent 100. `role` is `"user"` or `"assistant"`. `actions` is `null` for user messages.

## More shared shapes

### WatchlistItem

The PriceUpdate keys. Every field other than `ticker` is `null` until the first price arrives.

### Portfolio

| Field | Meaning |
|-------|---------|
| `cash` | Cash balance |
| `total_value` | Cash plus the market value of all positions |
| `unrealized_pnl` | Sum of the positions' `unrealized_pnl` |
| `positions` | List of position objects, below |

Position object: `{ticker, quantity, avg_cost, current_price, market_value, unrealized_pnl,
pnl_percent}`. `pnl_percent` is measured against `avg_cost` and is distinct from the SSE
`change_percent`, which is measured against `session_start_price`.

### Trade

`{id, ticker, side, quantity, price, executed_at}`.

### Action

The server-authoritative outcome of one action the LLM requested, listed in `POST /api/chat`.
Two variants:

- Trade: `{"type": "trade", "ticker", "side", "quantity", "price": number or null, "ok": bool, "error": string or null}`
- Watchlist: `{"type": "watchlist", "ticker", "action": "add" or "remove", "ok": bool, "error": string or null}`

A failed action carries `ok: false` and the reason in `error`; `price` is `null` when no fill
happened.

### LLM structured output

The model is instructed to answer with JSON of this shape:

```json
{
  "message": "Your conversational response to the user",
  "trades": [{"ticker": "AAPL", "side": "buy", "quantity": 10}],
  "watchlist_changes": [{"ticker": "PYPL", "action": "add"}]
}
```

`message` is required; `trades` and `watchlist_changes` are optional. Each trade goes through the
same validation as a manual trade.

## Mock LLM (LLM_MOCK=true)

Deterministic keyword rules, frozen now because the E2E suite depends on them. A message is
matched case-insensitively.

| Message contains | Mock response |
|------------------|---------------|
| "buy" | Buy 1 AAPL |
| "sell" | Sell 1 AAPL |
| "add TICKER" or "remove TICKER" | That watchlist change |
| "broke" | An unaffordable buy (failure path) |
| "malformed" | Non-JSON model output (error path) |
| anything else | Message only, no actions |

## Empty and null cases

- An empty watchlist is `{"watchlist": []}`.
- No positions is `"positions": []` in Portfolio.
- An unpriced ticker has `null` in every non-ticker price field of its WatchlistItem.
- Empty history is `{"history": []}`; empty chat history is `{"messages": []}`.
- An empty chat message is a `400`.
- Every SSE frame carries the full tracked set, so a reconnecting client needs no replay.
