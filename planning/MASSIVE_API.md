# Massive API Reference (formerly Polygon.io)

Reference for the market data endpoints FinAlly uses to get current and end-of-day
stock prices for several tickers at once. Researched October 2026 against the live
docs at https://massive.com/docs and the official `massive` Python client (v2.8.0).

## 1. Background

- Polygon.io rebranded as **Massive.com** on 30 October 2025. Existing API keys keep working.
- REST base URL: `https://api.massive.com` (`https://api.polygon.io` still works for now).
- Official Python client: package `massive` on PyPI (formerly `polygon-api-client`),
  Python >= 3.9, import `from massive import RESTClient`.
- The client is **synchronous** (built on `urllib3`). In FastAPI, call it through
  `asyncio.to_thread(...)` so it does not block the event loop.

## 2. Authentication

Pass the key in one of two ways:

| Method | Example |
|---|---|
| Header (preferred, what the client does) | `Authorization: Bearer <MASSIVE_API_KEY>` |
| Query string | `?apiKey=<MASSIVE_API_KEY>` |

`RESTClient()` with no arguments reads the `MASSIVE_API_KEY` environment variable,
which is the same name FinAlly uses. It raises `massive.exceptions.AuthError` if no
key is available.

## 3. Plans and what they allow

The plan decides which endpoint FinAlly can use. Stocks plans (individual, Oct 2026):

| Plan | Price | Rate limit | Data recency | Snapshots | Last trade |
|---|---|---|---|---|---|
| Basic | Free | **5 calls/min** | End of day | **No** | No |
| Starter | $29/mo | Unlimited (stay < 100 req/s) | 15-min delayed | Yes | No |
| Developer | $79/mo | Unlimited | 15-min delayed | Yes | Yes |
| Advanced | $199/mo | Unlimited | Real-time | Yes | Yes |

The key consequence for FinAlly:

- **Paid plans**: one Snapshot call returns current prices for all watched tickers.
- **Free plan**: Snapshot returns `403 NOT_AUTHORIZED`. The best available data is
  the previous trading day's close, and one Grouped Daily call returns it for every
  US stock. Prices are therefore static during the day.

Calling an endpoint outside your plan returns:

```json
{"status": "NOT_AUTHORIZED", "request_id": "...", "message": "You are not entitled to this data. Please upgrade your plan at https://massive.com/pricing"}
```

The client raises this as `massive.exceptions.BadResponse` with the JSON body as the
message. Exceeding 5 calls/min on the free plan returns HTTP 429; the client retries
429/5xx automatically (3 retries, exponential backoff starting at 0.1s).

## 4. Endpoints

### 4.1 Full Market Snapshot (multiple tickers, current price) - paid plans

The main endpoint for FinAlly. One request, any number of tickers.

```
GET /v2/snapshot/locale/us/markets/stocks/tickers?tickers=AAPL,MSFT,TSLA
```

| Param | Type | Notes |
|---|---|---|
| `tickers` | comma-separated string | Case-sensitive. Omit to get all ~10,000 tickers. |
| `include_otc` | bool | Default `false`. |

Response (abridged):

```json
{
  "status": "OK",
  "count": 1,
  "tickers": [
    {
      "ticker": "AAPL",
      "todaysChange": 1.32,
      "todaysChangePerc": 0.69,
      "updated": 1759507200000000000,
      "day":      {"o": 190.1, "h": 192.4, "l": 189.7, "c": 191.9, "v": 41230000, "vw": 191.2},
      "prevDay":  {"o": 188.0, "h": 190.9, "l": 187.5, "c": 190.58, "v": 52000000, "vw": 189.6},
      "min":      {"o": 191.8, "h": 191.95, "l": 191.8, "c": 191.9, "v": 120000, "vw": 191.88, "t": 1759507140000, "n": 900, "av": 41230000},
      "lastTrade": {"p": 191.9, "s": 100, "t": 1759507199123456789, "x": 4, "i": "52983525029461", "c": [14, 41]},
      "lastQuote": {"P": 191.91, "S": 2, "p": 191.89, "s": 3, "t": 1759507199200000000}
    }
  ]
}
```

Field meanings:

| Field | Meaning |
|---|---|
| `lastTrade.p` | Price of the latest trade - **use this as the current price** |
| `lastTrade.t` | SIP timestamp of that trade, **Unix nanoseconds** |
| `prevDay.c` | Previous session close - **reference for daily change %** |
| `day.o/h/l/c/v` | Today's session OHLCV so far (zeros before the open) |
| `todaysChange`, `todaysChangePerc` | Change vs `prevDay.c` |
| `lastQuote.p` / `lastQuote.P` | Bid / ask price |
| `min` | Latest one-minute bar (`t` in ms) |
| `updated` | Last update of this snapshot, Unix nanoseconds |

