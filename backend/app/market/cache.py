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
    ) -> PriceUpdate | None:
        """Record a new price. The first price seen becomes the session start price.

        A price that rounds to zero is ignored: it would make change_percent divide by zero.
        """
        price = round(price, 2)
        if price <= 0:
            return None
        with self._lock:
            prev = self._prices.get(ticker)
            update = PriceUpdate(
                ticker=ticker,
                price=price,
                previous_price=prev.price if prev else price,
                session_start_price=prev.session_start_price if prev else price,
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
