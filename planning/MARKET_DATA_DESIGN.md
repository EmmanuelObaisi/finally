# Market Data Backend: Detailed Design

The implementation spec for everything under `backend/app/market/`: the unified
market data API, the GBM simulator, the Massive (Polygon.io) poller, the price
cache and the SSE stream. A Backend agent should be able to build the subsystem
by copying the code in this document into the listed files.

Background research lives in three companion documents, which this one builds on
and supersedes where they differ (section 20 lists the differences):

- `MARKET_INTERFACE.md`: first draft of the interface, cache and SSE stream
- `MARKET_SIMULATOR.md`: GBM maths, correlation model and its measured behaviour
- `MASSIVE_API.md`: Massive endpoints, plans, rate limits and response formats

**Verification.** Every file shown with a `# backend/...` path header (except
the sketches in section 14) was run exactly as written on Python 3.13 with
`massive` 2.8.0, FastAPI 0.142 and numpy 2.5: the 37 tests in section 17 pass,
`ruff check` and `ruff format --check` are clean, and the app was started under
uvicorn and its SSE stream read with `curl`. Live calls to `api.massive.com` were
not possible from the build sandbox, so the Massive source was tested against
stub clients that return the client's own `TickerSnapshot` and `GroupedDailyAgg`
model objects. The TypeScript example (section 12.3), the `get_market`
dependency (section 13) and the route sketches (section 14) are illustrative:
they show how other modules use the API and depend on code that does not exist yet.

---

## 1. Requirements

| # | Requirement | Source | Where it is met |
|---|---|---|---|
| R1 | One interface, two implementations, chosen by `MASSIVE_API_KEY` | PLAN §6 | `interface.py`, `factory.py` |
| R2 | Simulator: GBM, per-ticker drift/vol, ~500 ms ticks, correlated, 2-5% events, realistic seeds | PLAN §6 | `simulator.py`, `seed_prices.py` |
| R3 | Massive: REST polling of all watched tickers, free and paid tiers | PLAN §6 | `massive_client.py` |
| R4 | Shared in-memory cache: latest price, previous price, timestamp | PLAN §6 | `cache.py` |
| R5 | `GET /api/stream/prices` SSE with ticker, price, previous price, timestamp, direction | PLAN §6, §8 | `stream.py` |
| R6 | Held tickers keep a price even if removed from the watchlist | Review item 1 | Tracking rule, section 14 |
| R7 | A defined source for "daily change %" | Review item 2 | `reference_price`, section 5 |
| R8 | Documented SSE payload | Review item 3 | Section 12 |
| R9 | Defined behaviour for unknown tickers in both modes | Review item 6 | `MarketDataService.track`, section 6 |
| R10 | One Massive poll interval for paid tiers, stated once | Review item 18 | `MASSIVE_POLL_INTERVAL`, section 15 |

Non-goals: historical bars, order books, market-hours simulation, WebSockets,
multi-user fan-out (the design does not prevent it, but nothing is built for it).

---

## 2. Architecture

```
                         MASSIVE_API_KEY set and non-empty?
                           /                         \
                         no                           yes
                          |                            |
              SimulatorDataSource            MassiveDataSource
              GBMSimulator.step()            Snapshot every 5 s (paid plans)
              every 500 ms                   Grouped Daily every 15 min (free plan)
                          \                            /
                           v                          v
                 PriceCache  (latest PriceUpdate per ticker, version, change event)
                    |                 |                         |
          SSE /api/stream/prices   trade execution,      chat context,
          (pushed on every change) portfolio valuation   watchlist API
                    \_________________|_________________________/
                              all through MarketDataService
```

Principles:

1. **One writer, many readers.** Only the active source writes to the cache.
   Routes never call Massive or the simulator for a price; they read the cache,
   so trades are instant and rate limits are safe.
2. **One object for everyone else.** Downstream code (routes, portfolio, chat)
   uses `MarketDataService` only. It never imports the simulator or Massive.
3. **The caller decides what to track.** The market package tracks whatever it is
   told to. The watchlist and portfolio code enforce
   *tracked = watchlist ∪ open positions* (section 14).
4. **Push, not poll, downstream.** The cache wakes SSE streams on every change,
   so each simulator tick reaches the browser once, with no added latency and no
   dropped ticks.

### Concurrency model

Everything runs on the single uvicorn event loop except Massive HTTP calls:

| Work | Runs on | Why |
|---|---|---|
| Simulator steps, cache writes, SSE generators, route handlers | Event loop | Single thread, so no races between `step()` and `add_ticker()` |
| `RESTClient.get_snapshot_all` / `get_grouped_daily_aggs` | Worker thread via `asyncio.to_thread` | The `massive` client is synchronous (urllib3) |

The worker thread only *returns* data. Cache writes always happen back on the
event loop, which is what lets the cache wake asyncio waiters safely. The cache
also takes a `threading.Lock`, so FastAPI `def` (threadpool) handlers may read it.

### Lifecycle

1. Import time: `create_market_data_service()` builds the cache and picks a source.
2. FastAPI lifespan startup: `await market.start(watchlist ∪ positions)`. Returns
   once the first prices are cached, so the first SSE event and the first trade
   always have prices. With Massive, an auth or network failure here aborts
   startup with the error in the log (a misconfigured key fails loudly).
3. Running: the source's background task updates the cache. Watchlist and trade
   routes call `track` / `untrack`.
4. Shutdown: `await market.stop()` cancels and awaits the background task.

---

## 3. Module layout and dependencies

```
backend/
├── pyproject.toml
├── market_data_demo.py        # terminal demo (section 18)
├── app/
│   ├── __init__.py
│   ├── main.py                # FastAPI app; market wiring in section 13
│   └── market/
│       ├── __init__.py        # public exports
│       ├── models.py          # Quote, PriceUpdate
│       ├── tickers.py         # normalize_ticker, InvalidTickerError, UnknownTickerError
│       ├── cache.py           # PriceCache
│       ├── interface.py       # MarketDataSource ABC
│       ├── seed_prices.py     # simulator seed prices, parameters, sectors
│       ├── simulator.py       # GBMSimulator, SimulatorDataSource
│       ├── massive_client.py  # MassiveDataSource and pure parsing helpers
│       ├── factory.py         # create_market_data_source()
│       ├── service.py         # MarketDataService, create_market_data_service()
│       └── stream.py          # SSE router
└── tests/
    ├── __init__.py
    └── market/
        ├── __init__.py
        ├── test_cache.py
        ├── test_simulator.py
        ├── test_massive.py
        └── test_service_stream.py
```

`pyproject.toml` (market data needs; other agents add their own dependencies):

```toml
# backend/pyproject.toml
[project]
name = "finally-backend"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.30",
    "numpy>=2.0",
    "massive>=2.8",
    "tzdata>=2024.1",  # zoneinfo data for America/New_York in slim images
]

[project.optional-dependencies]
dev = ["pytest>=8", "pytest-asyncio>=0.24", "httpx>=0.27", "ruff>=0.6"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]

[tool.ruff]
line-length = 120
```

```bash
cd backend
uv sync --extra dev
uv run pytest
```

---

## 4. Public API

Everything another module needs is exported from `app.market`:

```python
# backend/app/market/__init__.py
"""Market data: live prices from the simulator or the Massive API.

Downstream code should only need what is exported here.
"""

from .cache import PriceCache
from .interface import MarketDataSource
from .models import PriceUpdate, Quote
from .service import MarketDataService, create_market_data_service
from .stream import create_stream_router
from .tickers import InvalidTickerError, UnknownTickerError, normalize_ticker

__all__ = [
    "InvalidTickerError",
    "MarketDataService",
    "MarketDataSource",
    "PriceCache",
    "PriceUpdate",
    "Quote",
    "UnknownTickerError",
    "create_market_data_service",
    "create_stream_router",
    "normalize_ticker",
]
```

### `MarketDataService`

| Member | Returns | I/O | Notes |
|---|---|---|---|
| `mode` | `"simulator"` or `"massive"` | none | For `/api/health` and logs |
| `await start(tickers)` | `None` | yes | Normalizes, skips malformed symbols, starts the source |
| `await stop()` | `None` | none | Idempotent |
| `get(ticker)` | `PriceUpdate \| None` | none | Case-insensitive |
| `get_price(ticker)` | `float \| None` | none | Case-insensitive |
| `get_all()` | `dict[str, PriceUpdate]` | none | Copy; safe to iterate |
| `tracked()` | `list[str]` | none | Sorted |
| `await track(ticker)` | `PriceUpdate` | maybe | Adds and returns the price. Raises `InvalidTickerError` or `UnknownTickerError` |
| `await untrack(ticker)` | `None` | none | Caller checks it is neither watched nor held |
| `cache` | `PriceCache` | | Used by the SSE router and the demo |

### Typical calls from other modules

```python
market: MarketDataService = request.app.state.market

price = market.get_price("AAPL")             # trade execution, valuation (None if untracked)
prices = market.get_all()                    # chat context, GET /api/watchlist
update = await market.track("pypl")          # POST /api/watchlist, buying an unwatched ticker
await market.untrack("PYPL")                 # only when not watched and not held
```

Exception mapping for routes: `InvalidTickerError` (a `ValueError`) and
`UnknownTickerError` (a `LookupError`) both become HTTP 400 with the message.

---

## 5. Data model: `models.py`

