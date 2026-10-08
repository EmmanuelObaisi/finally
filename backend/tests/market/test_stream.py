"""Wire-format tests for GET /api/stream/prices, run against a real uvicorn server."""
import json

import httpx

from app.market.seed_prices import SEED_PRICES

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
