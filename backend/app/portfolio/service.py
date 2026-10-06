"""Trade execution, portfolio valuation and watchlist management (CONTRACT.md section 5)."""

import re
import sqlite3

from app import db, deps

TICKER_PATTERN = re.compile(r"[A-Z][A-Z.]{0,9}")
QTY_TOLERANCE = 1e-9


class TradeError(ValueError):
    """A trade failed validation."""


class WatchlistError(ValueError):
    """A watchlist change failed validation."""


def normalize(ticker: str) -> str:
    """Upper-case and trim a ticker symbol."""
    return ticker.strip().upper()


def tracked_tickers() -> list[str]:
    """Tickers the market source must track: watchlist plus open positions."""
    watchlist = db.get_watchlist()
    held = [p["ticker"] for p in db.get_positions() if p["ticker"] not in watchlist]
    return watchlist + held


async def sync_ticker(ticker: str) -> None:
    """Track a ticker exactly when it is watched or held."""
    if ticker in db.get_watchlist() or db.get_position(ticker):
        await deps.market_source.add_ticker(ticker)
    else:
        await deps.market_source.remove_ticker(ticker)


async def execute_trade(ticker: str, side: str, quantity: float) -> dict:
    """Execute a market order at the cached price and return the trade row."""
    ticker = normalize(ticker)
    if side not in ("buy", "sell"):
        raise TradeError("Side must be 'buy' or 'sell'")
    if not quantity > 0:
        raise TradeError("Quantity must be greater than 0")
    if not TICKER_PATTERN.fullmatch(ticker):
        raise TradeError(f"Invalid ticker {ticker}")
    try:
        if side == "buy":
            await deps.market_source.add_ticker(ticker)
        price = deps.price_cache.get_price(ticker)
        if price is None:
            raise TradeError(f"Unknown ticker {ticker}")
        with db.transaction() as conn:
            apply = _apply_buy if side == "buy" else _apply_sell
            apply(conn, ticker, quantity, price)
            trade = db.insert_trade(ticker, side, quantity, price, conn=conn)
    finally:
        await sync_ticker(ticker)
    record_snapshot()
    return trade


def _apply_buy(conn: sqlite3.Connection, ticker: str, quantity: float, price: float) -> None:
    """Debit cash and grow the position at a blended average cost."""
    cost = quantity * price
    cash = db.get_cash(conn=conn)
    if cost > cash:
        raise TradeError(f"Insufficient cash: need ${cost:,.2f}, have ${cash:,.2f}")
    position = db.get_position(ticker, conn=conn)
    held = position["quantity"] if position else 0.0
    held_cost = held * position["avg_cost"] if position else 0.0
    new_quantity = held + quantity
    db.upsert_position(ticker, new_quantity, (held_cost + cost) / new_quantity, conn=conn)
    db.set_cash(cash - cost, conn=conn)


def _apply_sell(conn: sqlite3.Connection, ticker: str, quantity: float, price: float) -> None:
    """Credit cash and shrink the position, deleting it when it reaches zero."""
    position = db.get_position(ticker, conn=conn)
    held = position["quantity"] if position else 0.0
    if quantity > held + QTY_TOLERANCE:
        raise TradeError(f"Insufficient shares: have {held:g} {ticker}, tried to sell {quantity:g}")
    remaining = held - quantity
    if remaining <= QTY_TOLERANCE:
        db.delete_position(ticker, conn=conn)
    else:
        db.upsert_position(ticker, remaining, position["avg_cost"], conn=conn)
    db.set_cash(db.get_cash(conn=conn) + quantity * price, conn=conn)


def get_portfolio() -> dict:
    """Cash, positions valued at cached prices, totals and unrealized P&L."""
    cash = db.get_cash()
    positions = [_value_position(p) for p in db.get_positions()]
    positions_value = sum(p["market_value"] for p in positions)
    return {
        "cash_balance": round(cash, 2),
        "total_value": round(cash + positions_value, 2),
        "positions_value": round(positions_value, 2),
        "unrealized_pnl": round(sum(p["unrealized_pnl"] for p in positions), 2),
        "positions": positions,
    }


def _value_position(position: dict) -> dict:
    """Value one position at its cached price, falling back to cost when unpriced."""
    quantity, avg_cost = position["quantity"], position["avg_cost"]
    price = deps.price_cache.get_price(position["ticker"]) or avg_cost
    return {
        "ticker": position["ticker"],
        "quantity": quantity,
        "avg_cost": round(avg_cost, 4),
        "current_price": price,
        "market_value": round(quantity * price, 2),
        "unrealized_pnl": round(quantity * (price - avg_cost), 2),
        "pnl_percent": round((price / avg_cost - 1) * 100, 2),
    }


def record_snapshot() -> None:
    """Store the current total portfolio value."""
    db.insert_snapshot(get_portfolio()["total_value"])


def get_watchlist_with_prices() -> list[dict]:
    """Watchlist tickers with their latest cached prices (null fields when unpriced)."""
    return [_watch_item(ticker) for ticker in db.get_watchlist()]


def _watch_item(ticker: str) -> dict:
    """One WatchItem from the price cache."""
    update = deps.price_cache.get(ticker)
    if update is None:
        return {"ticker": ticker, "price": None, "previous_price": None, "change": None,
                "direction": None, "day_change_percent": None}
    data = update.to_dict()
    del data["timestamp"]
    return data


async def add_to_watchlist(ticker: str) -> None:
    """Add a ticker after confirming the market source can price it. No-op if present."""
    ticker = normalize(ticker)
    if not TICKER_PATTERN.fullmatch(ticker):
        raise WatchlistError(f"Invalid ticker {ticker}")
    if ticker in db.get_watchlist():
        return
    await deps.market_source.add_ticker(ticker)
    if deps.price_cache.get_price(ticker) is None:
        await sync_ticker(ticker)
        raise WatchlistError(f"Unknown ticker {ticker}")
    db.add_watchlist(ticker)


async def remove_from_watchlist(ticker: str) -> None:
    """Remove a ticker, keeping its price tracked while a position is open."""
    ticker = normalize(ticker)
    if not db.remove_watchlist(ticker):
        raise WatchlistError(f"{ticker} is not on the watchlist")
    await sync_ticker(ticker)
