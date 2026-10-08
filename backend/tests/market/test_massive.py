"""MassiveDataSource against a stub client: no network, no API key."""
import dataclasses
from types import SimpleNamespace

from app.market.cache import PriceCache
from app.market.factory import create_market_data_source
from app.market.massive_client import MassiveDataSource
from app.market.stream import price_frames

PRICE_KEYS = {"ticker", "price", "previous_price", "session_start_price", "timestamp",
              "change", "direction", "change_percent"}


class StubClient:
    """Records every call; each call returns or raises the next configured result.

    The last result repeats once the list is exhausted.
    """

    def __init__(self, snapshots=(), grouped=()):
        self.calls = []
        self._snapshots = list(snapshots)
        self._grouped = list(grouped)

    def get_snapshot_all(self, market_type, tickers=None):
        self.calls.append(("get_snapshot_all", market_type, tickers))
        return self._next(self._snapshots)

    def get_grouped_daily_aggs(self, date, **kwargs):
        self.calls.append(("get_grouped_daily_aggs", date))
        return self._next(self._grouped)

    @staticmethod
    def _next(results):
        result = results.pop(0) if len(results) > 1 else results[0]
        if isinstance(result, Exception):
            raise result
        return result


def snap(ticker, last=None, ts=None, day_close=None, prev_close=None):
    """Snapshot object shaped like massive's TickerSnapshot."""
    return SimpleNamespace(
        ticker=ticker,
        last_trade=SimpleNamespace(price=last, sip_timestamp=ts) if last is not None else None,
        day=SimpleNamespace(close=day_close),
        prev_day=SimpleNamespace(close=prev_close),
    )


def bar(ticker, close):
    """Grouped Daily bar."""
    return SimpleNamespace(ticker=ticker, close=close)


def make_source(client, **kwargs):
    source = MassiveDataSource(PriceCache(), "test-key-123", **kwargs)
    source.client = client
    return source


async def test_paid_snapshot_reaches_the_stream(settings):
    cache = PriceCache()
    source = create_market_data_source(cache, dataclasses.replace(settings, massive_api_key="test-key-123"))
    assert isinstance(source, MassiveDataSource)
    source.client = StubClient(snapshots=[[snap("AAPL", 191.9, 1759507199123456789), snap("MSFT", 420.5)]])

    await source.start(["MSFT", "AAPL"])

    assert source.client.calls[0] == ("get_snapshot_all", "stocks", ["AAPL", "MSFT"])
    assert cache.get_price("AAPL") == 191.9
    assert abs(cache.get("AAPL").timestamp - 1759507199.123) < 1e-3
    frame = await anext(price_frames(cache))
    assert set(frame) == {"AAPL", "MSFT"}
    assert all(set(v) == PRICE_KEYS for v in frame.values())
    await source.stop()
    assert source._task is None
