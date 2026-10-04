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
