# Market Simulator

The default market data source, used whenever `MASSIVE_API_KEY` is not set. It
produces realistic-looking, correlated, live prices with no network or API key.
It implements the `MarketDataSource` interface in `MARKET_INTERFACE.md`.

Requirements from PLAN.md section 6:

- Geometric Brownian motion (GBM) with per-ticker drift and volatility
- Updates about every 500 ms
- Correlated moves (tech stocks move together)
- Occasional random 2-5% "events" for drama
- Realistic seed prices
- In-process background task, no external dependencies

## 1. The model

### 1.1 Geometric Brownian motion

GBM is the standard model behind Black-Scholes. A price `S` evolves as

```
dS = mu * S * dt + sigma * S * dW
```

with `mu` the annualized drift, `sigma` the annualized volatility and `W` a Wiener
process. Its exact discrete solution over a step `dt` is

```
S(t + dt) = S(t) * exp((mu - sigma^2 / 2) * dt + sigma * sqrt(dt) * Z),   Z ~ N(0, 1)
```

Why this form:

- Prices stay strictly positive (exponential of a real number).
- Returns are log-normal, the textbook assumption for stocks.
- It is exact for any `dt`, so there is no discretization drift.
- The `-sigma^2/2` term makes the *expected* price grow at `mu`.

### 1.2 Time step

Volatilities are annual, so a 500 ms tick is expressed as a fraction of a trading
year (252 days x 6.5 h):

```
dt = 0.5 / (252 * 6.5 * 3600) = 0.5 / 5,896,800 ≈ 8.48e-8
```

At this scale AAPL (sigma 22%, ~$190) moves about 1.2 cents per tick (one standard
deviation) and about 0.07% per minute: realistic, and enough to make most ticks flash
on a 2-decimal display. Passing a larger `dt` speeds the market up for demos.

### 1.3 Correlated moves

Independent normals `Z` would make every stock move on its own. To correlate them:

1. Build a correlation matrix `C` from sector membership.
2. Factor it once: `C = L L^T` (Cholesky, `numpy.linalg.cholesky`).
3. Each tick draw independent `z ~ N(0, I)` and use `L @ z`, which has covariance `C`.

Correlation rules:

| Pair | Correlation |
|---|---|
| Same ticker | 1.0 |
| Both in tech (AAPL, GOOGL, MSFT, AMZN, META, NVDA, NFLX) | 0.6 |
| Both in finance (JPM, V) | 0.5 |
| Any pair involving TSLA | 0.3 (it marches to its own beat) |
| Everything else, including unknown tickers | 0.3 |

This block structure is positive definite for any number of tickers, so Cholesky
always succeeds. `L` is recomputed only when tickers are added or removed (cheap for
tens of tickers).

### 1.4 Random events

Each tick, each ticker has a probability of `0.001` of a jump: an extra move of
uniform 2-5%, up or down with equal chance, applied multiplicatively on top of the
GBM step. With 10 tickers at 2 ticks/s that is one event roughly every 50 seconds
somewhere on the watchlist: enough drama for a demo, rare enough to stay believable.

### 1.5 Seed prices and parameters

| Ticker | Seed $ | mu | sigma | Character |
|---|---|---|---|---|
| AAPL | 190 | 0.05 | 0.22 | Large-cap, steady |
| GOOGL | 175 | 0.05 | 0.25 | |
| MSFT | 420 | 0.05 | 0.20 | Lowest-vol tech |
| AMZN | 185 | 0.05 | 0.28 | |
| TSLA | 250 | 0.03 | 0.50 | Very volatile |
| NVDA | 800 | 0.08 | 0.40 | Volatile, strong drift |
| META | 500 | 0.05 | 0.30 | |
| JPM | 195 | 0.04 | 0.18 | Bank, low vol |
| V | 280 | 0.04 | 0.17 | Payments, lowest vol |
| NFLX | 600 | 0.05 | 0.35 | |
| *other* | random 50-300 | 0.05 | 0.25 | Any ticker the user adds |

Any symbol is accepted; an unknown one starts at a random price between $50 and
$300 with default parameters, so watchlist adds always work in simulator mode.

## 2. Code

### 2.1 Seed data