Two immutable types:

- **`Quote`**: what a source produces. Raw price, optional timestamp, optional
  reference price. Sources never construct `PriceUpdate` themselves.
- **`PriceUpdate`**: what the cache stores and everyone reads. The cache fills in
  `previous_price` and rounds to cents, so every source behaves identically.

**Reference price (resolves review item 2).** "Daily change" is measured against
`reference_price`:

| Source | `reference_price` | Meaning of `day_change_percent` |
|---|---|---|
| Simulator | Seed price (first price seen since startup) | Change since the server started |
| Massive, paid | `prevDay.c` from the snapshot | True daily change vs previous close |
| Massive, free | Open of the latest daily bar | Open-to-close change of the last session |

`previous_price` is the price before the most recent cache write, used for the
flash direction. Prices are rounded to cents when cached, so `direction`
reflects visible changes only.

```python
# backend/app/market/models.py
"""Price data model shared by every market data source."""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Quote:
    """A raw price observation from a data source, before it enters the cache."""

    ticker: str
    price: float
    timestamp: float | None = None  # Unix seconds; None means "now"
    reference_price: float | None = None  # previous close; None keeps the current one


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
        """Change versus the previous cached price."""
        return round(self.price - self.previous_price, 4)

    @property
    def direction(self) -> str:
        """'up', 'down' or 'flat' versus the previous cached price."""
        if self.price > self.previous_price:
            return "up"
        if self.price < self.previous_price:
            return "down"
        return "flat"

    @property
    def day_change(self) -> float:
        """Change versus the reference price."""
        return round(self.price - self.reference_price, 4)

    @property
    def day_change_percent(self) -> float:
        """Percent change versus the reference price."""
        if not self.reference_price:
            return 0.0
        return round((self.price / self.reference_price - 1) * 100, 4)

    def to_dict(self) -> dict:
        """JSON-ready representation used by the SSE stream and REST API."""
        return {
            "ticker": self.ticker,
            "price": self.price,
            "previous_price": self.previous_price,
            "reference_price": self.reference_price,
            "timestamp": self.timestamp,
            "change": self.change,
            "direction": self.direction,
            "day_change": self.day_change,
            "day_change_percent": self.day_change_percent,
        }
```

JSON shape of one entry (identical in SSE events and REST responses):

| Field | Type | Example | Notes |
|---|---|---|---|
| `ticker` | string | `"AAPL"` | Upper case |
| `price` | number | `190.12` | Rounded to cents |
| `previous_price` | number | `190.10` | Equals `price` on the first update |
| `reference_price` | number | `190.00` | See table above |
| `timestamp` | number | `1759507199.12` | Unix seconds, float |
| `change` | number | `0.02` | `price - previous_price` |
| `direction` | string | `"up"` | `"up"`, `"down"` or `"flat"` |
| `day_change` | number | `0.12` | `price - reference_price` |
| `day_change_percent` | number | `0.0632` | Percent, so `0.0632` means 0.0632% |

---

## 6. Ticker validation: `tickers.py`

Answers review item 6. Every ticker that enters the system goes through
`normalize_ticker`: trim, upper-case, then match `[A-Z][A-Z0-9.]{0,9}` (allows
`BRK.B`; rejects empty strings, spaces, punctuation and leading digits).

Whether a well-formed ticker is *real* is decided by the source:

| Mode | Unknown but well-formed ticker (e.g. `ZZZZ`) |
|---|---|
| Simulator | Accepted. Starts at a random $50-$300 with default parameters |
| Massive, paid | Absent from the Snapshot response, so no price: `track` raises `UnknownTickerError` |
| Massive, free | Absent from the Grouped Daily closes: `track` raises `UnknownTickerError` |

```python
# backend/app/market/tickers.py
"""Ticker symbol normalization and validation."""

import re

TICKER_PATTERN = re.compile(r"[A-Z][A-Z0-9.]{0,9}")


class InvalidTickerError(ValueError):
    """The string is not a well-formed ticker symbol."""


class UnknownTickerError(LookupError):
    """The ticker is well-formed but the data source has no price for it."""


def normalize_ticker(raw: str) -> str:
    """Upper-case and trim a ticker, raising InvalidTickerError if malformed."""
    ticker = raw.strip().upper()
    if not TICKER_PATTERN.fullmatch(ticker):
        raise InvalidTickerError(f"Invalid ticker symbol: {raw!r}")
    return ticker
```

---

## 7. Price cache: `cache.py`

Responsibilities and design choices:

- **Batch writes.** `update_many` writes a whole simulator tick or Massive poll
  and bumps `version` once, so one tick produces exactly one SSE event.
- **Change notification.** `wait_for_change(version, timeout)` lets the SSE
  generator sleep until something changes instead of polling. It swaps in a
  fresh `asyncio.Event` on every bump, a simple broadcast to any number of
  waiters.
- **De-duplication.** A quote identical to what is cached (price, timestamp and
  reference) is ignored. Re-polling Massive while the market is closed or on the
  free plan therefore produces no events, and `previous_price` keeps meaning
  "the price before the last real change".
- **Threading rule.** Writes must happen on the event loop (they set asyncio
  events). Reads are safe from any thread thanks to the lock.

```python
# backend/app/market/cache.py
"""In-memory store of the latest price per ticker."""

import asyncio
import time
from collections.abc import Iterable
from threading import Lock

from .models import PriceUpdate, Quote


class PriceCache:
    """Latest price per ticker. Written by one data source, read by many.

    Writes must happen on the event loop thread (they wake asyncio waiters).
    Reads are safe from any thread.
    """

    def __init__(self) -> None:
        self._prices: dict[str, PriceUpdate] = {}
        self._lock = Lock()
        self._changed = asyncio.Event()
        self.version = 0

    def update(self, quote: Quote) -> PriceUpdate | None:
        """Record one quote. See update_many."""
        return self.update_many([quote]).get(quote.ticker)

    def update_many(self, quotes: Iterable[Quote]) -> dict[str, PriceUpdate]:
        """Record a batch of quotes and bump the version once.

        The first price seen for a ticker becomes its reference price unless the
        quote supplies one. A quote identical to the cached entry (same price,
        timestamp and reference) is ignored, so re-polling stale data is silent.
        Returns the entries that changed.
        """
        now = time.time()
        changed: dict[str, PriceUpdate] = {}
        with self._lock:
            for q in quotes:
                price = round(q.price, 2)
                prev = self._prices.get(q.ticker)
                if q.reference_price:
                    reference = round(q.reference_price, 2)
                else:
                    reference = prev.reference_price if prev else price
                timestamp = q.timestamp or now
                if prev and (prev.price, prev.timestamp, prev.reference_price) == (price, timestamp, reference):
                    continue
                update = PriceUpdate(
                    ticker=q.ticker,
                    price=price,
                    previous_price=prev.price if prev else price,
                    reference_price=reference,
                    timestamp=timestamp,
                )
                self._prices[q.ticker] = update
                changed[q.ticker] = update
        if changed:
            self._bump()
        return changed

    def remove(self, ticker: str) -> None:
        """Forget a ticker."""
        with self._lock:
            removed = self._prices.pop(ticker, None)
        if removed:
            self._bump()

    def get(self, ticker: str) -> PriceUpdate | None:
        """Latest entry for one ticker, or None if it has no price yet."""
        with self._lock:
            return self._prices.get(ticker)

    def get_price(self, ticker: str) -> float | None:
        """Latest price for one ticker, or None."""
        update = self.get(ticker)
        return update.price if update else None

    def get_all(self) -> dict[str, PriceUpdate]:
        """Copy of every cached entry."""
        with self._lock:
            return dict(self._prices)

    async def wait_for_change(self, version: int, timeout: float) -> int:
        """Wait until the version differs from `version` or `timeout` elapses.

        Returns the current version; equal to `version` means it timed out.
        """
        if self.version != version:
            return self.version
        try:
            await asyncio.wait_for(self._changed.wait(), timeout)
        except TimeoutError:
            pass
        return self.version

    def _bump(self) -> None:
        """Advance the version and wake every waiter."""
        self.version += 1
        self._changed.set()
        self._changed = asyncio.Event()
```

---

## 8. The interface: `interface.py`

Methods that may perform I/O are `async`. Implementations receive tickers that
are already normalized; normalization belongs to `MarketDataService`.

```python
# backend/app/market/interface.py
"""Abstract interface implemented by the simulator and the Massive poller."""

from abc import ABC, abstractmethod


class MarketDataSource(ABC):
    """Background producer that keeps a PriceCache up to date for a set of tickers.

    Tickers passed in are already normalized (see tickers.normalize_ticker).
    """

    name: str  # "simulator" or "massive"

    @abstractmethod
    async def start(self, tickers: list[str]) -> None:
        """Begin producing prices. Returns once the first prices are cached."""

    @abstractmethod
    async def stop(self) -> None:
        """Stop the background task. Safe to call more than once."""

    @abstractmethod
    async def add_ticker(self, ticker: str) -> None:
        """Start tracking a ticker and cache its price if one exists. No-op if tracked."""

    @abstractmethod
    async def remove_ticker(self, ticker: str) -> None:
        """Stop tracking a ticker and drop it from the cache. No-op if not tracked."""

    @abstractmethod
    def get_tickers(self) -> list[str]:
        """Tickers currently tracked, sorted."""
```

Contract every implementation must meet (the tests in section 17 check it):

