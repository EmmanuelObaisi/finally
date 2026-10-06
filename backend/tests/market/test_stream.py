"""Tests for the SSE price event generator."""

import json

from app.market.cache import PriceCache
from app.market.stream import price_events


class StubRequest:
    """Reports a disconnect after `checks` calls to is_disconnected."""

    def __init__(self, checks: int) -> None:
        self.checks = checks

    async def is_disconnected(self) -> bool:
        self.checks -= 1
        return self.checks < 0


async def test_price_events_sends_retry_then_data_once_per_change():
    cache = PriceCache()
    cache.update("AAPL", 190.0)
    events = [e async for e in price_events(cache, StubRequest(3), 0)]
    assert events[0] == "retry: 1000\n\n"
    assert len(events) == 2
    assert events[1].startswith("data: ")
    payload = json.loads(events[1].removeprefix("data: "))
    assert payload["AAPL"]["price"] == 190.0
    assert payload["AAPL"]["direction"] == "flat"
