# Market Data Interface

The unified Python API every part of the FinAlly backend uses to get stock prices.
One interface, two implementations: the Massive REST poller when `MASSIVE_API_KEY`
is set, otherwise the built-in simulator (see `MARKET_SIMULATOR.md`). Endpoint
details for Massive are in `MASSIVE_API.md`.

All code below has been run end to end (simulator, cache, SSE generator, and the
Massive source against a stubbed client for both paid and free plans).

## 1. Design

```
                 MASSIVE_API_KEY set?
                  /               \
               yes                 no
                |                   |
      MassiveDataSource     SimulatorDataSource
      (poll REST, 5s/15m)   (GBM step, 500ms)
                 \                 /
                  v               v
                 PriceCache (latest price per ticker, version counter)
                  |                    |
     SSE /api/stream/prices      trades, portfolio valuation, chat context
```

Principles:

- **Producers write, everyone else reads.** A single background task (simulator or
  poller) writes to `PriceCache`. API routes never call Massive or the simulator for
  a price; they read the cache. This keeps trade execution instant and rate limits
  safe.
- **Push, not pull, for prices.** Sources run their own loop; downstream code is
  unaware of which source is active.
- **The source tracks whatever it is told to.** Deciding *which* tickers to track is
  the caller's job (see section 6), not the source's.

## 2. Module layout

```
backend/app/market/
├── __init__.py
├── models.py          # PriceUpdate dataclass
├── cache.py           # PriceCache
├── interface.py       # MarketDataSource ABC
├── seed_prices.py     # simulator seed prices and parameters
├── simulator.py       # GBMSimulator + SimulatorDataSource
├── massive_client.py  # MassiveDataSource
├── factory.py         # create_market_data_source()
└── stream.py          # SSE router
```

Dependencies: `uv add fastapi numpy massive`.

## 3. Data model

`PriceUpdate` is immutable and carries everything the SSE stream and REST API need.

- `previous_price` is the price at the previous tick, used for flash direction.
- `reference_price` answers PLAN.md review item 2 ("daily change %"): it is the
  previous session close for Massive, and the first price seen since startup for the
  simulator (the seed price). `day_change_percent` is computed against it.
- Prices are rounded to cents when cached, so `direction` reflects visible changes.

```python
# backend/app/market/models.py
"""Price data model shared by every market data source."""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class PriceUpdate:
    """Latest price for one ticker, as stored in the cache and sent over SSE."""

    ticker: str
    price: float
    previous_price: float
    reference_price: float
    timestamp: float

    @property
    def change(self) -> float:
        """Tick-over-tick price change."""
        return round(self.price - self.previous_price, 4)

    @property
    def direction(self) -> str:
        """'up', 'down' or 'flat' versus the previous tick."""
        if self.price > self.previous_price:
            return "up"
        if self.price < self.previous_price:
            return "down"
        return "flat"

    @property
    def day_change_percent(self) -> float:
        """Percent change versus the reference (previous close or session start)."""
        return round((self.price / self.reference_price - 1) * 100, 4)

    def to_dict(self) -> dict:
        """JSON-ready representation used by the SSE stream and REST API."""
        return {
            "ticker": self.ticker,
            "price": self.price,
            "previous_price": self.previous_price,
            "timestamp": self.timestamp,
            "change": self.change,
            "direction": self.direction,
            "day_change_percent": self.day_change_percent,
        }
```

## 4. Price cache

Thread-safe because the Massive client is synchronous and runs in a worker thread
via `asyncio.to_thread`. `version` increments on every write so the SSE stream can
send only when something changed.