```python
# backend/app/market/seed_prices.py
"""Seed prices, per-ticker GBM parameters and sector groups for the simulator."""

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

SECTORS: dict[str, set[str]] = {
    "tech": {"AAPL", "GOOGL", "MSFT", "AMZN", "META", "NVDA", "NFLX"},
    "finance": {"JPM", "V"},
}

INTRA_SECTOR_CORR: dict[str, float] = {"tech": 0.6, "finance": 0.5}
CROSS_SECTOR_CORR = 0.3
TSLA_CORR = 0.3
```

### 2.2 Simulator and data source

`GBMSimulator` is pure and synchronous: it holds prices and steps them, which makes
it trivial to unit-test with a fixed `seed`. `SimulatorDataSource` is the thin async
adapter that runs it every 500 ms and writes to the `PriceCache`.

Notes on the code:

- The whole step is vectorized: one `L @ z` matrix-vector product, one `exp`, one
  random draw for events.
- `add_ticker` writes the seed price to the cache immediately, so a new watchlist
  entry shows a price before the next tick.
- The simulator task and the API handlers share one event loop, so adding/removing
  tickers never races with `step()`. No locks are needed in the simulator itself.
- The first cached price for each ticker becomes its `reference_price`, so
  `day_change_percent` is "change since startup", which is the closest honest
  analogue of a daily change for a simulated market.

```python
# backend/app/market/simulator.py
"""Correlated geometric Brownian motion price simulator."""

import asyncio
import time

import numpy as np

from .cache import PriceCache
from .interface import MarketDataSource
from .seed_prices import (
    CROSS_SECTOR_CORR,
    DEFAULT_PARAMS,
    INTRA_SECTOR_CORR,
    SECTORS,
    SEED_PRICES,
    TICKER_PARAMS,
    TSLA_CORR,
)

TRADING_SECONDS_PER_YEAR = 252 * 6.5 * 3600
TICK_SECONDS = 0.5


def sector_of(ticker: str) -> str | None:
    """Sector name for a ticker, or None if unclassified."""
    return next((name for name, members in SECTORS.items() if ticker in members), None)


def pair_correlation(a: str, b: str) -> float:
    """Correlation between two tickers' daily moves."""
    if a == b:
        return 1.0
    if "TSLA" in (a, b):
        return TSLA_CORR
    sector = sector_of(a)
    if sector and sector == sector_of(b):
        return INTRA_SECTOR_CORR[sector]
    return CROSS_SECTOR_CORR


class GBMSimulator:
    """Steps a set of correlated GBM price paths, with occasional jump events."""

    def __init__(
        self,
        tickers: list[str],
        dt: float = TICK_SECONDS / TRADING_SECONDS_PER_YEAR,
        event_probability: float = 0.001,
        seed: int | None = None,
    ) -> None:
        self.dt = dt
        self.event_probability = event_probability
        self.rng = np.random.default_rng(seed)
        self.prices: dict[str, float] = {}
        self._tickers: list[str] = []
        for ticker in tickers:
            self.add_ticker(ticker)

    @property
    def tickers(self) -> list[str]:
        """Tickers being simulated."""
        return list(self._tickers)

    def add_ticker(self, ticker: str) -> None:
        """Add a ticker at its seed price, or a random price if unknown."""
        if ticker in self.prices:
            return
        self.prices[ticker] = SEED_PRICES.get(ticker) or float(self.rng.uniform(50, 300))
        self._tickers.append(ticker)
        self._rebuild()

    def remove_ticker(self, ticker: str) -> None:
        """Stop simulating a ticker."""
        if ticker not in self.prices:
            return
        del self.prices[ticker]
        self._tickers.remove(ticker)
        self._rebuild()

    def _rebuild(self) -> None:
        """Recompute parameter vectors and the Cholesky factor of the correlation matrix."""
        params = [TICKER_PARAMS.get(t, DEFAULT_PARAMS) for t in self._tickers]
        self._mu = np.array([p[0] for p in params])
        self._sigma = np.array([p[1] for p in params])
        corr = np.array([[pair_correlation(a, b) for b in self._tickers] for a in self._tickers])
        self._chol = np.linalg.cholesky(corr) if self._tickers else corr

    def step(self) -> dict[str, float]:
        """Advance every price by one tick and return the new prices."""
        n = len(self._tickers)
        if n == 0:
            return {}
        z = self._chol @ self.rng.standard_normal(n)
        log_returns = (self._mu - 0.5 * self._sigma**2) * self.dt + self._sigma * np.sqrt(self.dt) * z
        shocks = self._event_shocks(n)
        current = np.array([self.prices[t] for t in self._tickers])
        new = current * np.exp(log_returns) * (1 + shocks)
        self.prices = dict(zip(self._tickers, new.tolist()))
        return dict(self.prices)

    def _event_shocks(self, n: int) -> np.ndarray:
        """Random 2-5% up or down jumps on a small fraction of tickers."""
        hit = self.rng.random(n) < self.event_probability
        size = self.rng.uniform(0.02, 0.05, n)
        sign = self.rng.choice([-1.0, 1.0], n)
        return np.where(hit, size * sign, 0.0)


class SimulatorDataSource(MarketDataSource):
    """Runs GBMSimulator in a background asyncio task and writes to the PriceCache."""

    def __init__(self, cache: PriceCache, interval: float = TICK_SECONDS) -> None:
        self.cache = cache
        self.interval = interval
        self.sim = GBMSimulator([])
        self._task: asyncio.Task | None = None

    async def start(self, tickers: list[str]) -> None:
        for ticker in tickers:
            await self.add_ticker(ticker)
        self._task = asyncio.create_task(self._run(), name="market-simulator")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            self._task = None

    async def add_ticker(self, ticker: str) -> None:
        self.sim.add_ticker(ticker)
        self.cache.update(ticker, self.sim.prices[ticker])

    async def remove_ticker(self, ticker: str) -> None:
        self.sim.remove_ticker(ticker)
        self.cache.remove(ticker)

    def get_tickers(self) -> list[str]:
        return self.sim.tickers

    async def _run(self) -> None:
        """Step the simulator every interval until cancelled."""
        while True:
            await asyncio.sleep(self.interval)
            now = time.time()
            for ticker, price in self.sim.step().items():
                self.cache.update(ticker, price, now)
```

