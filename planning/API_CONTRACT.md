# FinAlly API and SSE Contract

This is the single reference for the backend and the frontend. The wire format of every
endpoint is defined here, and changes happen only by editing this file.

## Conventions

- Every request and response body is UTF-8 JSON (the SSE stream is UTF-8 text frames carrying JSON).
- Success is always `200`, never `201`.
- Every error body is `{"error": "..."}`, where the value is a human-readable message string.
- Rounding: prices to 2 dp, quantities to 6 dp, `change` and `change_percent` to 4 dp.
- SSE `timestamp` is epoch seconds as a float. REST timestamps (`recorded_at`, `executed_at`,
  `created_at`) are ISO-8601 UTC strings.
- Ticker identity is the upper-cased ASCII symbol matching `[A-Z][A-Z.]{0,9}`. Input is
  upper-cased before the format check; anything that fails the check is rejected.
- Status codes:
  - `200` success.
  - `400` validation or domain failure, including FastAPI body validation errors (remapped
    from `422` so clients see one error shape).
  - `404` unknown watchlist ticker on `DELETE`, or any unknown `/api/*` path with any method.
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
