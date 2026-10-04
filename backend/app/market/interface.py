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