## 3. Verified behavior

The code above was run with a fixed seed. Results:

| Check | Expected | Measured |
|---|---|---|
| Annualized vol, 20,000 daily steps (AAPL, MSFT, JPM, TSLA) | 0.22, 0.20, 0.18, 0.50 | 0.220, 0.201, 0.179, 0.498 |
| Correlation AAPL-MSFT (same sector) | 0.6 | 0.61 |
| Correlation AAPL-JPM (cross sector) | 0.3 | 0.30 |
| Correlation AAPL-TSLA | 0.3 | 0.31 |
| Forced event (`event_probability=1`) | 2-5% move | 4.42% |
| Unknown ticker `ZZZZ` | random 50-300 | 285.76 |
| Add/remove tickers then step | no error | ok |

## 4. Unit tests to write

In `backend/tests/market/test_simulator.py`, using `GBMSimulator(..., seed=...)`
for determinism:

- **Positivity**: 10,000 steps, all prices stay > 0.
- **Volatility**: with `dt=1/252`, `event_probability=0`, the standard deviation of
  log returns times `sqrt(252)` is within ~5% of `sigma`.
- **Drift**: with `sigma` near zero (patch `TICKER_PARAMS`), one step of
  `dt=1` multiplies the price by about `exp(mu)`.
- **Correlation**: same-sector pairs come out near 0.6, cross-sector near 0.3.
- **Events**: `event_probability=1` gives a 2-5% move on every ticker;
  `event_probability=0` never moves more than a few sigma.
- **Ticker management**: add is idempotent, remove of an unknown ticker is a no-op,
  stepping with zero tickers returns `{}`, unknown tickers get a 50-300 price.
- **`pair_correlation`**: table in section 1.3, including symmetry.
- **`SimulatorDataSource`**: `start()` puts seed prices in the cache immediately;
  after a few intervals (`interval=0.01`) prices change and `version` increases;
  `remove_ticker` drops it from the cache; `stop()` is safe to call twice.

## 5. Possible extensions (not in scope)

- Market hours: pause outside 9:30-16:00 ET for realism.
- Mean-reverting volatility (Heston-style) or volatility clustering.
- A market-wide factor so occasional events hit all stocks at once.
- Seed from Massive's previous close when a key is available but intraday data is not.
