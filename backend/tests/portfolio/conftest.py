"""Fixtures: a fresh temp database and a fake market source with fixed prices."""

import pytest

from app import db, deps
from app.market import MarketDataSource, PriceCache

PRICES = {"AAPL": 100.0, "GOOGL": 50.0, "MSFT": 200.0, "PYPL": 70.0}


class FakeSource(MarketDataSource):
    """Prices only the tickers in PRICES, like Massive rejecting unknown symbols."""

    def __init__(self, cache: PriceCache) -> None:
        self.cache = cache
        self.tickers: set[str] = set()

    async def start(self, tickers: list[str]) -> None:
        for ticker in tickers:
            await self.add_ticker(ticker)

    async def stop(self) -> None:
        pass

    async def add_ticker(self, ticker: str) -> None:
        self.tickers.add(ticker)
        if ticker in PRICES and self.cache.get(ticker) is None:
            self.cache.update(ticker, PRICES[ticker])

    async def remove_ticker(self, ticker: str) -> None:
        self.tickers.discard(ticker)
        self.cache.remove(ticker)

    def get_tickers(self) -> list[str]:
        return sorted(self.tickers)


@pytest.fixture
def temp_db(tmp_path, monkeypatch):
    """Point DB_PATH at a fresh seeded database."""
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    db.init_db()


@pytest.fixture
def market(temp_db, monkeypatch) -> FakeSource:
    """Swap the deps singletons for a fresh cache and FakeSource tracking the watchlist."""
    cache = PriceCache()
    source = FakeSource(cache)
    monkeypatch.setattr(deps, "price_cache", cache)
    monkeypatch.setattr(deps, "market_source", source)
    return source
