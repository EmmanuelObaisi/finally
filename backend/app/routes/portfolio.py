"""Portfolio, trade and history endpoints."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import db
from app.portfolio import service

router = APIRouter(prefix="/api/portfolio")


class TradeRequest(BaseModel):
    """Body of POST /api/portfolio/trade. Side is validated by the service (400, not 422)."""

    ticker: str
    quantity: float
    side: str


@router.get("")
def get_portfolio() -> dict:
    """Cash, positions and totals at current prices."""
    return service.get_portfolio()


@router.post("/trade")
async def trade(request: TradeRequest) -> dict:
    """Execute a market order and return the trade with the updated portfolio."""
    try:
        executed = await service.execute_trade(request.ticker, request.side, request.quantity)
    except service.TradeError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"trade": executed, "portfolio": service.get_portfolio()}


@router.get("/history")
def history() -> list[dict]:
    """The last 1000 portfolio value snapshots, oldest first."""
    return db.get_snapshots()
