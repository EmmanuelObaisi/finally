"""MassiveDataSource against a stub client: no network, no API key."""
import asyncio
import dataclasses
import logging
from datetime import date
from types import SimpleNamespace

import pytest
from massive.exceptions import BadResponse

from app.market.cache import PriceCache
from app.market.factory import create_market_data_source
from app.market.interface import MarketDataSource
from app.market.massive_client import MAX_EOD_LOOKBACK, MassiveDataSource, last_trading_day
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


async def test_snapshot_request_is_sorted_whatever_the_add_order():
    source = make_source(StubClient(snapshots=[[]]))
    await source.start([])
    source._tickers = set()
    await source.add_ticker("ZZZZ")
    await source.add_ticker("AAPL")
    assert source.client.calls[-1] == ("get_snapshot_all", "stocks", ["AAPL", "ZZZZ"])
    await source.stop()


async def test_no_tracked_tickers_means_no_api_call():
    source = make_source(StubClient(snapshots=[[]]))
    await source.start([])
    await source._poll()
    assert source.client.calls == []
    await source.stop()


async def test_empty_snapshot_list_leaves_the_cache_version_unchanged():
    source = make_source(StubClient(snapshots=[[]]))
    await source.start(["AAPL"])
    assert source.cache.version == 0
    await source.stop()


async def test_same_price_and_timestamp_twice_is_a_flat_update():
    source = make_source(StubClient(snapshots=[[snap("AAPL", 190.0, 1759507199000000000)]]))
    source._tickers = {"AAPL"}
    await source._poll()
    await source._poll()
    update = source.cache.get("AAPL")
    assert (update.direction, update.change) == ("flat", 0.0)
    assert source.cache.version == 2


async def test_price_falls_back_from_last_trade_to_day_close_to_prev_close():
    snapshots = [
        snap("AAA", last=None, day_close=11.0, prev_close=10.0),
        snap("BBB", last=None, day_close=0, prev_close=20.0),
        snap("CCC", last=None, day_close=None, prev_close=None),
    ]
    source = make_source(StubClient(snapshots=[snapshots]))
    await source.start(["AAA", "BBB", "CCC"])
    assert source.cache.get_price("AAA") == 11.0
    assert source.cache.get_price("BBB") == 20.0
    assert source.cache.get("CCC") is None
    await source.stop()


async def test_ticker_missing_from_the_response_never_gets_a_price():
    source = make_source(StubClient(snapshots=[[snap("AAPL", 190.0)]]))
    await source.start(["AAPL", "ZZZZ"])
    assert source.cache.get("ZZZZ") is None
    await source.stop()


NOT_AUTHORIZED = BadResponse(
    '{"status":"NOT_AUTHORIZED","request_id":"x","message":"You are not entitled to this data. '
    'Please upgrade your plan at https://massive.com/pricing"}')


def free_plan_client(*grouped):
    return StubClient(snapshots=[NOT_AUTHORIZED], grouped=list(grouped) or [[]])


def grouped_dates(client):
    return [date.fromisoformat(c[1]) for c in client.calls if c[0] == "get_grouped_daily_aggs"]


@pytest.mark.parametrize("today, expected", [
    (date(2026, 10, 7), date(2026, 10, 6)),
    (date(2026, 10, 5), date(2026, 10, 2)),
    (date(2026, 10, 4), date(2026, 10, 2)),
    (date(2026, 10, 3), date(2026, 10, 2)),
])
def test_last_trading_day_is_the_previous_weekday(today, expected):
    assert last_trading_day(today) == expected


async def test_free_plan_starts_in_two_calls_with_end_of_day_closes():
    client = free_plan_client([bar("AAPL", 190.58), bar("MSFT", 415.0), bar("PYPL", 70.1)])
    source = make_source(client)
    await source.start(["AAPL", "MSFT"])
    assert source.eod_mode is True
    assert source.cache.get_price("AAPL") == 190.58
    assert len(client.calls) == 2
    assert client.calls[1] == ("get_grouped_daily_aggs", last_trading_day(date.today()).isoformat())
    await source.stop()