| Method | Contract |
|---|---|
| `start` | Caches a price for every known ticker before returning; idempotent with respect to the background task |
| `stop` | Cancels and awaits the task; safe to call twice or before `start` |
| `add_ticker` | No-op if tracked; otherwise caches a price before returning if the source has one |
| `remove_ticker` | Removes from tracking *and* from the cache; no-op if unknown |
| `get_tickers` | Sorted list |

---

## 9. Simulator

### 9.1 Model

Full derivation and measured results are in `MARKET_SIMULATOR.md`. Summary:

- **Exact GBM step**: `S(t+dt) = S(t) · exp((μ − σ²/2)·dt + σ·√dt·Z)`. Prices stay
  positive, returns are log-normal, and the step is exact for any `dt`.
- **Time step**: annual parameters, so a 0.5 s tick is
  `dt = 0.5 / (252 × 6.5 × 3600) ≈ 8.48e-8` of a trading year. AAPL (σ 22%, $190)
  moves about 1.2 cents per tick (one standard deviation), enough to make most
  ticks flash on a two-decimal display. Pass a larger `dt` to speed up a demo.
- **Correlation**: `Z = L·z` where `L` is the Cholesky factor of a sector-based
  correlation matrix (tech 0.6, finance 0.5, everything else and TSLA 0.3). The
  matrix is a sum of positive semi-definite block matrices plus a positive
  diagonal, so it is positive definite for any set of tickers and Cholesky never
  fails. `L` is rebuilt only when tickers are added or removed.
- **Events**: each ticker has a 0.1% chance per tick of an extra uniform 2-5%
  jump, up or down. With 10 tickers at 2 ticks/s that is about one event every 50 s.

| Ticker | Seed $ | μ | σ | | Ticker | Seed $ | μ | σ |
|---|---|---|---|---|---|---|---|---|
| AAPL | 190 | 0.05 | 0.22 | | NVDA | 800 | 0.08 | 0.40 |
| GOOGL | 175 | 0.05 | 0.25 | | META | 500 | 0.05 | 0.30 |
| MSFT | 420 | 0.05 | 0.20 | | JPM | 195 | 0.04 | 0.18 |
| AMZN | 185 | 0.05 | 0.28 | | V | 280 | 0.04 | 0.17 |
| TSLA | 250 | 0.03 | 0.50 | | NFLX | 600 | 0.05 | 0.35 |
| *other* | random 50-300 | 0.05 | 0.25 | | | | | |

### 9.2 `seed_prices.py`

```python
# backend/app/market/seed_prices.py
"""Seed prices, per-ticker GBM parameters and sector correlations for the simulator."""

SEED_PRICES: dict[str, float] = {
    "AAPL": 190.0,
    "GOOGL": 175.0,
    "MSFT": 420.0,
    "AMZN": 185.0,
    "TSLA": 250.0,
    "NVDA": 800.0,
    "META": 500.0,
    "JPM": 195.0,
    "V": 280.0,
    "NFLX": 600.0,
}

# Annualized (drift mu, volatility sigma).
TICKER_PARAMS: dict[str, tuple[float, float]] = {
    "AAPL": (0.05, 0.22),
    "GOOGL": (0.05, 0.25),
    "MSFT": (0.05, 0.20),
    "AMZN": (0.05, 0.28),
    "TSLA": (0.03, 0.50),
    "NVDA": (0.08, 0.40),
    "META": (0.05, 0.30),
    "JPM": (0.04, 0.18),
    "V": (0.04, 0.17),
    "NFLX": (0.05, 0.35),
}
DEFAULT_PARAMS: tuple[float, float] = (0.05, 0.25)

# Price range for tickers with no seed price.
UNKNOWN_PRICE_RANGE: tuple[float, float] = (50.0, 300.0)

SECTORS: dict[str, frozenset[str]] = {
    "tech": frozenset({"AAPL", "GOOGL", "MSFT", "AMZN", "META", "NVDA", "NFLX"}),
    "finance": frozenset({"JPM", "V"}),
}
INTRA_SECTOR_CORR: dict[str, float] = {"tech": 0.6, "finance": 0.5}
CROSS_SECTOR_CORR = 0.3
LONER_TICKERS: frozenset[str] = frozenset({"TSLA"})  # always CROSS_SECTOR_CORR
```

### 9.3 `simulator.py`

`GBMSimulator` is pure and synchronous (no clock, no I/O), so tests drive it
step by step with a fixed `seed`. `SimulatorDataSource` is the thin async adapter.

Implementation notes:

- `step()` is fully vectorized: one matrix-vector product, one `exp`, one draw
  for events.
- `add_ticker` writes the seed price to the cache immediately, so a new watchlist
  entry shows a price before the next tick and `track` can return it.
- The simulator task and the route handlers share the event loop, so ticker
  changes never interleave with a step. No locks are needed here.
- A failing step is logged and the loop continues; it cannot kill the stream.
- `simulator=` lets tests inject a seeded `GBMSimulator`.

```python
# backend/app/market/simulator.py
"""Correlated geometric Brownian motion price simulator."""

import asyncio
import contextlib
import logging
import time

import numpy as np

from .cache import PriceCache
from .interface import MarketDataSource
from .models import Quote
from .seed_prices import (
    CROSS_SECTOR_CORR,
    DEFAULT_PARAMS,
    INTRA_SECTOR_CORR,
    LONER_TICKERS,
    SECTORS,
    SEED_PRICES,
    TICKER_PARAMS,
    UNKNOWN_PRICE_RANGE,
)

logger = logging.getLogger(__name__)

TRADING_SECONDS_PER_YEAR = 252 * 6.5 * 3600
TICK_SECONDS = 0.5


def sector_of(ticker: str) -> str | None:
    """Sector name for a ticker, or None if unclassified."""
    return next((name for name, members in SECTORS.items() if ticker in members), None)


def pair_correlation(a: str, b: str) -> float:
    """Correlation between two tickers' returns."""
    if a == b:
        return 1.0
    if a in LONER_TICKERS or b in LONER_TICKERS:
        return CROSS_SECTOR_CORR
    sector = sector_of(a)
    if sector and sector == sector_of(b):
        return INTRA_SECTOR_CORR[sector]
    return CROSS_SECTOR_CORR


class GBMSimulator:
    """Steps a set of correlated GBM price paths, with occasional jump events.

    Pure and synchronous: no I/O, no clock. Pass `seed` for reproducible paths.
    """

    def __init__(
        self,
        tickers: list[str] | None = None,
        dt: float = TICK_SECONDS / TRADING_SECONDS_PER_YEAR,
        event_probability: float = 0.001,
        seed: int | None = None,
    ) -> None:
        self.dt = dt
        self.event_probability = event_probability
        self.rng = np.random.default_rng(seed)
        self.prices: dict[str, float] = {}
        self._tickers: list[str] = []
        self._mu = self._sigma = np.empty(0)
        self._chol = np.empty((0, 0))
        for ticker in tickers or []:
            self.add_ticker(ticker)

    @property
    def tickers(self) -> list[str]:
        """Tickers being simulated, in insertion order."""
        return list(self._tickers)

    def add_ticker(self, ticker: str) -> float:
        """Add a ticker at its seed price (random if unknown) and return its price."""
        if ticker not in self.prices:
            seed = SEED_PRICES.get(ticker)
            self.prices[ticker] = seed if seed is not None else float(self.rng.uniform(*UNKNOWN_PRICE_RANGE))
            self._tickers.append(ticker)
            self._rebuild()
        return self.prices[ticker]

    def remove_ticker(self, ticker: str) -> None:
        """Stop simulating a ticker. No-op if unknown."""
        if ticker in self.prices:
            del self.prices[ticker]
            self._tickers.remove(ticker)
            self._rebuild()

    def step(self) -> dict[str, float]:
        """Advance every price by one tick and return the new prices."""
        n = len(self._tickers)
        if n == 0:
            return {}
        z = self._chol @ self.rng.standard_normal(n)
        log_returns = (self._mu - 0.5 * self._sigma**2) * self.dt + self._sigma * np.sqrt(self.dt) * z
        current = np.array([self.prices[t] for t in self._tickers])
        new = current * np.exp(log_returns) * (1.0 + self._event_shocks(n))
        self.prices = dict(zip(self._tickers, new.tolist(), strict=True))
        return dict(self.prices)

    def _event_shocks(self, n: int) -> np.ndarray:
        """Random 2-5% up or down jumps on a small fraction of tickers."""
        hit = self.rng.random(n) < self.event_probability
        size = self.rng.uniform(0.02, 0.05, n)
        sign = self.rng.choice([-1.0, 1.0], n)
        return np.where(hit, size * sign, 0.0)

    def _rebuild(self) -> None:
        """Recompute parameter vectors and the Cholesky factor of the correlation matrix."""
        params = [TICKER_PARAMS.get(t, DEFAULT_PARAMS) for t in self._tickers]
        self._mu = np.array([mu for mu, _ in params])
        self._sigma = np.array([sigma for _, sigma in params])
        corr = np.array([[pair_correlation(a, b) for b in self._tickers] for a in self._tickers])
        self._chol = np.linalg.cholesky(corr) if self._tickers else np.empty((0, 0))


class SimulatorDataSource(MarketDataSource):
    """Runs GBMSimulator in a background asyncio task and writes to the PriceCache."""

    name = "simulator"

    def __init__(
        self,
        cache: PriceCache,
        interval: float = TICK_SECONDS,
        simulator: GBMSimulator | None = None,
    ) -> None:
        self.cache = cache
        self.interval = interval
        self.sim = simulator or GBMSimulator()
        self._task: asyncio.Task | None = None

    async def start(self, tickers: list[str]) -> None:
        for ticker in tickers:
            await self.add_ticker(ticker)
        if self._task is None:
            self._task = asyncio.create_task(self._run(), name="market-simulator")

    async def stop(self) -> None:
        task, self._task = self._task, None
        if task:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task

    async def add_ticker(self, ticker: str) -> None:
        if ticker not in self.sim.prices:
            price = self.sim.add_ticker(ticker)
            self.cache.update(Quote(ticker, price))

    async def remove_ticker(self, ticker: str) -> None:
        self.sim.remove_ticker(ticker)
        self.cache.remove(ticker)

    def get_tickers(self) -> list[str]:
        return sorted(self.sim.tickers)

    async def _run(self) -> None:
        """Step the simulator every interval until cancelled."""
        while True:
            await asyncio.sleep(self.interval)
            try:
                now = time.time()
                self.cache.update_many(Quote(t, p, now) for t, p in self.sim.step().items())
            except Exception:
                logger.exception("Simulator step failed")
```

