"""Prompt exit with an open SSE stream, and clean source and lifespan teardown (MKT-10)."""
import asyncio
import time

import httpx
from fastapi.testclient import TestClient

from app.main import create_app
from app.market.cache import PriceCache
from app.market.simulator import SimulatorDataSource


async def test_server_exits_promptly_with_an_open_stream(live_server):
    async with httpx.AsyncClient(timeout=10) as client:
        async with client.stream("GET", live_server.url + "/api/stream/prices") as response:
            lines = response.aiter_lines()
            line = ""
            while not line.startswith("data: "):
                line = await anext(lines)
            started = time.monotonic()
            live_server.server.should_exit = True
            await asyncio.wait_for(live_server.task, 5)
            assert time.monotonic() - started < 4


async def test_source_start_caches_tickers_ticks_and_stops_twice():
    cache = PriceCache()
    source = SimulatorDataSource(cache, interval=0.01)
    await source.start(["AAPL", "MSFT"])
    assert cache.version == 2
    await asyncio.sleep(0.1)
    assert cache.version > 2
    await source.stop()
    await source.stop()
    assert source._task is None


def test_lifespan_runs_the_source_task_and_clears_it_on_exit(settings):
    app = create_app(settings)
    with TestClient(app):
        assert not app.state.source._task.done()
    assert app.state.source._task is None
