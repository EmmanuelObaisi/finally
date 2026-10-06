"""Append-only logs: trades, portfolio snapshots and chat messages."""

import json
import sqlite3
from uuid import uuid4

from app.db.connection import now_iso, transaction, use_connection


def insert_trade(
    ticker: str,
    side: str,
    quantity: float,
    price: float,
    conn: sqlite3.Connection | None = None,
    user_id: str = "default",
) -> dict:
    """Record an executed trade and return it as {id, ticker, side, quantity, price, executed_at}."""
    trade = {
        "id": str(uuid4()),
        "ticker": ticker,
        "side": side,
        "quantity": quantity,
        "price": price,
        "executed_at": now_iso(),
    }
    with use_connection(conn) as c:
        c.execute(
            "INSERT INTO trades (id, user_id, ticker, side, quantity, price, executed_at) "
            "VALUES (:id, :user_id, :ticker, :side, :quantity, :price, :executed_at)",
            {**trade, "user_id": user_id},
        )
    return trade


def insert_snapshot(total_value: float, user_id: str = "default") -> None:
    """Record the portfolio's total value at the current time."""
    with transaction() as conn:
        conn.execute(
            "INSERT INTO portfolio_snapshots (id, user_id, total_value, recorded_at) "
            "VALUES (?, ?, ?, ?)",
            (str(uuid4()), user_id, total_value, now_iso()),
        )


def get_snapshots(limit: int = 1000, user_id: str = "default") -> list[dict]:
    """Return the latest `limit` snapshots as {total_value, recorded_at}, oldest first."""
    with transaction() as conn:
        rows = conn.execute(
            "SELECT total_value, recorded_at FROM ("
            "  SELECT total_value, recorded_at, rowid AS seq FROM portfolio_snapshots"
            "  WHERE user_id = ? ORDER BY recorded_at DESC, rowid DESC LIMIT ?"
            ") ORDER BY recorded_at, seq",
            (user_id, limit),
        ).fetchall()
    return [dict(row) for row in rows]


def insert_chat_message(role: str, content: str, actions: dict | None = None, user_id: str = "default") -> None:
    """Store a chat message; actions are serialized to JSON."""
    with transaction() as conn:
        conn.execute(
            "INSERT INTO chat_messages (id, user_id, role, content, actions, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (str(uuid4()), user_id, role, content,
             json.dumps(actions) if actions is not None else None, now_iso()),
        )


def get_chat_messages(limit: int = 20, user_id: str = "default") -> list[dict]:
    """Return the latest `limit` messages as {role, content, actions, created_at}, oldest first."""
    with transaction() as conn:
        rows = conn.execute(
            "SELECT role, content, actions, created_at FROM ("
            "  SELECT role, content, actions, created_at, rowid AS seq FROM chat_messages"
            "  WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?"
            ") ORDER BY created_at, seq",
            (user_id, limit),
        ).fetchall()
    return [_chat_row(row) for row in rows]


def _chat_row(row: sqlite3.Row) -> dict:
    """Convert a chat row to a dict with actions decoded from JSON."""
    message = dict(row)
    if message["actions"] is not None:
        message["actions"] = json.loads(message["actions"])
    return message
