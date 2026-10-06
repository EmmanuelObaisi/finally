"""Cash balance and position queries."""

import sqlite3

from app.db.connection import now_iso, transaction, use_connection


def get_cash(conn: sqlite3.Connection | None = None, user_id: str = "default") -> float:
    """Return the user's cash balance."""
    with use_connection(conn) as c:
        row = c.execute(
            "SELECT cash_balance FROM users_profile WHERE user_id = ?", (user_id,)
        ).fetchone()
    return row["cash_balance"]


def set_cash(amount: float, conn: sqlite3.Connection | None = None, user_id: str = "default") -> None:
    """Set the user's cash balance."""
    with use_connection(conn) as c:
        c.execute("UPDATE users_profile SET cash_balance = ? WHERE user_id = ?", (amount, user_id))


def get_positions(user_id: str = "default") -> list[dict]:
    """Return all positions ordered by ticker."""
    with transaction() as conn:
        rows = conn.execute(
            "SELECT ticker, quantity, avg_cost, updated_at FROM positions "
            "WHERE user_id = ? ORDER BY ticker",
            (user_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_position(
    ticker: str, conn: sqlite3.Connection | None = None, user_id: str = "default"
) -> dict | None:
    """Return one position, or None if the ticker is not held."""
    with use_connection(conn) as c:
        row = c.execute(
            "SELECT ticker, quantity, avg_cost, updated_at FROM positions "
            "WHERE user_id = ? AND ticker = ?",
            (user_id, ticker),
        ).fetchone()
    return dict(row) if row else None


def upsert_position(
    ticker: str,
    quantity: float,
    avg_cost: float,
    conn: sqlite3.Connection | None = None,
    user_id: str = "default",
) -> None:
    """Insert or replace the position for a ticker."""
    with use_connection(conn) as c:
        c.execute(
            "INSERT INTO positions (user_id, ticker, quantity, avg_cost, updated_at) "
            "VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT (user_id, ticker) DO UPDATE SET "
            "quantity = excluded.quantity, avg_cost = excluded.avg_cost, "
            "updated_at = excluded.updated_at",
            (user_id, ticker, quantity, avg_cost, now_iso()),
        )


def delete_position(
    ticker: str, conn: sqlite3.Connection | None = None, user_id: str = "default"
) -> None:
    """Remove the position for a ticker."""
    with use_connection(conn) as c:
        c.execute("DELETE FROM positions WHERE user_id = ? AND ticker = ?", (user_id, ticker))