```python
# backend/app/market/cache.py
"""In-memory store of the latest price per ticker."""

import time
from threading import Lock

from .models import PriceUpdate


class PriceCache:
    """Thread-safe latest-price store. Written by one data source, read by many."""

    def __init__(self) -> None:
        self._prices: dict[str, PriceUpdate] = {}
        self._lock = Lock()
        self.version = 0

    def update(
        self,
        ticker: str,
        price: float,
        timestamp: float | None = None,
        reference_price: float | None = None,
    ) -> PriceUpdate:
        """Record a new price. The first price seen becomes the reference unless one is given."""
        price = round(price, 2)
        with self._lock:
            prev = self._prices.get(ticker)
            update = PriceUpdate(
                ticker=ticker,
                price=price,
                previous_price=prev.price if prev else price,
                reference_price=reference_price or (prev.reference_price if prev else price),
                timestamp=timestamp or time.time(),
            )
            self._prices[ticker] = update
            self.version += 1
            return update

    def get(self, ticker: str) -> PriceUpdate | None:
        """Latest update for one ticker, or None if it has no price yet."""
        return self._prices.get(ticker)

    def get_price(self, ticker: str) -> float | None:
        """Latest price for one ticker, or None."""
        update = self._prices.get(ticker)
        return update.price if update else None

    def get_all(self) -> dict[str, PriceUpdate]:
        """Snapshot copy of every cached price."""
        with self._lock:
            return dict(self._prices)

    def remove(self, ticker: str) -> None:
        """Forget a ticker."""
        with self._lock:
            if self._prices.pop(ticker, None):
                self.version += 1
```

## 5. The interface

All methods that may perform I/O are `async`. `start()` returns only after the
first prices are in the cache, so the first SSE event and the first trade always
have prices.

```python
# backend/app/market/interface.py
"""Abstract interface implemented by the simulator and the Massive poller."""

from abc import ABC, abstractmethod


class MarketDataSource(ABC):
    """Background producer that keeps a PriceCache up to date for a set of tickers."""

    @abstractmethod
    async def start(self, tickers: list[str]) -> None:
        """Begin producing prices for the given tickers. Returns once the first prices are cached."""

    @abstractmethod
    async def stop(self) -> None:
        """Stop the background task. Safe to call more than once."""

    @abstractmethod
    async def add_ticker(self, ticker: str) -> None:
        """Start tracking a ticker. No-op if already tracked."""

    @abstractmethod
    async def remove_ticker(self, ticker: str) -> None:
        """Stop tracking a ticker and drop it from the cache. No-op if not tracked."""

    @abstractmethod
    def get_tickers(self) -> list[str]:
        """Tickers currently tracked."""
```

## 6. Which tickers are tracked

PLAN.md review item 1: removing a ticker from the watchlist must not strand an open
position without a price. Rule:

> tracked tickers = watchlist ∪ tickers with an open position

The portfolio/watchlist service (not the market package) enforces it:

| Event | Action |
|---|---|
| Startup | `await source.start(watchlist ∪ positions)` |
| Ticker added to watchlist | `await source.add_ticker(t)` |
| Buy of an untracked ticker | `await source.add_ticker(t)` before reading the price |
| Ticker removed from watchlist | `remove_ticker(t)` only if no open position |
| Position closed (qty -> 0) | `remove_ticker(t)` only if not on the watchlist |

```python
async def sync_ticker(source: MarketDataSource, ticker: str, watched: bool, held: bool) -> None:
    """Track a ticker exactly when it is watched or held."""
    if watched or held:
        await source.add_ticker(ticker)
    else:
        await source.remove_ticker(ticker)
```

## 7. Factory

The only place that reads `MASSIVE_API_KEY`. An empty or whitespace-only value
means "use the simulator", matching PLAN.md section 5.

```python
# backend/app/market/factory.py
"""Chooses the market data source from the environment."""

import os

from .cache import PriceCache
from .interface import MarketDataSource
from .massive_client import MassiveDataSource
from .simulator import SimulatorDataSource


def create_market_data_source(cache: PriceCache) -> MarketDataSource:
    """Massive if MASSIVE_API_KEY is set and non-empty, otherwise the simulator."""
    api_key = os.environ.get("MASSIVE_API_KEY", "").strip()
    if api_key:
        return MassiveDataSource(cache, api_key)
    return SimulatorDataSource(cache)
```

## 8. Massive implementation

Behavior (endpoints explained in `MASSIVE_API.md`):

- **Paid plan**: one `get_snapshot_all` call for all tracked tickers every 5 s.
  Price = last trade, falling back to today's close, then the previous close.
  `reference_price` = previous close, so `day_change_percent` is a true daily change.
