"""Market orders: one atomic fill per request, shared by the trade route and Phase 5 chat."""
import asyncio
import uuid
from typing import Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from .db import USER_ID, connect, now_iso, transaction
from .errors import DomainError
from .portfolio import build_portfolio
from .tracking import normalize_ticker, sync_ticker

router = APIRouter()


class TradeRequest(BaseModel):
    """Trade body. Strict quantity rejects strings and booleans; NaN and infinity are refused."""

    ticker: str
    quantity: float = Field(strict=True, allow_inf_nan=False)
    side: Literal["buy", "sell"]


def qty_text(quantity: float) -> str:
    """A quantity at up to 6 dp without trailing zeros: 1.5 -> '1.5', 10.0 -> '10'."""
    return f"{quantity:.6f}".rstrip("0").rstrip(".")


def execute_trade(conn, cache, ticker: str, side: str, quantity: float) -> dict:
    """Fill a market order atomically and return {"trade", "portfolio"}.

    A rejection raises DomainError and changes nothing.
    """
    quantity = round(quantity, 6)
    if not quantity > 0:
        raise DomainError("Quantity must be greater than 0")
    with transaction(conn):
        cash = conn.execute(
            "SELECT cash_balance FROM users_profile WHERE user_id = ?", (USER_ID,)
        ).fetchone()["cash_balance"]
        row = conn.execute(
            "SELECT quantity, avg_cost FROM positions WHERE user_id = ? AND ticker = ?",
            (USER_ID, ticker),
        ).fetchone()
        held, avg = (row["quantity"], row["avg_cost"]) if row else (0.0, 0.0)
        if side == "sell" and quantity > held:
            raise DomainError(f"Insufficient shares: you hold {qty_text(held)} {ticker}")
        price = cache.get_price(ticker)
        if price is None:
            raise DomainError(f"No price available for {ticker}")
        amount = round(price * quantity, 2)
        if amount <= 0:
            raise DomainError("Order value is too small")
        if side == "buy" and amount > cash:
            raise DomainError("Insufficient cash")
        now = now_iso()
        if side == "buy":
            new_qty = round(held + quantity, 6)
            new_avg = round((held * avg + quantity * price) / new_qty, 6)
            cash = round(cash - amount, 2)
            conn.execute(
                "INSERT INTO positions (user_id, ticker, quantity, avg_cost, updated_at) "
                "VALUES (?, ?, ?, ?, ?) ON CONFLICT (user_id, ticker) DO UPDATE SET "
                "quantity = excluded.quantity, avg_cost = excluded.avg_cost, "
                "updated_at = excluded.updated_at",
                (USER_ID, ticker, new_qty, new_avg, now),
            )
        else:
            new_qty = round(held - quantity, 6)
            cash = round(cash + amount, 2)
            if new_qty == 0:
                conn.execute(
                    "DELETE FROM positions WHERE user_id = ? AND ticker = ?", (USER_ID, ticker)
                )
            else:
                conn.execute(
                    "UPDATE positions SET quantity = ?, updated_at = ? "
                    "WHERE user_id = ? AND ticker = ?",
                    (new_qty, now, USER_ID, ticker),
                )
        conn.execute("UPDATE users_profile SET cash_balance = ? WHERE user_id = ?", (cash, USER_ID))
        trade_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO trades (id, user_id, ticker, side, quantity, price, executed_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (trade_id, USER_ID, ticker, side, quantity, price, now),
        )
        portfolio = build_portfolio(conn, cache)
        conn.execute(
            "INSERT INTO portfolio_snapshots (id, user_id, total_value, recorded_at) "
            "VALUES (?, ?, ?, ?)",
            (str(uuid.uuid4()), USER_ID, portfolio["total_value"], now),
        )
    trade = {"id": trade_id, "ticker": ticker, "side": side, "quantity": quantity,
             "price": price, "executed_at": now}
    return {"trade": trade, "portfolio": portfolio}


def run_trade(state, ticker: str, side: str, quantity: float) -> dict:
    """Open a connection and fill one order."""
    with connect(state.settings.db_path) as conn:
        return execute_trade(conn, state.cache, ticker, side, quantity)


async def place_trade(state, raw_ticker: str, side: str, quantity: float) -> dict:
    """Validate the ticker and fill off the event loop; shared with Phase 5 chat."""
    ticker = normalize_ticker(raw_ticker)
    try:
        if side == "buy":
            await state.source.add_ticker(ticker)
        return await asyncio.to_thread(run_trade, state, ticker, side, quantity)
    finally:
        await sync_ticker(state, ticker)


@router.post("/api/portfolio/trade")
async def trade(body: TradeRequest, request: Request) -> dict:
    """Fill a market order at the current cached price."""
    return await place_trade(request.app.state, body.ticker, body.side, body.quantity)