Notes:
- Snapshot data is cleared at 3:30 AM ET and refills from about 4:00 AM ET as
  pre-market trading starts. Fields can be missing or zero early in the day, so fall
  back from `lastTrade.p` to `day.c` to `prevDay.c`.
- Tickers that do not exist are simply absent from `tickers`; no error.

Python client:

```python
from massive import RESTClient

client = RESTClient()  # reads MASSIVE_API_KEY

snapshots = client.get_snapshot_all("stocks", tickers=["AAPL", "MSFT", "TSLA"])
for snap in snapshots:
    price = snap.last_trade.price if snap.last_trade else None
    print(
        snap.ticker,
        price,
        snap.prev_day.close if snap.prev_day else None,
        snap.todays_change_percent,
        snap.last_trade.sip_timestamp if snap.last_trade else None,  # ns
    )
```

`get_snapshot_all` accepts a list or a comma-separated string and returns a list of
`TickerSnapshot` objects with attributes `ticker`, `day`, `prev_day`, `min`,
`last_trade`, `last_quote`, `todays_change`, `todays_change_percent`, `updated`.
`day`/`prev_day` are `Agg` objects (`open`, `high`, `low`, `close`, `volume`, `vwap`);
`last_trade` has `price`, `size`, `sip_timestamp`; `last_quote` has `bid_price`,
`ask_price`.

### 4.2 Single Ticker Snapshot - paid plans

```
GET /v2/snapshot/locale/us/markets/stocks/tickers/{ticker}
```

Same object as one entry above, under the key `ticker`. Not needed by FinAlly: the
multi-ticker call covers it with one request.

```python
snap = client.get_snapshot_ticker("stocks", "AAPL")
```

### 4.3 Grouped Daily (all tickers, end of day) - all plans, including free

One request returns the daily OHLCV bar for **every** US stock on a given date. This
is the only efficient multi-ticker endpoint on the free plan.

```
GET /v2/aggs/grouped/locale/us/market/stocks/{date}?adjusted=true
```

| Param | Type | Notes |
|---|---|---|
| `date` | `YYYY-MM-DD` | A trading day. Weekends/holidays return `resultsCount: 0`. |
| `adjusted` | bool | Split-adjusted, default `true`. |
| `include_otc` | bool | Default `false`. |

Response (abridged):

```json
{
  "status": "OK",
  "adjusted": true,
  "resultsCount": 11532,
  "results": [
    {"T": "AAPL", "o": 188.0, "h": 190.9, "l": 187.5, "c": 190.58, "v": 52000000, "vw": 189.6, "n": 610000, "t": 1759435200000}
  ]
}
```

`T` is the ticker, `t` is the bar start in Unix **milliseconds**. Filter the ~11k
results down to the tickers you want on the client side.

On the free plan the current day is not available until after the close, so request
the most recent completed trading day. Walk back day by day until `results` is
non-empty (covers weekends and holidays):

```python
from datetime import date, timedelta
from massive import RESTClient

client = RESTClient()


def latest_closes(tickers: set[str], max_days_back: int = 7) -> dict[str, float]:
    """Return {ticker: close} from the most recent trading day with data."""
    day = date.today() - timedelta(days=1)
    for _ in range(max_days_back):
        bars = client.get_grouped_daily_aggs(day.isoformat(), adjusted=True)
        if bars:
            return {b.ticker: b.close for b in bars if b.ticker in tickers}
        day -= timedelta(days=1)
    return {}
```

Each skipped non-trading day costs one call, so keep `max_days_back` small on the
free plan (5 calls/min).

### 4.4 Previous Close (one ticker, end of day) - all plans

```
GET /v2/aggs/ticker/{ticker}/prev?adjusted=true
```

```json
{
  "ticker": "AAPL",
  "status": "OK",
  "resultsCount": 1,
  "results": [{"T": "AAPL", "o": 188.0, "h": 190.9, "l": 187.5, "c": 190.58, "v": 52000000, "vw": 189.6, "t": 1759435200000}]
}
```

```python
prev = client.get_previous_close_agg("AAPL")  # list of PreviousCloseAgg
close = prev[0].close
```

One call per ticker, so 10 tickers would take 2 minutes on the free plan. Use
Grouped Daily instead for multiple tickers.

### 4.5 Daily Open/Close (one ticker, specific date) - all plans

```
GET /v1/open-close/{ticker}/{date}
```

Returns `open`, `high`, `low`, `close`, `volume`, `preMarket`, `afterHours` for one
ticker on one date. Useful for history lookups; not needed for live prices.

```python
oc = client.get_daily_open_close_agg("AAPL", "2026-10-02")
print(oc.open, oc.close, oc.after_hours)
```

### 4.6 Last Trade (one ticker, latest trade) - Developer and above

```
GET /v2/last/trade/{ticker}
```

