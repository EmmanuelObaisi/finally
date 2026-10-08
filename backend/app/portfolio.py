"""Portfolio read: cash plus positions valued from one price-cache snapshot."""
import logging

from fastapi import APIRouter, Request

from .db import USER_ID, connect

logger = logging.getLogger(__name__)
router = APIRouter()


def build_portfolio(conn, cache) -> dict:
    """Cash, positions with P&L and totals. A held ticker with no price is valued at avg_cost."""
    cash = conn.execute(
        "SELECT cash_balance FROM users_profile WHERE user_id = ?", (USER_ID,)
    ).fetchone()["cash_balance"]
    rows = conn.execute(
        "SELECT ticker, quantity, avg_cost FROM positions WHERE user_id = ? ORDER BY ticker",
        (USER_ID,),
    ).fetchall()
    prices = cache.get_all()
    positions = []
    for row in rows:
        ticker, quantity, avg_cost = row["ticker"], row["quantity"], row["avg_cost"]
        if ticker in prices:
            price = prices[ticker].price
        else:
            logger.error("No cached price for held ticker %s; valuing at avg cost", ticker)
            price = avg_cost
        positions.append({
            "ticker": ticker,
            "quantity": round(quantity, 6),
            "avg_cost": round(avg_cost, 2),
            "current_price": round(price, 2),
            "market_value": round(quantity * price, 2),
            "unrealized_pnl": round((price - avg_cost) * quantity, 2),
            "pnl_percent": round((price / avg_cost - 1) * 100, 4),
        })
    return {
        "cash": round(cash, 2),
        "total_value": round(cash + sum(p["market_value"] for p in positions), 2),
        "unrealized_pnl": round(sum(p["unrealized_pnl"] for p in positions), 2),
        "positions": positions,
    }


@router.get("/api/portfolio")
def get_portfolio(request: Request) -> dict:
    """Current cash, positions and totals."""
    with connect(request.app.state.settings.db_path) as conn:
        return build_portfolio(conn, request.app.state.cache)
