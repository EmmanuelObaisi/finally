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
        if ticker in self.sim.prices:
            return
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
