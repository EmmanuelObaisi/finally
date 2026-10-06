"""Tests for MassiveDataSource against a stubbed REST client."""

from datetime import date, timedelta
from types import SimpleNamespace as NS

from massive.exceptions import BadResponse

from app.market.cache import PriceCache
from app.market.massive_client import MassiveDataSource


def snapshot(ticker: str, last: float | None, prev_close: float) -> NS:
    """A snapshot object shaped like the Massive client's response."""
    trade = NS(price=last, sip_timestamp=1_700_000_000_000_000_000) if last else None
    return NS(ticker=ticker, last_trade=trade, day=None, prev_day=NS(close=prev_close))


class PaidClient:
    """Stub client with snapshot access. Unknown tickers are absent from responses."""

    def __init__(self) -> None:
        self.known = {"AAPL": snapshot("AAPL", 200.0, 190.0), "MSFT": snapshot("MSFT", None, 400.0)}

    def get_snapshot_all(self, market: str, tickers: list[str]) -> list[NS]:
        return [self.known[t] for t in tickers if t in self.known]


class FreeClient:
    """Stub client without snapshot access. Only `trading_day` has grouped data."""

    def __init__(self, trading_day: date) -> None:
        self.trading_day = trading_day.isoformat()
        self.grouped_calls = 0

    def get_snapshot_all(self, market: str, tickers: list[str]) -> list[NS]:
        raise BadResponse('{"status":"NOT_AUTHORIZED"}')

    def get_grouped_daily_aggs(self, day: str) -> list[NS]:
        self.grouped_calls += 1
        if day != self.trading_day:
            return []
        return [NS(ticker="AAPL", close=195.0), NS(ticker="GOOGL", close=170.0)]


def make_source(client) -> tuple[MassiveDataSource, PriceCache]:
    cache = PriceCache()
    source = MassiveDataSource(cache, "test-key")
    source.client = client
    return source, cache


async def test_paid_plan_uses_last_trade_and_prev_close():
    source, cache = make_source(PaidClient())
    await source.start(["aapl", "MSFT"])
    aapl = cache.get("AAPL")
    assert aapl.price == 200.0
    assert aapl.reference_price == 190.0
    assert aapl.timestamp == 1_700_000_000.0
    assert cache.get_price("MSFT") == 400.0
    await source.stop()


async def test_unknown_ticker_gets_no_price():
    source, cache = make_source(PaidClient())
    await source.start(["AAPL"])
    await source.add_ticker("NOPE")
    assert cache.get_price("NOPE") is None
    await source.remove_ticker("NOPE")
    assert source.get_tickers() == ["AAPL"]
    await source.stop()


async def test_free_plan_falls_back_to_eod_with_weekend_walk_back():
    three_days_ago = date.today() - timedelta(days=3)
    client = FreeClient(three_days_ago)
    source, cache = make_source(client)
    await source.start(["AAPL"])
    assert source.eod_mode
    assert cache.get_price("AAPL") == 195.0
    assert client.grouped_calls == 3
    await source.add_ticker("GOOGL")
    assert cache.get_price("GOOGL") == 170.0
    assert client.grouped_calls == 3
    await source.stop()
