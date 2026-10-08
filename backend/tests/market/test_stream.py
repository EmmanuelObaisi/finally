"""Wire-format tests for GET /api/stream/prices, run against a real uvicorn server."""
import asyncio
import json

import httpx
import pytest

from app.market.cache import PriceCache
from app.market.seed_prices import SEED_PRICES
from app.market.stream import price_frames

PRICE_KEYS = {"ticker", "price", "previous_price", "timestamp", "change", "change_percent",
              "direction", "session_start_price"}


async def test_live_stream_sends_retry_then_full_price_frame(live_server):
    async with httpx.AsyncClient(timeout=10) as client:
        async with client.stream("GET", live_server.url + "/api/stream/prices") as response:
            assert response.headers["content-type"].startswith("text/event-stream")
            lines = response.aiter_lines()
            assert await anext(lines) == "retry: 1000"
            data = ""
            while not data.startswith("data: "):
                data = await anext(lines)
    frame = json.loads(data.removeprefix("data: "))
    assert list(frame) == list(SEED_PRICES)
    for update in frame.values():
        assert set(update) == PRICE_KEYS
        assert update["price"] > 0


async def next_data_line(lines) -> str:
    """Read lines until the next data frame."""
    line = ""
    while not line.startswith("data: "):
        line = await anext(lines)
    return line


async def test_two_clients_both_receive_frames_and_survive_each_other(live_server):
    url = live_server.url + "/api/stream/prices"
    async with httpx.AsyncClient(timeout=10) as client:
        async with client.stream("GET", url) as second:
            second_lines = second.aiter_lines()
            async with client.stream("GET", url) as first:
                first_lines = first.aiter_lines()
                await next_data_line(first_lines)
                await next_data_line(second_lines)
            assert (await next_data_line(second_lines)).startswith("data: ")


async def test_empty_cache_yields_one_empty_frame_then_waits():
    gen = price_frames(PriceCache(), poll_seconds=0.01)
    assert await anext(gen) == {}
    with pytest.raises(TimeoutError):
        await asyncio.wait_for(anext(gen), 0.5)


async def test_two_writes_between_polls_coalesce_into_one_frame():
    cache = PriceCache()
    gen = price_frames(cache, poll_seconds=0.01)
    await anext(gen)
    cache.update("AAPL", 190.0)
    cache.update("AAPL", 191.0)
    frame = await anext(gen)
    assert frame["AAPL"]["price"] == 191.0
    with pytest.raises(TimeoutError):
        await asyncio.wait_for(anext(gen), 0.5)


async def test_removing_every_ticker_yields_an_empty_frame_and_keeps_running():
    cache = PriceCache()
    cache.update("AAPL", 190.0)
    gen = price_frames(cache, poll_seconds=0.01)
    assert list(await anext(gen)) == ["AAPL"]
    cache.remove("AAPL")
    assert await anext(gen) == {}
    cache.update("MSFT", 420.0)
    assert list(await anext(gen)) == ["MSFT"]


async def test_frame_keys_follow_insertion_order_and_values_are_unchanged():
    cache = PriceCache()
    for ticker, price in (("NVDA", 800.0), ("AAPL", 190.0), ("JPM", 195.0)):
        cache.update(ticker, price)
    frame = await anext(price_frames(cache, poll_seconds=0.01))
    assert list(frame) == ["NVDA", "AAPL", "JPM"]
    for ticker, value in frame.items():
        assert value["ticker"] == ticker
        assert value == cache.get(ticker).to_dict()