- **Free plan**: the first snapshot call fails with `NOT_AUTHORIZED`; the source
  switches permanently to end-of-day mode. It loads all closes from one Grouped Daily
  call (walking back over weekends/holidays), refreshes every 15 min, and serves
  newly added tickers from that in-memory result without another API call. Prices
  do not move intraday on the free plan.
- **Errors** in the background loop (network, 5xx after the client's own retries)
  are logged and retried on the next poll; they never kill the task. Errors during
  `start()` propagate, so a bad key fails loudly at startup.
- **Unknown tickers** are absent from Massive responses, so they never get a price.

```python
# backend/app/market/massive_client.py
"""Market data source backed by the Massive (formerly Polygon.io) REST API."""

import asyncio
import logging
from datetime import date, timedelta

from massive import RESTClient
from massive.exceptions import BadResponse

from .cache import PriceCache
from .interface import MarketDataSource

logger = logging.getLogger(__name__)


class MassiveDataSource(MarketDataSource):
    """Polls Massive for the tracked tickers and writes prices to the PriceCache.

    Paid plans use the multi-ticker Snapshot endpoint every `interval` seconds.
    Free plans are not entitled to snapshots; the source detects this on the first
    poll and switches to end-of-day closes from Grouped Daily, refreshed every
    `eod_interval` seconds.
    """

    def __init__(
        self,
        cache: PriceCache,
        api_key: str,
        interval: float = 5.0,
        eod_interval: float = 900.0,
    ) -> None:
        self.cache = cache
        self.client = RESTClient(api_key=api_key)
        self.interval = interval
        self.eod_interval = eod_interval
        self.eod_mode = False
        self._eod_closes: dict[str, float] = {}
        self._tickers: set[str] = set()
        self._task: asyncio.Task | None = None

    async def start(self, tickers: list[str]) -> None:
        self._tickers = {t.upper() for t in tickers}
        await self._poll()
        self._task = asyncio.create_task(self._run(), name="massive-poller")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            self._task = None

    async def add_ticker(self, ticker: str) -> None:
        ticker = ticker.upper()
        if ticker in self._tickers:
            return
        self._tickers.add(ticker)
        if self.eod_mode and self._eod_closes:
            self._write_eod({ticker})
        else:
            await self._poll()

    async def remove_ticker(self, ticker: str) -> None:
        self._tickers.discard(ticker.upper())
        self.cache.remove(ticker.upper())

    def get_tickers(self) -> list[str]:
        return sorted(self._tickers)

    async def _run(self) -> None:
        """Poll until cancelled. Errors are logged and the next poll retries."""
        while True:
            await asyncio.sleep(self.eod_interval if self.eod_mode else self.interval)
            try:
                await self._poll()
            except Exception:
                logger.exception("Massive poll failed")

    async def _poll(self) -> None:
        """Fetch prices for all tracked tickers, falling back to EOD on a free plan."""
        if not self._tickers:
            return
        if not self.eod_mode:
            try:
                await asyncio.to_thread(self._fetch_snapshot)
                return
            except BadResponse as e:
                if "NOT_AUTHORIZED" not in str(e):
                    raise
                logger.warning("Massive key has no snapshot access; using end-of-day prices")
                self.eod_mode = True
        self._eod_closes = await asyncio.to_thread(self._fetch_latest_closes)
        self._write_eod(self._tickers)

    def _fetch_snapshot(self) -> None:
        """Write current prices for all tracked tickers from one Snapshot call."""
        snapshots = self.client.get_snapshot_all("stocks", tickers=sorted(self._tickers))
        for snap in snapshots:
            prev_close = snap.prev_day.close if snap.prev_day else None
            trade = snap.last_trade
            price = (trade.price if trade else None) or (snap.day.close if snap.day else None) or prev_close
            if not price:
                continue
            ts = trade.sip_timestamp / 1e9 if trade and trade.sip_timestamp else None
            self.cache.update(snap.ticker, price, ts, reference_price=prev_close or None)

    def _fetch_latest_closes(self, max_days_back: int = 7) -> dict[str, float]:
        """All closes from the most recent trading day that has Grouped Daily data."""
        day = date.today() - timedelta(days=1)
        for _ in range(max_days_back):
            bars = self.client.get_grouped_daily_aggs(day.isoformat())
            if bars:
                return {b.ticker: b.close for b in bars}
            day -= timedelta(days=1)
        return {}

    def _write_eod(self, tickers: set[str]) -> None:
        """Copy cached end-of-day closes for the given tickers into the PriceCache."""
        for ticker in tickers:
            if ticker in self._eod_closes:
                self.cache.update(ticker, self._eod_closes[ticker])
```

## 9. Simulator implementation

`SimulatorDataSource` wraps `GBMSimulator` in an asyncio task that steps every
500 ms. Full code and the math are in `MARKET_SIMULATOR.md`. Any ticker string gets
a price (unknown symbols start at a random $50-$300).

## 10. SSE stream

Answers PLAN.md review item 3. One event per change of the cache, carrying every
tracked ticker:

```
retry: 1000

data: {"AAPL": {"ticker": "AAPL", "price": 190.12, "previous_price": 190.1, "timestamp": 1759507199.12, "change": 0.02, "direction": "up", "day_change_percent": 0.0632}, "GOOGL": {...}}
```

The server checks the cache every 500 ms and sends only if `version` changed, so on
the Massive free plan the stream is nearly silent after the first event (the
browser's `EventSource` keeps the connection open regardless). `retry: 1000` makes
the browser reconnect after 1 s.

```python
# backend/app/market/stream.py
"""SSE endpoint that streams the PriceCache to browsers."""

import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from .cache import PriceCache


def create_stream_router(cache: PriceCache, poll_seconds: float = 0.5) -> APIRouter:
    """Router exposing GET /api/stream/prices."""
    router = APIRouter()

    @router.get("/api/stream/prices")
    async def stream_prices(request: Request) -> StreamingResponse:
        return StreamingResponse(
            price_events(cache, request, poll_seconds),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    return router


async def price_events(cache: PriceCache, request: Request, poll_seconds: float) -> AsyncIterator[str]:
    """Yield one SSE event with every ticker whenever the cache changes."""
    yield "retry: 1000\n\n"
    last_version = -1
    while not await request.is_disconnected():
        if cache.version != last_version:
            last_version = cache.version
            payload = {t: u.to_dict() for t, u in cache.get_all().items()}
            yield f"data: {json.dumps(payload)}\n\n"
        await asyncio.sleep(poll_seconds)
```

## 11. Wiring into FastAPI

```python
# backend/app/main.py (market data parts only)
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.market.cache import PriceCache
from app.market.factory import create_market_data_source
from app.market.stream import create_stream_router

price_cache = PriceCache()
market_source = create_market_data_source(price_cache)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await market_source.start(load_tracked_tickers())  # watchlist ∪ positions from SQLite
    yield
    await market_source.stop()


app = FastAPI(lifespan=lifespan)
app.include_router(create_stream_router(price_cache))
```

Reading a price elsewhere, for example in trade execution:

```python
price = price_cache.get_price(ticker)
if price is None:
    raise HTTPException(400, f"No price available for {ticker}")
```

## 12. Validating new tickers

Answers PLAN.md review item 6. When the user (or the LLM) adds a ticker:

1. Upper-case it and check the format: `re.fullmatch(r"[A-Z][A-Z.]{0,9}", ticker)`.
2. `await source.add_ticker(ticker)`.
3. If `price_cache.get_price(ticker)` is still `None`, call `remove_ticker` and
   return 400 "Unknown ticker". With Massive this rejects symbols that do not exist.
   The simulator accepts any well-formed symbol.

## 13. Testing

- `PriceCache`: first update has `previous_price == price` and `direction == "flat"`;
  a second update sets direction and change; `reference_price` sticks; `remove`
  bumps `version`.
- Factory: unset, empty and whitespace key -> simulator; any other value -> Massive.
- `MassiveDataSource`: replace `source.client` with a stub object exposing
  `get_snapshot_all` / `get_grouped_daily_aggs`. Cover the paid path, the
  `NOT_AUTHORIZED` fallback, a missing (invalid) ticker, and the weekend walk-back.
  No network or API key needed.
- `price_events`: pass a stub request whose `is_disconnected` returns `True` after
  N calls and assert the first event is `retry:` and the next is `data:` JSON.
- Simulator tests: see `MARKET_SIMULATOR.md`.
