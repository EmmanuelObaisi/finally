"""Watchlist endpoints."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.portfolio import service

router = APIRouter(prefix="/api/watchlist")


class WatchlistRequest(BaseModel):
    """Body of POST /api/watchlist."""

    ticker: str


@router.get("")
def get_watchlist() -> list[dict]:
    """Watchlist tickers with their latest prices."""
    return service.get_watchlist_with_prices()


@router.post("")
async def add(request: WatchlistRequest) -> list[dict]:
    """Add a ticker and return the full watchlist."""
    try:
        await service.add_to_watchlist(request.ticker)
    except service.WatchlistError as exc:
        raise HTTPException(400, str(exc)) from exc
    return service.get_watchlist_with_prices()


@router.delete("/{ticker}")
async def remove(ticker: str) -> list[dict]:
    """Remove a ticker and return the full watchlist."""
    try:
        await service.remove_from_watchlist(ticker)
    except service.WatchlistError as exc:
        raise HTTPException(404, str(exc)) from exc
    return service.get_watchlist_with_prices()
