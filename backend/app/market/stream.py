"""SSE endpoint that streams the PriceCache to browsers."""

import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from .cache import PriceCache


def create_stream_router(cache: PriceCache, poll_seconds: float = 0.5) -> APIRouter:
    """Router exposing GET /api/stream/prices."""
    router = APIRouter()

    @router.get("/api/stream/prices")
    async def stream_prices(request: Request) -> StreamingResponse:
        return StreamingResponse(
            price_events(cache, request, poll_seconds),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    return router


async def price_events(cache: PriceCache, request: Request, poll_seconds: float) -> AsyncIterator[str]:
    """Yield one SSE event with every ticker whenever the cache changes."""
    yield "retry: 1000\n\n"
    last_version = -1
    while not await request.is_disconnected():
        if cache.version != last_version:
            last_version = cache.version
            payload = {t: u.to_dict() for t, u in cache.get_all().items()}
            yield f"data: {json.dumps(payload)}\n\n"
        await asyncio.sleep(poll_seconds)