---

## 10. Massive API source

### 10.1 Plan detection and endpoints

The plan is detected from the first Snapshot call, with no configuration:

```
start() ──> get_snapshot_all(tracked tickers)
              ├── OK ─────────────────────> paid mode: Snapshot every MASSIVE_POLL_INTERVAL (5 s)
              ├── BadResponse NOT_AUTHORIZED ─> free mode (permanent): Grouped Daily, refresh every 15 min
              └── any other error ─────────> raised: app startup fails with the error logged
```

| | Paid plans (Starter and above) | Free plan (Basic) |
|---|---|---|
| Endpoint | `GET /v2/snapshot/locale/us/markets/stocks/tickers?tickers=...` | `GET /v2/aggs/grouped/locale/us/market/stocks/{date}` |
| Client call | `get_snapshot_all("stocks", tickers=[...])` | `get_grouped_daily_aggs(date, adjusted=True)` |
| Price | `lastTrade.p` → `min.c` → `day.c` → `prevDay.c` (first non-empty) | Bar close `c` |
| Reference | `prevDay.c` | Bar open `o` |
| Timestamp | `lastTrade.t` (ns), else `updated` (ns) | Bar `t` (ms) |
| Calls | 12/min at 5 s, plus 1 per ticker added | Startup ≤ 5, then ≤ 4 per 15 min, 0 per ticker added |
| Prices move | Every poll (real-time or 15-min delayed by plan) | Once a day |

The fallback chain handles the early-morning window (snapshots clear around
3:30 AM ET and refill from about 4 AM) and Starter plans, where `lastTrade` may
be absent.

**Free-plan rate budget (5 calls/min).** The startup probe costs 1 call.
`fetch_latest_closes` starts at *yesterday in New York time* (the free plan
cannot read the current session) and walks back one day per call until it finds
data: 1 call on Tuesday to Friday, 3 on Monday, 4 after a Monday holiday. So
startup costs at most 5 calls, inside the limit. The client retries HTTP 429
three times (urllib3 honours `Retry-After`). All ~11,000 closes are kept in
memory, so adding a ticker costs no call.

### 10.2 Implementation notes

- **Fetch in a thread, write on the loop.** `_fetch` runs the client through
  `asyncio.to_thread` and returns `Quote`s; `_refresh` writes them on the event
  loop.
- **No resurrection.** `_refresh` writes only quotes whose ticker is still
  tracked, so a ticker removed while a request is in flight does not come back.
- **One request sequence at a time.** An `asyncio.Lock` serializes the background
  poll and `add_ticker`, which also stops two concurrent first calls from both
  running plan detection.
