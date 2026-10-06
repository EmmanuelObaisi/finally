"""Background task that records the portfolio value at a fixed interval."""

import asyncio
import logging

from app.portfolio import service

logger = logging.getLogger(__name__)

SNAPSHOT_SECONDS = 30.0


async def record_snapshots(interval: float = SNAPSHOT_SECONDS) -> None:
    """Record a snapshot now and then every interval until cancelled."""
    while True:
        try:
            service.record_snapshot()
        except Exception:
            logger.exception("Portfolio snapshot failed")
        await asyncio.sleep(interval)
