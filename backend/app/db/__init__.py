"""SQLite persistence layer (stdlib sqlite3, synchronous). See planning/CONTRACT.md section 4."""

from app.db.connection import init_db, transaction
from app.db.history import (
    get_chat_messages,
    get_snapshots,
    insert_chat_message,
    insert_snapshot,
    insert_trade,
)
from app.db.portfolio import (
    delete_position,
    get_cash,
    get_position,
    get_positions,
    set_cash,
    upsert_position,
)
from app.db.watchlist import add_watchlist, get_watchlist, remove_watchlist

__all__ = [
    "add_watchlist",
    "delete_position",
    "get_cash",
    "get_chat_messages",
    "get_position",
    "get_positions",
    "get_snapshots",
    "get_watchlist",
    "init_db",
    "insert_chat_message",
    "insert_snapshot",
    "insert_trade",
    "remove_watchlist",
    "set_cash",
    "transaction",
    "upsert_position",
]
