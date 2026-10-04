import json

from app.market.cache import PriceCache
from app.market.stream import price_events


class StubRequest:
    """Reports a disconnect after `checks` calls to is_disconnected."""

    def __init__(self, checks: int) -> None:
        self.remaining = checks

    async def is_disconnected(self) -> bool:
        self.remaining -= 1
        return self.remaining < 0


async def collect(cache: PriceCache, checks: int) -> list[str]:
    return [e async for e in price_events(cache, StubRequest(checks), poll_seconds=0)]


async def test_first_event_is_retry_then_data():
    cache = PriceCache()
    cache.update("AAPL", 190.0)
    cache.update("MSFT", 420.0)
    events = await collect(cache, checks=1)
    assert events[0] == "retry: 1000\n\n"
    assert events[1].startswith("data: ") and events[1].endswith("\n\n")
    payload = json.loads(events[1].removeprefix("data: "))
    assert set(payload) == {"AAPL", "MSFT"}
    assert payload["AAPL"]["price"] == 190.0
    assert payload["AAPL"]["direction"] == "flat"


async def test_sends_only_when_cache_changes():
    cache = PriceCache()
    cache.update("AAPL", 190.0)
    events = await collect(cache, checks=5)
    assert len(events) == 2  # retry + one data event; version never changed again
