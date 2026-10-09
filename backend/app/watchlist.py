"""Watchlist: stored tickers joined with the latest cached prices, plus add and remove."""
import asyncio

from fastapi import APIRouter, Request
from pydantic import BaseModel

from .db import USER_ID, connect, now_iso
from .errors import DomainError, NotFoundError
from .tracking import normalize_ticker, sync_ticker

PRICE_FIELDS = ("price", "previous_price", "timestamp", "change", "change_percent",
                "direction", "session_start_price")

router = APIRouter()


class WatchlistRequest(BaseModel):
    """Body of POST /api/watchlist."""

    ticker: str


def build_watchlist(conn, cache) -> list[dict]:
    """Watchlist items in stored order; an unpriced ticker has null price fields."""
    rows = conn.execute(
        "SELECT ticker FROM watchlist WHERE user_id = ? ORDER BY rowid", (USER_ID,)
    ).fetchall()
    prices = cache.get_all()
    return [
        prices[row["ticker"]].to_dict() if row["ticker"] in prices
        else {"ticker": row["ticker"], **dict.fromkeys(PRICE_FIELDS)}
        for row in rows
    ]


@router.get("/api/watchlist")
def get_watchlist(request: Request) -> dict:
    """Current watchlist with latest prices."""
    with connect(request.app.state.settings.db_path) as conn:
        return {"watchlist": build_watchlist(conn, request.app.state.cache)}


def on_watchlist(db_path, ticker: str) -> bool:
    """True when the ticker is already on the watchlist."""
    with connect(db_path) as conn:
        row = conn.execute(
            "SELECT 1 FROM watchlist WHERE user_id = ? AND ticker = ?", (USER_ID, ticker)
        ).fetchone()
    return row is not None


def read_watchlist(state) -> list[dict]:
    """The current watchlist with prices."""
    with connect(state.settings.db_path) as conn:
        return build_watchlist(conn, state.cache)


def insert_and_read(state, ticker: str) -> list[dict]:
    """Store the ticker (a concurrent duplicate is ignored) and return the watchlist."""
    with connect(state.settings.db_path) as conn:
        conn.execute(
            "INSERT OR IGNORE INTO watchlist (user_id, ticker, added_at) VALUES (?, ?, ?)",
            (USER_ID, ticker, now_iso()),
        )
        return build_watchlist(conn, state.cache)


async def add_to_watchlist(state, raw_ticker: str) -> list[dict]:
    """Validate, start streaming and store a ticker; shared with Phase 5 chat."""
    ticker = normalize_ticker(raw_ticker)
    async with state.tracking_lock:
        if await asyncio.to_thread(on_watchlist, state.settings.db_path, ticker):
            return await asyncio.to_thread(read_watchlist, state)
        try:
            await state.source.add_ticker(ticker)
            if state.cache.get_price(ticker) is None:
                raise DomainError("Unknown ticker")
            return await asyncio.to_thread(insert_and_read, state, ticker)
        finally:
            await sync_ticker(state, ticker)


@router.post("/api/watchlist")
async def post_watchlist(body: WatchlistRequest, request: Request) -> dict:
    """Add a ticker to the watchlist and return the updated list."""
    return {"watchlist": await add_to_watchlist(request.app.state, body.ticker)}


def delete_and_read(state, ticker: str) -> list[dict]:
    """Delete the watchlist row (NotFoundError if absent) and return the watchlist."""
    with connect(state.settings.db_path) as conn:
        cur = conn.execute(
            "DELETE FROM watchlist WHERE user_id = ? AND ticker = ?", (USER_ID, ticker)
        )
        if cur.rowcount == 0:
            raise NotFoundError("Ticker not in watchlist")
        return build_watchlist(conn, state.cache)


async def remove_from_watchlist(state, raw_ticker: str) -> list[dict]:
    """Remove a ticker; it keeps streaming while a position is held. Shared with Phase 5 chat."""
    ticker = raw_ticker.upper() if raw_ticker.isascii() else raw_ticker
    async with state.tracking_lock:
        items = await asyncio.to_thread(delete_and_read, state, ticker)
        await sync_ticker(state, ticker)
    return items


@router.delete("/api/watchlist/{ticker}")
async def delete_watchlist_ticker(ticker: str, request: Request) -> dict:
    """Remove a ticker from the watchlist and return the updated list."""
    return {"watchlist": await remove_from_watchlist(request.app.state, ticker)}