async def test_ticker_added_in_end_of_day_mode_costs_no_call():
    client = free_plan_client([bar("AAPL", 190.58), bar("PYPL", 70.1)])
    source = make_source(client)
    await source.start(["AAPL"])
    await source.add_ticker("PYPL")
    assert source.cache.get_price("PYPL") == 70.1
    assert len(client.calls) == 2
    await source.stop()


async def test_grouped_daily_walks_back_over_a_day_without_data():
    client = free_plan_client([], [bar("AAPL", 190.58)])
    source = make_source(client)
    await source.start(["AAPL"])
    first, second = grouped_dates(client)
    assert second == last_trading_day(first)
    assert source.cache.get_price("AAPL") == 190.58
    await source.stop()


async def test_grouped_daily_walk_back_is_capped_and_skips_weekends():
    client = free_plan_client([])
    source = make_source(client)
    await source.start(["AAPL"])
    days = grouped_dates(client)
    assert len(days) == MAX_EOD_LOOKBACK == 5
    assert all(d.weekday() < 5 for d in days)
    assert days == sorted(days, reverse=True) and len(set(days)) == 5
    assert source.cache.get("AAPL") is None
    await source.stop()


async def test_a_rejected_key_fails_start_without_falling_back():
    unknown_key = BadResponse('{"status":"ERROR","request_id":"x","error":"Unknown API Key"}')
    client = StubClient(snapshots=[unknown_key])
    source = make_source(client)
    with pytest.raises(BadResponse):
        await source.start(["AAPL"])
    assert source.eod_mode is False
    assert [c[0] for c in client.calls] == ["get_snapshot_all"]
    assert source._task is None


async def test_a_transient_error_at_start_does_not_abort_and_the_loop_retries():
    client = StubClient(snapshots=[RuntimeError("dns blip"), [snap("AAPL", 190.0)]])
    source = make_source(client, interval=0.01)
    await source.start(["AAPL"])
    assert source._task is not None and source.cache.get("AAPL") is None
    for _ in range(100):
        if source.cache.get("AAPL"):
            break
        await asyncio.sleep(0.01)
    assert source.cache.get("AAPL").price == 190.0
    await source.stop()


async def test_a_transient_grouped_daily_error_at_start_retries_before_the_eod_interval():
    client = free_plan_client(RuntimeError("429 too many requests"), [bar("AAPL", 190.58)])
    source = make_source(client, eod_interval=900.0, retry_interval=0.01)
    try:
        await source.start(["AAPL"])
        assert source.eod_mode is True and source.cache.get("AAPL") is None
        for _ in range(100):
            if source.cache.get("AAPL"):
                break
            await asyncio.sleep(0.01)
        assert source.cache.get_price("AAPL") == 190.58
    finally:
        await source.stop()


async def test_poll_loop_survives_an_error_and_never_logs_the_key(caplog):
    ok = [snap("AAPL", 190.0)]
    client = StubClient(snapshots=[ok, RuntimeError("boom"), ok])
    source = make_source(client, interval=0.01)
    with caplog.at_level(logging.INFO):
        await source.start(["AAPL"])
        await asyncio.sleep(0.1)
        assert not source._task.done()
        assert source.cache.version >= 3
        await source.stop()
    assert "Massive poll failed" in caplog.text
    assert "test-key-123" not in caplog.text


async def test_stop_twice_is_safe():
    source = make_source(StubClient(snapshots=[[snap("AAPL", 190.0)]]), interval=0.01)
    await source.start(["AAPL"])
    await source.stop()
    await source.stop()
    assert source._task is None


def test_massive_source_implements_the_whole_interface():
    assert issubclass(MassiveDataSource, MarketDataSource)
    assert not MassiveDataSource.__abstractmethods__
