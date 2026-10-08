"""SSE endpoint that streams the PriceCache to browsers."""

import asyncio
from collections.abc import AsyncIterable, AsyncIterator

from fastapi import APIRouter, Request
from fastapi.sse import EventSourceResponse, ServerSentEvent

from .cache import PriceCache

router = APIRouter()


async def price_frames(cache: PriceCache, poll_seconds: float = 0.1) -> AsyncIterator[dict]:
    """Yield the full price dict whenever the cache version changes."""
    last = -1
    while True:
        if cache.version != last:
            last = cache.version
            yield {t: u.to_dict() for t, u in cache.get_all().items()}
        await asyncio.sleep(poll_seconds)


@router.get("/api/stream/prices", response_class=EventSourceResponse)
async def stream_prices(request: Request) -> AsyncIterable[ServerSentEvent]:
    """Send retry: 1000, then one data frame per cache version change."""
    yield ServerSentEvent(retry=1000)
    async for payload in price_frames(request.app.state.cache):
        yield ServerSentEvent(data=payload)
