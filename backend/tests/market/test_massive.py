import asyncio
from datetime import date, timedelta
from types import SimpleNamespace

import pytest
from massive.exceptions import BadResponse

from app.market.cache import PriceCache
from app.market.massive_client import MassiveDataSource


def snapshot(ticker, last=None, day_close=None, prev_close=None, ts=None):
    return SimpleNamespace(
        ticker=ticker,
        last_trade=SimpleNamespace(price=last, sip_timestamp=ts) if last is not None else None,
        day=SimpleNamespace(close=day_close) if day_close is not None else None,
        prev_day=SimpleNamespace(close=prev_close) if prev_close is not None else None,
    )


class StubClient:
    """Stands in for massive.RESTClient. Records calls; no network."""

    def __init__(self, snapshots=None, grouped=None, authorized=True):
        self.snapshots = snapshots or {}
        self.grouped = grouped or {}  # ISO date -> {ticker: close}
        self.authorized = authorized
        self.snapshot_calls = 0
        self.grouped_calls: list[str] = []

    def get_snapshot_all(self, market, tickers):
        self.snapshot_calls += 1
        if not self.authorized:
            raise BadResponse('{"status":"NOT_AUTHORIZED","message":"You are not entitled to this data."}')
        return [self.snapshots[t] for t in tickers if t in self.snapshots]

    def get_grouped_daily_aggs(self, day):
        self.grouped_calls.append(day)
        return [SimpleNamespace(ticker=t, close=c) for t, c in self.grouped.get(day, {}).items()]


def make_source(client, **kwargs):
    cache = PriceCache()
    source = MassiveDataSource(cache, "test-key", **kwargs)
    source.client = client
    return source, cache


async def test_paid_plan_uses_snapshot():
    client = StubClient(
        snapshots={
            "AAPL": snapshot("AAPL", last=191.9, prev_close=190.58, ts=1_759_507_199_123_456_789),
            "MSFT": snapshot("MSFT", day_close=421.0, prev_close=420.0),
            "OLD": snapshot("OLD", prev_close=10.0),
        }
    )
    source, cache = make_source(client)
    await source.start(["aapl", "MSFT", "OLD", "BOGUS"])
    try:
        aapl = cache.get("AAPL")
        assert aapl.price == 191.9
        assert aapl.reference_price == 190.58
        assert aapl.timestamp == pytest.approx(1_759_507_199.123, abs=1e-3)
        assert cache.get_price("MSFT") == 421.0  # falls back to day close
        assert cache.get_price("OLD") == 10.0  # then previous close
        assert cache.get("BOGUS") is None  # unknown tickers never get a price
        assert not source.eod_mode
        assert client.grouped_calls == []
    finally:
        await source.stop()


async def test_free_plan_falls_back_to_grouped_daily():
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    client = StubClient(authorized=False, grouped={yesterday: {"AAPL": 190.58, "PYPL": 70.0}})
    source, cache = make_source(client)
    await source.start(["AAPL"])
    try:
        assert source.eod_mode
        assert cache.get_price("AAPL") == 190.58

        # A new ticker is served from the in-memory closes, with no further API call.
        await source.add_ticker("PYPL")
        assert cache.get_price("PYPL") == 70.0
        assert client.snapshot_calls == 1
        assert client.grouped_calls == [yesterday]
    finally:
        await source.stop()


async def test_weekend_walk_back():
    three_days_ago = (date.today() - timedelta(days=3)).isoformat()
    client = StubClient(authorized=False, grouped={three_days_ago: {"AAPL": 188.0}})
    source, cache = make_source(client)
    await source.start(["AAPL"])
    try:
        assert cache.get_price("AAPL") == 188.0
        assert len(client.grouped_calls) == 3
    finally:
        await source.stop()


async def test_other_bad_response_propagates_from_start():
    class Broken(StubClient):
        def get_snapshot_all(self, market, tickers):
            raise BadResponse('{"status":"ERROR","message":"boom"}')

    source, _ = make_source(Broken())
    with pytest.raises(BadResponse):
        await source.start(["AAPL"])


async def test_background_errors_do_not_kill_poller():
    client = StubClient(snapshots={"AAPL": snapshot("AAPL", last=190.0)})
    source, cache = make_source(client, interval=0.01)
    await source.start(["AAPL"])
    try:
        client.snapshots = None  # next polls raise TypeError
        await asyncio.sleep(0.05)
        client.snapshots = {"AAPL": snapshot("AAPL", last=195.0)}
        await asyncio.sleep(0.05)
        assert cache.get_price("AAPL") == 195.0
    finally:
        await source.stop()
        await source.stop()


async def test_add_and_remove_tickers():
    client = StubClient(
        snapshots={"AAPL": snapshot("AAPL", last=190.0), "MSFT": snapshot("MSFT", last=420.0)}
    )
    source, cache = make_source(client)
    await source.start(["AAPL"])
    try:
        await source.add_ticker("msft")
        assert cache.get_price("MSFT") == 420.0
        calls = client.snapshot_calls
        await source.add_ticker("MSFT")  # already tracked: no call
        assert client.snapshot_calls == calls
        await source.remove_ticker("msft")
        assert source.get_tickers() == ["AAPL"]
        assert cache.get("MSFT") is None
    finally:
        await source.stop()
