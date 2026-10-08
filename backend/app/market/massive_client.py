"""Market data source backed by the Massive (formerly Polygon.io) REST API."""

import asyncio
import contextlib
import logging
from datetime import date, timedelta

from massive import RESTClient
from massive.exceptions import BadResponse

from .cache import PriceCache
from .interface import MarketDataSource

logger = logging.getLogger(__name__)


class MassiveDataSource(MarketDataSource):
    """Polls Massive for the tracked tickers and writes prices to the PriceCache.

    Paid plans use the multi-ticker Snapshot endpoint every `interval` seconds.
    Free plans are not entitled to snapshots; the source detects this on the first
    poll and switches to end-of-day closes from Grouped Daily, refreshed every
    `eod_interval` seconds.
    """

    def __init__(
        self,
        cache: PriceCache,
        api_key: str,
        interval: float = 5.0,
        eod_interval: float = 900.0,
    ) -> None:
        self.cache = cache
        self.client = RESTClient(api_key=api_key)
        self.interval = interval
        self.eod_interval = eod_interval
        self.eod_mode = False
        self._eod_closes: dict[str, float] = {}
        self._tickers: set[str] = set()
        self._task: asyncio.Task | None = None

    async def start(self, tickers: list[str]) -> None:
        """Fetch the first prices (errors propagate), then poll in the background."""
        self._tickers = {t.upper() for t in tickers}
        await self._poll()
        self._task = asyncio.create_task(self._run(), name="massive-poller")

    async def stop(self) -> None:
        """Cancel the poll task and wait for it, so no pending task is left behind."""
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None

    async def add_ticker(self, ticker: str) -> None:
        ticker = ticker.upper()
        if ticker in self._tickers:
            return
        self._tickers.add(ticker)
        if self.eod_mode and self._eod_closes:
            self._write_eod({ticker})
        else:
            await self._poll()

    async def remove_ticker(self, ticker: str) -> None:
        self._tickers.discard(ticker.upper())
        self.cache.remove(ticker.upper())

    def get_tickers(self) -> list[str]:
        return sorted(self._tickers)

    async def _run(self) -> None:
        """Poll until cancelled. Errors are logged and the next poll retries."""
        while True:
            await asyncio.sleep(self.eod_interval if self.eod_mode else self.interval)
            try:
                await self._poll()
            except Exception:
                logger.exception("Massive poll failed")

    async def _poll(self) -> None:
        """Fetch prices for all tracked tickers, falling back to EOD on a free plan."""
        if not self._tickers:
            return
        if not self.eod_mode:
            try:
                await asyncio.to_thread(self._fetch_snapshot)
                return
            except BadResponse as e:
                if "NOT_AUTHORIZED" not in str(e):
                    raise
                logger.warning("Massive key has no snapshot access; using end-of-day prices")
                self.eod_mode = True
        self._eod_closes = await asyncio.to_thread(self._fetch_latest_closes)
        self._write_eod(self._tickers)

    def _fetch_snapshot(self) -> None:
        """Write current prices for all tracked tickers from one Snapshot call."""
        snapshots = self.client.get_snapshot_all("stocks", tickers=sorted(self._tickers))
        for snap in snapshots:
            prev_close = snap.prev_day.close if snap.prev_day else None
            trade = snap.last_trade
            price = (trade.price if trade else None) or (snap.day.close if snap.day else None) or prev_close
            if not price:
                continue
            ts = trade.sip_timestamp / 1e9 if trade and trade.sip_timestamp else None
            self.cache.update(snap.ticker, price, ts)

    def _fetch_latest_closes(self, max_days_back: int = 7) -> dict[str, float]:
        """All closes from the most recent trading day that has Grouped Daily data."""
        day = date.today() - timedelta(days=1)
        for _ in range(max_days_back):
            bars = self.client.get_grouped_daily_aggs(day.isoformat())
            if bars:
                return {b.ticker: b.close for b in bars}
            day -= timedelta(days=1)
        return {}

    def _write_eod(self, tickers: set[str]) -> None:
        """Copy cached end-of-day closes for the given tickers into the PriceCache."""
        for ticker in tickers:
            if ticker in self._eod_closes:
                self.cache.update(ticker, self._eod_closes[ticker])