Returns `results.p` (price), `results.s` (size), `results.t` (SIP ns timestamp).
One ticker per call; the Snapshot endpoint is strictly better for FinAlly.

```python
trade = client.get_last_trade("AAPL")
print(trade.price, trade.sip_timestamp)
```

### 4.7 Aggregates / bars (history for charts) - all plans

```
GET /v2/aggs/ticker/{ticker}/range/{multiplier}/{timespan}/{from}/{to}
```

```python
bars = list(client.list_aggs("AAPL", 1, "day", "2026-09-01", "2026-10-02", limit=50000))
for b in bars:
    print(b.timestamp, b.open, b.high, b.low, b.close, b.volume)  # timestamp in ms
```

Not part of the core plan (sparklines are built from the SSE stream), but available if
a historical main chart is added later.

## 5. Endpoint choice for FinAlly

| Need | Paid plan | Free plan |
|---|---|---|
| Current price, many tickers | Snapshot (4.1), one call per poll | Not available |
| Previous close, many tickers | `prevDay.c` from Snapshot | Grouped Daily (4.3), one call |
| Poll interval | 2-15 s (5 s default) | Prices only change once a day; refresh every 15-60 min |

Detection is simple: call Snapshot once. `BadResponse` containing `NOT_AUTHORIZED`
means a free key, so switch to Grouped Daily. See `MARKET_INTERFACE.md`.

## 6. Complete polling example

A minimal standalone poller that works on any plan:

```python
import asyncio
from datetime import date, timedelta

from massive import RESTClient
from massive.exceptions import BadResponse

TICKERS = ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA"]


def fetch_snapshot(client: RESTClient, tickers: list[str]) -> dict[str, float]:
    """Current prices from the Snapshot endpoint (paid plans)."""
    prices = {}
    for snap in client.get_snapshot_all("stocks", tickers=tickers):
        if snap.last_trade and snap.last_trade.price:
            prices[snap.ticker] = snap.last_trade.price
        elif snap.prev_day and snap.prev_day.close:
            prices[snap.ticker] = snap.prev_day.close
    return prices


def fetch_eod(client: RESTClient, tickers: list[str]) -> dict[str, float]:
    """Latest daily closes from Grouped Daily (any plan)."""
    wanted = set(tickers)
    day = date.today() - timedelta(days=1)
    for _ in range(7):
        bars = client.get_grouped_daily_aggs(day.isoformat())
        if bars:
            return {b.ticker: b.close for b in bars if b.ticker in wanted}
        day -= timedelta(days=1)
    return {}


async def main() -> None:
    client = RESTClient()
    fetch, interval = fetch_snapshot, 5.0
    try:
        await asyncio.to_thread(fetch_snapshot, client, TICKERS[:1])
    except BadResponse as e:
        if "NOT_AUTHORIZED" not in str(e):
            raise
        fetch, interval = fetch_eod, 900.0
    while True:
        prices = await asyncio.to_thread(fetch, client, TICKERS)
        print(prices)
        await asyncio.sleep(interval)


asyncio.run(main())
```

Run it with:

```bash
cd backend
uv add massive
MASSIVE_API_KEY=... uv run python poll_demo.py
```

## 7. Gotchas

- **Timestamps differ by endpoint**: snapshot `lastTrade.t` and `updated` are
  nanoseconds; aggregate `t` values are milliseconds. Convert to seconds before use.
- **Tickers are case-sensitive**: upper-case them before calling.
- **Unknown tickers are silently dropped** from Snapshot and Grouped Daily responses.
  A ticker missing from the response is the signal that it is invalid (or not traded).
- **Market hours**: outside 9:30-16:00 ET the snapshot price only moves with
  pre/after-market trades, so prices may sit still for long periods. That is expected.
- **Free plan is end-of-day only**: no intraday movement at all. The simulator gives
  a much better demo; Massive on the free plan is mainly useful to seed realistic prices.
- **TLS on this machine**: the `massive` client uses `urllib3` with `certifi`. If it
  fails with `CERTIFICATE_VERIFY_FAILED`, call `truststore.inject_into_ssl()` at
  startup (see user-level CLAUDE.md). Never disable verification.

## Sources

- Full Market Snapshot: https://massive.com/docs/rest/stocks/snapshots/full-market-snapshot
- Single Ticker Snapshot: https://massive.com/docs/rest/stocks/snapshots/single-ticker-snapshot
- Daily Market Summary (Grouped Daily): https://massive.com/docs/rest/stocks/aggregates/daily-market-summary
- Previous Day Bar: https://massive.com/docs/rest/stocks/aggregates/previous-day-bar
- Last Trade: https://massive.com/docs/rest/stocks/trades-quotes/last-trade
- Pricing: https://massive.com/pricing
- Python client: https://github.com/massive-com/client-python