- **Errors.** In the background loop, every exception (network, 5xx after the
  client's retries, unexpected payloads) is logged and the next poll retries.
  During `start()` errors propagate on purpose.
- **Pure helpers.** `quote_from_snapshot`, `quote_from_daily_bar` and
  `fetch_latest_closes` take plain objects, so tests feed them the client's own
  model classes without any network.
- **Tickers are case-sensitive** in Massive; normalization upstream guarantees
  upper case.
- **TLS behind corporate proxies.** The client pins `certifi`'s CA bundle. If a
  machine needs a custom CA, calls fail with `CERTIFICATE_VERIFY_FAILED`; fix it
  by trusting the system store (`truststore.inject_into_ssl()` at startup), never
  by disabling verification.

### 10.3 `massive_client.py`

```python
# backend/app/market/massive_client.py
"""Market data source backed by the Massive (formerly Polygon.io) REST API."""

import asyncio
import contextlib
import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from massive import RESTClient
from massive.exceptions import BadResponse

from .cache import PriceCache
from .interface import MarketDataSource
from .models import Quote

logger = logging.getLogger(__name__)

MARKET_TZ = ZoneInfo("America/New_York")


def quote_from_snapshot(snap) -> Quote | None:
    """Build a Quote from a TickerSnapshot, or None if it carries no usable price.

    Price falls back last trade -> latest minute bar -> today's bar -> previous
    close, because snapshot fields are empty early in the day. The reference
    price is the previous close, so day change % is a true daily change.
    """
    trade, minute, day, prev = snap.last_trade, snap.min, snap.day, snap.prev_day
    prev_close = prev.close if prev and prev.close else None
    price = (
        (trade.price if trade else None)
        or (minute.close if minute else None)
        or (day.close if day else None)
        or prev_close
    )
    if not snap.ticker or not price:
        return None
    ns = (trade.sip_timestamp if trade else None) or snap.updated
    return Quote(snap.ticker, price, ns / 1e9 if ns else None, prev_close)


def quote_from_daily_bar(bar) -> Quote | None:
    """Build a Quote from a Grouped Daily bar. Reference is the session open."""
    if not bar.ticker or not bar.close:
        return None
    return Quote(bar.ticker, bar.close, bar.timestamp / 1000 if bar.timestamp else None, bar.open or None)


def fetch_latest_closes(client: RESTClient, today: date, max_days_back: int = 7) -> dict[str, Quote]:
    """Closes for every US stock from the most recent completed trading day.

    Starts at the day before `today` (the free plan cannot read the current
    session) and walks back over weekends and holidays. One API call per day tried.
    """
    day = today - timedelta(days=1)
    for _ in range(max_days_back):
        bars = client.get_grouped_daily_aggs(day.isoformat(), adjusted=True)
        if bars:
            return {q.ticker: q for bar in bars if (q := quote_from_daily_bar(bar))}
        day -= timedelta(days=1)
    return {}


def is_not_authorized(error: BadResponse) -> bool:
    """True when Massive refused the request because the plan lacks the endpoint."""
    return "NOT_AUTHORIZED" in str(error)


class MassiveDataSource(MarketDataSource):
    """Polls Massive for the tracked tickers and writes prices to the PriceCache.

    Paid plans: one Snapshot call for all tracked tickers every `interval` seconds.
    Free plan: Snapshot returns NOT_AUTHORIZED, detected on the first call; the
    source then switches permanently to end-of-day closes from one Grouped Daily
    call, refreshed every `eod_interval` seconds.

    The synchronous client runs in a worker thread and only returns data; all
    cache writes happen back on the event loop.
    """

    name = "massive"

    def __init__(
        self,
        cache: PriceCache,
        api_key: str | None = None,
        interval: float = 5.0,
        eod_interval: float = 900.0,
        client: RESTClient | None = None,
    ) -> None:
        self.cache = cache
        self.client = client or RESTClient(api_key=api_key)
        self.interval = interval
        self.eod_interval = eod_interval
        self.eod_mode = False
        self._eod_quotes: dict[str, Quote] = {}
        self._tickers: set[str] = set()
        self._lock = asyncio.Lock()  # one Massive request sequence at a time
        self._task: asyncio.Task | None = None

    async def start(self, tickers: list[str]) -> None:
        self._tickers.update(tickers)
        await self._refresh(refresh_eod=True)  # errors propagate: a bad key fails startup
        if self._task is None:
            self._task = asyncio.create_task(self._run(), name="massive-poller")

    async def stop(self) -> None:
        task, self._task = self._task, None
        if task:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task

    async def add_ticker(self, ticker: str) -> None:
        if ticker in self._tickers:
            return
        self._tickers.add(ticker)
        # Free plan: served from the closes already in memory, no API call.
        await self._refresh([ticker], refresh_eod=not self._eod_quotes)

    async def remove_ticker(self, ticker: str) -> None:
        self._tickers.discard(ticker)
        self.cache.remove(ticker)

    def get_tickers(self) -> list[str]:
        return sorted(self._tickers)

    async def _run(self) -> None:
        """Poll until cancelled. Errors are logged and the next poll retries."""
        while True:
            await asyncio.sleep(self.eod_interval if self.eod_mode else self.interval)
            try:
                await self._refresh(refresh_eod=True)
            except Exception:
                logger.exception("Massive poll failed")

    async def _refresh(self, tickers: list[str] | None = None, refresh_eod: bool = False) -> None:
        """Fetch quotes for `tickers` (default: all tracked) and write them to the cache."""
        async with self._lock:
            wanted = sorted(tickers if tickers is not None else self._tickers)
            if not wanted:
                return
            quotes = await self._fetch(wanted, refresh_eod)
            # A ticker removed while the request was in flight must not reappear.
            self.cache.update_many(q for q in quotes if q.ticker in self._tickers)

    async def _fetch(self, tickers: list[str], refresh_eod: bool) -> list[Quote]:
        """Quotes from Snapshot, or from end-of-day closes on a free plan."""
        if not self.eod_mode:
            try:
                snapshots = await asyncio.to_thread(self.client.get_snapshot_all, "stocks", tickers=tickers)
                return [q for snap in snapshots if (q := quote_from_snapshot(snap))]
            except BadResponse as e:
                if not is_not_authorized(e):
                    raise
                logger.warning("Massive key has no snapshot access; using end-of-day prices")
                self.eod_mode = True
                refresh_eod = True
        if refresh_eod:
            today = datetime.now(MARKET_TZ).date()
            self._eod_quotes = await asyncio.to_thread(fetch_latest_closes, self.client, today)
        return [self._eod_quotes[t] for t in tickers if t in self._eod_quotes]
```

---

## 11. Factory and service

### 11.1 `factory.py`

The only module that reads market data environment variables. Empty or
whitespace-only `MASSIVE_API_KEY` means the simulator (PLAN §5). The Massive
module is imported only when it is used.

```python
# backend/app/market/factory.py
"""Chooses the market data source from the environment."""

import logging
import os

from .cache import PriceCache
from .interface import MarketDataSource
from .simulator import SimulatorDataSource

logger = logging.getLogger(__name__)


def create_market_data_source(cache: PriceCache) -> MarketDataSource:
    """Massive if MASSIVE_API_KEY is set and non-empty, otherwise the simulator."""
    api_key = os.environ.get("MASSIVE_API_KEY", "").strip()
    if not api_key:
        logger.info("Market data: simulator")
        return SimulatorDataSource(cache)

    from .massive_client import MassiveDataSource  # only import the client when used

    interval = max(1.0, float(os.environ.get("MASSIVE_POLL_INTERVAL", "5")))
    logger.info("Market data: Massive API, polling every %.0fs", interval)
    return MassiveDataSource(cache, api_key, interval=interval)
```

### 11.2 `service.py`

`track` is the single entry point for "make sure this ticker has a price": it
normalizes, asks the source to add it, and if no price arrives, rolls back the add
(unless the ticker was already tracked) and raises `UnknownTickerError`.

```python
# backend/app/market/service.py
"""MarketDataService: the one object the rest of the backend uses for prices."""

from collections.abc import Iterable

from .cache import PriceCache
from .factory import create_market_data_source
from .interface import MarketDataSource
from .models import PriceUpdate
from .tickers import UnknownTickerError, normalize_ticker


class MarketDataService:
    """Facade over the PriceCache and the active MarketDataSource.

    Reads never touch the network. Deciding *which* tickers to track
    (watchlist ∪ open positions) is the caller's job.
    """

    def __init__(self, cache: PriceCache, source: MarketDataSource) -> None:
        self.cache = cache
        self.source = source

    @property
    def mode(self) -> str:
        """'simulator' or 'massive'."""
        return self.source.name

    async def start(self, tickers: Iterable[str]) -> None:
        """Start the source with the initial tickers (malformed ones are skipped)."""
        valid = []
        for raw in tickers:
            try:
                valid.append(normalize_ticker(raw))
            except ValueError:
                continue
        await self.source.start(sorted(set(valid)))

    async def stop(self) -> None:
        await self.source.stop()

    # --- reads (no I/O) ---

    def get(self, ticker: str) -> PriceUpdate | None:
        return self.cache.get(ticker.strip().upper())

    def get_price(self, ticker: str) -> float | None:
        return self.cache.get_price(ticker.strip().upper())

    def get_all(self) -> dict[str, PriceUpdate]:
        return self.cache.get_all()

    def tracked(self) -> list[str]:
        return self.source.get_tickers()

    # --- tracking ---

    async def track(self, raw_ticker: str) -> PriceUpdate:
        """Start tracking a ticker and return its current price.

        Raises InvalidTickerError for a malformed symbol and UnknownTickerError
        when the source has no price for it (always the case for symbols Massive
        does not know; the simulator prices any well-formed symbol).
        """
        ticker = normalize_ticker(raw_ticker)
        already_tracked = ticker in self.source.get_tickers()
        await self.source.add_ticker(ticker)
        update = self.cache.get(ticker)
        if update is None:
            if not already_tracked:
                await self.source.remove_ticker(ticker)
            raise UnknownTickerError(f"No price available for {ticker}")
        return update

    async def untrack(self, raw_ticker: str) -> None:
        """Stop tracking a ticker. Call only when it is neither watched nor held."""
        await self.source.remove_ticker(raw_ticker.strip().upper())


def create_market_data_service() -> MarketDataService:
    """Build the service with the source selected by MASSIVE_API_KEY."""
    cache = PriceCache()
    return MarketDataService(cache, create_market_data_source(cache))
```

---

## 12. SSE stream: `stream.py`

### 12.1 Wire format (resolves review item 3)

```
retry: 1000

data: {"AAPL":{"ticker":"AAPL","price":190.0,"previous_price":190.01,"reference_price":190.0,"timestamp":1791080910.70,"change":-0.01,"direction":"down","day_change":0.0,"day_change_percent":0.0},"AMZN":{...},...}

data: {...}

: keep-alive

```

(Captured from the running app, abridged.)

Rules:

1. `retry: 1000` first, so a dropped connection reconnects after 1 s.
2. A full snapshot immediately on connect, then **one event per cache change**:
   every 500 ms with the simulator, on each poll that changed something with
   Massive. Events are unnamed, so the browser receives them in
   `EventSource.onmessage`.
3. **Every event is a full snapshot** of all tracked tickers, keyed by ticker.
   A ticker missing from an event is no longer tracked; the frontend drops it.
4. An SSE comment (`: keep-alive`) after 15 s without changes (Massive free plan,
   closed market) stops proxies from closing an idle connection. `EventSource`
   ignores comments.

Because events are full snapshots, unchanged tickers appear in every event. The
frontend should append a sparkline point and flash only when a ticker's
`timestamp` differs from the last one it saw.

### 12.2 Code

`price_events` takes an `is_disconnected` callable instead of the `Request`, so
tests drive it without an HTTP server. When a client disconnects, Starlette
cancels the generator or fails its next write (depending on the ASGI server), so
a dead stream lives at most until the next tick or heartbeat.

```python
# backend/app/market/stream.py
"""SSE endpoint that streams the PriceCache to browsers."""

import json
from collections.abc import AsyncIterator, Awaitable, Callable

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from .cache import PriceCache

HEARTBEAT_SECONDS = 15.0


def format_prices_event(cache: PriceCache) -> str:
    """One SSE `data:` event carrying every cached ticker."""
    payload = {ticker: update.to_dict() for ticker, update in cache.get_all().items()}
    return f"data: {json.dumps(payload, separators=(',', ':'))}\n\n"


async def price_events(
    cache: PriceCache,
    is_disconnected: Callable[[], Awaitable[bool]],
    heartbeat: float = HEARTBEAT_SECONDS,
) -> AsyncIterator[str]:
    """Yield a full snapshot on connect and after every cache change.

    Sends an SSE comment as a keep-alive when nothing changes for `heartbeat`
    seconds (Massive free plan, closed market) so proxies keep the connection open.
    """
    yield "retry: 1000\n\n"
    version = -1
    while not await is_disconnected():
        new_version = await cache.wait_for_change(version, timeout=heartbeat)
        if new_version == version:
            yield ": keep-alive\n\n"
            continue
        version = new_version
        yield format_prices_event(cache)


def create_stream_router(cache: PriceCache) -> APIRouter:
    """Router exposing GET /api/stream/prices."""
    router = APIRouter()

    @router.get("/api/stream/prices")
    async def stream_prices(request: Request) -> StreamingResponse:
        return StreamingResponse(
            price_events(cache, request.is_disconnected),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    return router
```

### 12.3 Frontend consumption (contract example)

```typescript
type Direction = "up" | "down" | "flat";

interface PriceUpdate {
  ticker: string;
  price: number;
  previous_price: number;
  reference_price: number;
  timestamp: number; // Unix seconds
  change: number;
  direction: Direction;
  day_change: number;
  day_change_percent: number; // percent
}

type PricesEvent = Record<string, PriceUpdate>;

const lastSeen = new Map<string, number>();
const source = new EventSource("/api/stream/prices");

source.onopen = () => setConnection("connected");
source.onerror = () =>
  setConnection(source.readyState === EventSource.CLOSED ? "disconnected" : "reconnecting");

source.onmessage = (event: MessageEvent<string>) => {
  const prices: PricesEvent = JSON.parse(event.data);
  for (const update of Object.values(prices)) {
    if (lastSeen.get(update.ticker) === update.timestamp) continue; // unchanged ticker
    lastSeen.set(update.ticker, update.timestamp);
    appendSparklinePoint(update.ticker, update.timestamp, update.price);
    if (update.direction !== "flat") flash(update.ticker, update.direction);
  }
  setPrices(prices); // full replace: tickers missing here are no longer tracked
};
```

---

## 13. FastAPI wiring: `main.py`

Only the market data parts are shown. The service is created at import time
(so the SSE router can be included) and started in the lifespan.
`load_tracked_tickers` is a stub until the database exists; the real version
returns watchlist ∪ open positions from SQLite.

```python
# backend/app/main.py (market data parts)
"""FastAPI app (market data parts only)."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.market import create_market_data_service, create_stream_router

logging.basicConfig(level=logging.INFO)

DEFAULT_TICKERS = ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA", "NVDA", "META", "JPM", "V", "NFLX"]

market = create_market_data_service()


def load_tracked_tickers() -> list[str]:
    """Watchlist ∪ open positions. Stubbed until the database exists."""
    return DEFAULT_TICKERS


@asynccontextmanager
async def lifespan(app: FastAPI):
    await market.start(load_tracked_tickers())
    app.state.market = market
    yield
    await market.stop()


app = FastAPI(lifespan=lifespan)
app.include_router(create_stream_router(market.cache))


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok", "market_data": market.mode, "tickers": len(market.tracked())}
```

Other routers get the service from `request.app.state.market`:

```python
from fastapi import Request

from app.market import MarketDataService


def get_market(request: Request) -> MarketDataService:
    """FastAPI dependency: the running MarketDataService."""
    return request.app.state.market
```

---

## 14. Integration: the tracked-ticker rule

Resolves review item 1:

> **tracked tickers = watchlist ∪ tickers with an open position**

The watchlist and portfolio code enforce it, because only they know both sets:

| Event | Call |
|---|---|
| Startup | `await market.start(watchlist ∪ positions)` |
| Ticker added to watchlist | `await market.track(t)`: 400 on error, otherwise insert the row |
| Ticker removed from watchlist | Delete the row; `await market.untrack(t)` only if no open position |
| Buy (any ticker, watched or not) | `update = await market.track(t)` then fill at `update.price` |
| Sell | `market.get_price(t)` (a held ticker is always tracked) |
| Position closed (quantity reaches 0) | `await market.untrack(t)` only if not on the watchlist |

Buying an unwatched ticker starts tracking it, so it streams and is valued like
any other holding, but it does not join the watchlist (PLAN review item 5 is for
the portfolio agent to confirm).

Illustrative route code (the `db` calls are placeholders for the database layer):

```python
# backend/app/routes/watchlist.py (sketch)
from fastapi import APIRouter, Depends, HTTPException

from app.market import InvalidTickerError, MarketDataService, UnknownTickerError, normalize_ticker

router = APIRouter()


@router.post("/api/watchlist", status_code=201)
async def add_ticker(body: AddTickerRequest, market: MarketDataService = Depends(get_market)) -> dict:
    try:
        update = await market.track(body.ticker)
    except (InvalidTickerError, UnknownTickerError) as e:
        raise HTTPException(400, str(e)) from e
    db.add_to_watchlist(update.ticker)
    return update.to_dict()


@router.delete("/api/watchlist/{ticker}")
async def remove_ticker(ticker: str, market: MarketDataService = Depends(get_market)) -> dict:
    try:
        ticker = normalize_ticker(ticker)
    except InvalidTickerError as e:
        raise HTTPException(400, str(e)) from e
    if not db.remove_from_watchlist(ticker):
        raise HTTPException(404, f"{ticker} is not on the watchlist")
    if not db.has_open_position(ticker):
        await market.untrack(ticker)
    return {"ticker": ticker, "removed": True}
```

```python
# backend/app/portfolio/trading.py (sketch, price lookup only)
async def execute_trade(market: MarketDataService, ticker: str, side: str, quantity: float) -> Trade:
    try:
        update = await market.track(ticker)  # no-op if already tracked; raises if no price
    except (InvalidTickerError, UnknownTickerError) as e:
        raise TradeError(str(e)) from e
    price = update.price
    ...  # validate cash or shares, update position, record trade and snapshot
    if remaining_quantity == 0 and not db.is_on_watchlist(update.ticker):
        await market.untrack(update.ticker)
```

Portfolio valuation reads `market.get_price(t)`; if it is ever `None` (only
possible during a Massive outage at startup), fall back to `avg_cost` so totals
stay defined. The chat context uses `market.get_all()` for the watchlist with live
prices.

---

## 15. Configuration

| Variable | Default | Effect |
|---|---|---|
| `MASSIVE_API_KEY` | empty | Empty or whitespace: simulator. Anything else: Massive |
| `MASSIVE_POLL_INTERVAL` | `5` | Paid-plan poll interval in seconds (minimum 1). Use 2-15 depending on plan. Ignored on the free plan, which refreshes every 15 min |

Fixed in code (constructor arguments, so tests can override them): simulator tick
0.5 s, event probability 0.001, free-plan refresh 900 s, SSE heartbeat 15 s, SSE
client retry 1 s.

---

## 16. Error handling and edge cases

| Situation | Behaviour |
|---|---|
| Malformed ticker (`"A B"`, `"$$$"`, `""`) | `InvalidTickerError`, route returns 400. Skipped (not fatal) in `start()` |
| Unknown ticker, simulator | Accepted at a random $50-$300 |
| Unknown ticker, Massive | `UnknownTickerError`, tracking rolled back, route returns 400 |
| Bad Massive key, network down or TLS failure at startup | Exception from `start()`; app fails to start with the error in the log |
| Massive error after startup (network, 5xx, 429 after retries) | Logged; cached prices stay; next poll retries |
| Massive free plan | Detected automatically; end-of-day closes; warning logged once |
| Weekend or holiday on the free plan | Walks back to the last trading day (at most 7 days) |
| Ticker removed during an in-flight poll | Its quote is discarded; it does not reappear |
| Price unchanged between polls | No cache write, no SSE event; keep-alive comment every 15 s |
| Simulator step raises | Logged; next tick continues |
| Client disconnects from SSE | Generator cancelled by Starlette or ends on the next `is_disconnected` check |
| `stop()` twice, or before `start()` | No-op |
| Zero tracked tickers | Simulator returns `{}` per step; Massive skips the poll; SSE sends `{}` once |

---

## 17. Tests

`pytest` with `asyncio_mode = "auto"`. No network, no API key; runs in about two
seconds.

### `tests/market/test_cache.py`

```python
# backend/tests/market/test_cache.py
import asyncio

from app.market.cache import PriceCache
from app.market.models import Quote


def test_first_update_is_flat_and_sets_reference():
    cache = PriceCache()
    u = cache.update(Quote("AAPL", 190.123, 1.0))
    assert u.price == 190.12
    assert u.previous_price == 190.12
    assert u.reference_price == 190.12
    assert u.direction == "flat"
    assert cache.version == 1


def test_second_update_sets_direction_and_keeps_reference():
    cache = PriceCache()
    cache.update(Quote("AAPL", 190.0, 1.0))
    u = cache.update(Quote("AAPL", 191.0, 2.0))
    assert (u.previous_price, u.direction, u.change) == (190.0, "up", 1.0)
    assert u.reference_price == 190.0
    assert u.day_change_percent == round((191 / 190 - 1) * 100, 4)


def test_explicit_reference_price_wins():
    cache = PriceCache()
    u = cache.update(Quote("AAPL", 191.0, 1.0, reference_price=190.584))
    assert u.reference_price == 190.58


def test_identical_quote_is_ignored():
    cache = PriceCache()
    cache.update(Quote("AAPL", 190.0, 1.0, 189.0))
    assert cache.update(Quote("AAPL", 190.0, 1.0, 189.0)) is None
    assert cache.version == 1


def test_update_many_bumps_version_once():
    cache = PriceCache()
    changed = cache.update_many([Quote("AAPL", 1.0), Quote("MSFT", 2.0)])
    assert set(changed) == {"AAPL", "MSFT"}
    assert cache.version == 1


def test_remove_bumps_version_only_when_present():
    cache = PriceCache()
    cache.update(Quote("AAPL", 1.0))
    cache.remove("AAPL")
    cache.remove("AAPL")
    assert cache.version == 2
    assert cache.get("AAPL") is None


async def test_wait_for_change_wakes_on_update_and_times_out():
    cache = PriceCache()
    waiter = asyncio.create_task(cache.wait_for_change(0, timeout=5))
    await asyncio.sleep(0)
    cache.update(Quote("AAPL", 1.0))
    assert await waiter == 1
    assert await cache.wait_for_change(1, timeout=0.01) == 1
```

### `tests/market/test_simulator.py`

Statistical tests use 20,000 steps of `dt = 1/252` with a fixed seed, so they are
deterministic and their tolerances are wide enough to survive parameter tweaks.

```python
# backend/tests/market/test_simulator.py
import asyncio

import numpy as np
import pytest

from app.market import simulator as sim_mod
from app.market.cache import PriceCache
from app.market.simulator import GBMSimulator, SimulatorDataSource, pair_correlation

TECH = ["AAPL", "MSFT"]


def log_returns(sim: GBMSimulator, steps: int) -> dict[str, np.ndarray]:
    path = {t: [sim.prices[t]] for t in sim.tickers}
    for _ in range(steps):
        for t, p in sim.step().items():
            path[t].append(p)
    return {t: np.diff(np.log(v)) for t, v in path.items()}


def test_prices_stay_positive():
    sim = GBMSimulator(["TSLA", "NVDA"], seed=1, event_probability=0.01)
    for _ in range(10_000):
        assert all(p > 0 for p in sim.step().values())


def test_volatility_matches_sigma():
    sim = GBMSimulator(["AAPL", "TSLA", "JPM"], dt=1 / 252, event_probability=0, seed=2)
    r = log_returns(sim, 20_000)
    for ticker, sigma in [("AAPL", 0.22), ("TSLA", 0.50), ("JPM", 0.18)]:
        assert r[ticker].std() * np.sqrt(252) == pytest.approx(sigma, rel=0.05)


def test_drift_matches_mu(monkeypatch):
    monkeypatch.setitem(sim_mod.TICKER_PARAMS, "AAPL", (0.05, 1e-9))
    sim = GBMSimulator(["AAPL"], dt=1.0, event_probability=0, seed=3)
    assert sim.step()["AAPL"] == pytest.approx(190 * np.exp(0.05), rel=1e-6)


def test_correlations():
    sim = GBMSimulator(["AAPL", "MSFT", "JPM", "TSLA"], dt=1 / 252, event_probability=0, seed=4)
    r = log_returns(sim, 20_000)

    def corr(a: str, b: str) -> float:
        return np.corrcoef(r[a], r[b])[0, 1]

    assert corr("AAPL", "MSFT") == pytest.approx(0.6, abs=0.05)
    assert corr("AAPL", "JPM") == pytest.approx(0.3, abs=0.05)
    assert corr("AAPL", "TSLA") == pytest.approx(0.3, abs=0.05)


def test_pair_correlation_table():
    assert pair_correlation("AAPL", "AAPL") == 1.0
    assert pair_correlation("AAPL", "NVDA") == 0.6
    assert pair_correlation("JPM", "V") == 0.5
    assert pair_correlation("TSLA", "AAPL") == pair_correlation("AAPL", "TSLA") == 0.3
    assert pair_correlation("ZZZZ", "AAPL") == 0.3


def test_events_move_2_to_5_percent():
    sim = GBMSimulator(TECH, event_probability=1.0, seed=5)
    before = dict(sim.prices)
    after = sim.step()
    for t in TECH:
        move = abs(after[t] / before[t] - 1)
        assert 0.019 < move < 0.051


def test_ticker_management():
    sim = GBMSimulator(seed=6)
    assert sim.step() == {}
    sim.add_ticker("AAPL")
    sim.add_ticker("AAPL")
    assert sim.tickers == ["AAPL"]
    assert 50 <= sim.add_ticker("ZZZZ") <= 300
    sim.remove_ticker("NOPE")
    sim.remove_ticker("AAPL")
    assert list(sim.step()) == ["ZZZZ"]


async def test_source_seeds_cache_then_ticks():
    cache = PriceCache()
    source = SimulatorDataSource(cache, interval=0.01)
    await source.start(["AAPL", "MSFT"])
    assert cache.get_price("AAPL") == 190.0
    version = cache.version
    await asyncio.sleep(0.1)
    assert cache.version > version
    await source.add_ticker("PYPL")
    assert cache.get_price("PYPL") is not None
    await source.remove_ticker("MSFT")
    assert cache.get("MSFT") is None
    assert source.get_tickers() == ["AAPL", "PYPL"]
    await source.stop()
    await source.stop()
```

### `tests/market/test_massive.py`

`StubClient` replaces `massive.RESTClient` and returns the client's real model
objects (`TickerSnapshot.from_dict`, `GroupedDailyAgg.from_dict`), so parsing is
tested against the true attribute names.

```python
# backend/tests/market/test_massive.py
import asyncio
from datetime import date

import pytest
from massive.exceptions import BadResponse
from massive.rest.models import GroupedDailyAgg, TickerSnapshot

from app.market.cache import PriceCache
from app.market.massive_client import MassiveDataSource, fetch_latest_closes, quote_from_snapshot

NOT_AUTHORIZED = '{"status":"NOT_AUTHORIZED","request_id":"x","message":"You are not entitled to this data."}'


def snapshot(ticker, last=None, prev=None, day=None, ts=1_759_507_199_123_456_789):
    d = {"ticker": ticker, "updated": ts}
    if last is not None:
        d["lastTrade"] = {"p": last, "s": 100, "t": ts}
    if prev is not None:
        d["prevDay"] = {"o": prev, "h": prev, "l": prev, "c": prev, "v": 1}
    if day is not None:
        d["day"] = {"o": day, "h": day, "l": day, "c": day, "v": 1}
    return TickerSnapshot.from_dict(d)


def bar(ticker, close, open_=None):
    return GroupedDailyAgg.from_dict({"T": ticker, "o": open_ or close, "c": close, "t": 1_759_435_200_000})


class StubClient:
    """Stands in for massive.RESTClient. `market` maps ticker -> (last, prev_close)."""

    def __init__(self, market=None, free=False, bars_by_date=None):
        self.market = market or {}
        self.free = free
        self.bars_by_date = bars_by_date or {}
        self.calls = []

    def get_snapshot_all(self, market_type, tickers=None):
        self.calls.append(("snapshot", tuple(tickers)))
        if self.free:
            raise BadResponse(NOT_AUTHORIZED)
        return [snapshot(t, *self.market[t]) for t in tickers if t in self.market]

    def get_grouped_daily_aggs(self, day, adjusted=True):
        self.calls.append(("grouped", day))
        return self.bars_by_date.get(day, [])


def test_quote_from_snapshot_fallbacks():
    q = quote_from_snapshot(snapshot("AAPL", last=191.9, prev=190.58))
    assert (q.price, q.reference_price) == (191.9, 190.58)
    assert q.timestamp == pytest.approx(1_759_507_199.123, abs=1e-3)
    assert quote_from_snapshot(snapshot("AAPL", day=191.0, prev=190.0)).price == 191.0
    assert quote_from_snapshot(snapshot("AAPL", prev=190.0)).price == 190.0
    assert quote_from_snapshot(snapshot("AAPL")) is None


async def test_paid_plan_polls_snapshot():
    cache = PriceCache()
    client = StubClient({"AAPL": (191.9, 190.58), "MSFT": (420.5, 418.0)})
    source = MassiveDataSource(cache, client=client, interval=0.01)
    await source.start(["AAPL", "MSFT"])
    aapl = cache.get("AAPL")
    assert (aapl.price, aapl.reference_price) == (191.9, 190.58)
    assert aapl.day_change_percent == pytest.approx(0.6926, abs=1e-4)
    client.market["AAPL"] = (192.5, 190.58)
    await asyncio.sleep(0.05)
    assert cache.get("AAPL").direction == "up"
    assert not source.eod_mode
    await source.stop()


async def test_unknown_ticker_gets_no_price():
    cache = PriceCache()
    source = MassiveDataSource(cache, client=StubClient({"AAPL": (191.9, 190.58)}))
    await source.start(["AAPL"])
    await source.add_ticker("ZZZZ")
    assert cache.get("ZZZZ") is None
    await source.stop()


def test_latest_closes_walks_back_over_weekend():
    # Monday 2026-10-05: Sunday and Saturday have no data, Friday does.
    client = StubClient(bars_by_date={"2026-10-02": [bar("AAPL", 190.58, 188.0), bar("PYPL", 70.0)]})
    quotes = fetch_latest_closes(client, date(2026, 10, 5))
    assert client.calls == [("grouped", "2026-10-04"), ("grouped", "2026-10-03"), ("grouped", "2026-10-02")]
    assert (quotes["AAPL"].price, quotes["AAPL"].reference_price) == (190.58, 188.0)


async def test_free_plan_end_to_end():
    cache = PriceCache()
    bars = [bar("AAPL", 190.58, 188.0), bar("PYPL", 70.0)]
    client = StubClient(free=True, bars_by_date={d: bars for d in [f"2026-10-0{i}" for i in range(1, 10)]})
    source = MassiveDataSource(cache, client=client)
    await source.start(["AAPL"])
    assert source.eod_mode
    aapl = cache.get("AAPL")
    assert (aapl.price, aapl.reference_price) == (190.58, 188.0)
    calls = len(client.calls)
    await source.add_ticker("PYPL")  # served from memory
    assert cache.get_price("PYPL") == 70.0
    assert len(client.calls) == calls
    await source.stop()


async def test_other_bad_response_propagates_from_start():
    class BadKey(StubClient):
        def get_snapshot_all(self, market_type, tickers=None):
            raise BadResponse('{"status":"ERROR","error":"Unknown API Key"}')

    source = MassiveDataSource(PriceCache(), client=BadKey())
    with pytest.raises(BadResponse):
        await source.start(["AAPL"])


async def test_removed_ticker_not_rewritten_by_inflight_poll():
    cache = PriceCache()
    gate = asyncio.Event()

    class Slow(StubClient):
        def get_snapshot_all(self, market_type, tickers=None):
            asyncio.run_coroutine_threadsafe(gate.wait(), loop).result()
            return super().get_snapshot_all(market_type, tickers)

    loop = asyncio.get_running_loop()
    source = MassiveDataSource(cache, client=Slow({"AAPL": (1.0, 1.0)}))
    source._tickers = {"AAPL"}
    poll = asyncio.create_task(source._refresh())
    await asyncio.sleep(0.05)
    await source.remove_ticker("AAPL")
    gate.set()
    await poll
    assert cache.get("AAPL") is None


async def test_poll_errors_do_not_kill_loop():
    cache = PriceCache()

    class Flaky(StubClient):
        n = 0

        def get_snapshot_all(self, market_type, tickers=None):
            self.n += 1
            if self.n == 2:
                raise ConnectionError("boom")
            return super().get_snapshot_all(market_type, tickers)

    client = Flaky({"AAPL": (1.0, 1.0)})
    source = MassiveDataSource(cache, client=client, interval=0.01)
    await source.start(["AAPL"])
    await asyncio.sleep(0.1)
    assert client.n > 3
    await source.stop()
```

### `tests/market/test_service_stream.py`

```python
# backend/tests/market/test_service_stream.py
import asyncio
import json

import pytest

from app.market import InvalidTickerError, MarketDataService, PriceCache, UnknownTickerError
from app.market.factory import create_market_data_source
from app.market.massive_client import MassiveDataSource
from app.market.simulator import SimulatorDataSource
from app.market.stream import price_events
from app.market.tickers import normalize_ticker

from .test_massive import StubClient


@pytest.mark.parametrize("value", [None, "", "   "])
def test_factory_uses_simulator_without_key(monkeypatch, value):
    if value is None:
        monkeypatch.delenv("MASSIVE_API_KEY", raising=False)
    else:
        monkeypatch.setenv("MASSIVE_API_KEY", value)
    assert isinstance(create_market_data_source(PriceCache()), SimulatorDataSource)


def test_factory_uses_massive_with_key(monkeypatch):
    monkeypatch.setenv("MASSIVE_API_KEY", "abc")
    monkeypatch.setenv("MASSIVE_POLL_INTERVAL", "2")
    source = create_market_data_source(PriceCache())
    assert isinstance(source, MassiveDataSource) and source.interval == 2.0


@pytest.mark.parametrize("raw,expected", [(" aapl ", "AAPL"), ("brk.b", "BRK.B")])
def test_normalize_ticker(raw, expected):
    assert normalize_ticker(raw) == expected


@pytest.mark.parametrize("raw", ["", "1ABC", "AAPL!", "TOOLONGTICKER", "A B"])
def test_normalize_ticker_rejects(raw):
    with pytest.raises(InvalidTickerError):
        normalize_ticker(raw)


async def test_service_track_with_simulator():
    cache = PriceCache()
    market = MarketDataService(cache, SimulatorDataSource(cache, interval=60))
    await market.start(["aapl", "bad ticker!", "MSFT"])
    assert market.tracked() == ["AAPL", "MSFT"]
    update = await market.track(" pypl ")
    assert update.ticker == "PYPL" and market.get_price("pypl") == update.price
    with pytest.raises(InvalidTickerError):
        await market.track("$$$")
    await market.untrack("PYPL")
    assert market.get("PYPL") is None
    await market.stop()


async def test_service_rejects_unknown_ticker_with_massive():
    cache = PriceCache()
    market = MarketDataService(cache, MassiveDataSource(cache, client=StubClient({"AAPL": (1.0, 1.0)})))
    await market.start(["AAPL"])
    with pytest.raises(UnknownTickerError):
        await market.track("ZZZZ")
    assert market.tracked() == ["AAPL"]
    await market.stop()


async def test_price_events_sends_retry_snapshot_changes_and_heartbeat():
    cache = PriceCache()
    from app.market.models import Quote

    cache.update(Quote("AAPL", 190.0, 1.0))
    connected = True

    async def is_disconnected():
        return not connected

    events = price_events(cache, is_disconnected, heartbeat=0.05)
    assert await anext(events) == "retry: 1000\n\n"
    first = await anext(events)
    assert first.startswith("data: ") and first.endswith("\n\n")
    payload = json.loads(first[6:])
    assert payload["AAPL"]["price"] == 190.0 and payload["AAPL"]["direction"] == "flat"

    async def later():
        await asyncio.sleep(0.01)
        cache.update(Quote("AAPL", 191.0, 2.0))

    asyncio.create_task(later())
    second = json.loads((await anext(events))[6:])
    assert second["AAPL"]["direction"] == "up"
    assert await anext(events) == ": keep-alive\n\n"
    connected = False
    with pytest.raises(StopAsyncIteration):
        await anext(events)
```

---

## 18. Demo script: `market_data_demo.py`

A terminal check that the subsystem works, with no frontend. It uses the same
factory as the app, so with `MASSIVE_API_KEY` set it shows Massive prices.

```python
# backend/market_data_demo.py
"""Print live prices in the terminal. Uses Massive if MASSIVE_API_KEY is set.

Run from backend/:  uv run python market_data_demo.py
"""

import asyncio

from app.market import create_market_data_service

TICKERS = ["AAPL", "GOOGL", "MSFT", "TSLA", "NVDA", "JPM"]
ARROWS = {"up": "\033[32m▲\033[0m", "down": "\033[31m▼\033[0m", "flat": " "}


async def main(seconds: float = 10.0) -> None:
    market = create_market_data_service()
    await market.start(TICKERS)
    print(f"source: {market.mode}")
    loop = asyncio.get_running_loop()
    deadline = loop.time() + seconds
    version = -1
    while loop.time() < deadline:
        version = await market.cache.wait_for_change(version, timeout=1.0)
        prices = market.get_all()
        print("  ".join(f"{t} {u.price:8.2f}{ARROWS[u.direction]}" for t, u in sorted(prices.items())))
    await market.stop()


if __name__ == "__main__":
    asyncio.run(main())
```

Sample output (simulator, colours removed):

```
source: simulator
AAPL   190.00   GOOGL   175.00   JPM   195.00   MSFT   420.00   NVDA   800.00   TSLA   250.00
AAPL   190.00   GOOGL   175.00   JPM   194.99▼  MSFT   420.01▲  NVDA   800.03▲  TSLA   249.93▼
AAPL   189.99▼  GOOGL   174.98▼  JPM   195.00▲  MSFT   419.98▼  NVDA   799.94▼  TSLA   249.88▼
AAPL   190.00▲  GOOGL   175.01▲  JPM   195.01▲  MSFT   420.01▲  NVDA   800.03▲  TSLA   249.91▲
```

---

## 19. Implementation checklist

1. `uv init` in `backend/` and apply the `pyproject.toml` from section 3; `uv sync --extra dev`.
2. `models.py`, `tickers.py`, `cache.py`, `interface.py`, then `test_cache.py`.
3. `seed_prices.py`, `simulator.py`, then `test_simulator.py`.
4. `massive_client.py`, then `test_massive.py`.
5. `factory.py`, `service.py`, `stream.py`, `__init__.py`, then `test_service_stream.py`.
6. Market wiring in `app/main.py`; check `uv run uvicorn app.main:app --port 8000`,
   then `curl localhost:8000/api/health` and `curl -N localhost:8000/api/stream/prices`.
7. `market_data_demo.py`; `uv run python market_data_demo.py`.
8. `uv run pytest`, `uv run ruff check`, `uv run ruff format --check`.
9. Hand-off: the database agent replaces `load_tracked_tickers`; the watchlist and
   portfolio agents follow section 14.

---

## 20. Changes from the research documents

| Topic | `MARKET_INTERFACE.md` / `MARKET_SIMULATOR.md` | This design | Why |
|---|---|---|---|
| Downstream API | Routes use cache and source directly | `MarketDataService` facade with `track` / `untrack` | One object to inject; validation and rollback in one place |
| Ticker validation | Regex in prose; simulator does not upper-case | `normalize_ticker` used everywhere, typed exceptions | Consistent keys across cache, sources and DB |
| SSE trigger | Poll `cache.version` every 500 ms | `wait_for_change` wakes on every change | No aliasing: the 500 ms poll could merge or skip simulator ticks; lower latency |
| Cache writes | One version bump per ticker | `update_many`, one bump per tick or poll | One SSE event per tick |
| Stale Massive data | Rewritten every poll (always `flat`) | Identical quotes ignored | No pointless events; `previous_price` stays meaningful |
| Massive threading | Cache written from the worker thread; set iterated in the thread | Thread returns quotes; writes on the event loop | Avoids "set changed size" errors and enables asyncio notification |
| Removal race | In-flight poll could re-add a removed ticker | Writes filtered by the tracked set | Removed tickers stay removed |
| Massive `add_ticker` | Re-polls all tickers | Polls only the new ticker, under a lock | Fewer calls; no duplicate plan detection |
| Snapshot price fallback | `lastTrade` → `day.c` → `prevDay.c` | Adds `min.c` after `lastTrade` | Fresher price when `lastTrade` is absent (Starter plans) |
| Free-plan date | `date.today()` (container UTC) | Yesterday in `America/New_York` | Correct trading day near midnight UTC |
| Free-plan reference | Every write used the first price, so 0% change | Bar open | A non-zero, honest "session change" |
| SSE keep-alive | None | `: keep-alive` every 15 s | Proxies drop idle connections on the free plan |
| SSE payload | `day_change_percent` only | Adds `reference_price`, `day_change` | Frontend can show absolute and percent daily change |
| Source lifecycle | `stop()` cancels without awaiting; `start()` twice starts two tasks | Cancel and await; `start()` idempotent | Clean shutdown, no duplicate loops |
| Simulator loop errors | Task dies silently | Logged and continued | Stream cannot silently freeze |
| Paid poll interval | "2-15 s" vs "2-5 s" (review item 18) | `MASSIVE_POLL_INTERVAL`, default 5 s | One configurable value |
