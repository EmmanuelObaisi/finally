"""Watchlist read: stored tickers joined with the latest cached prices."""
from fastapi import APIRouter, Request

from .db import USER_ID, connect

PRICE_FIELDS = ("price", "previous_price", "timestamp", "change", "change_percent",
                "direction", "session_start_price")

router = APIRouter()


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
