"""Watchlist queries."""

from app.db.connection import now_iso, transaction


def get_watchlist(user_id: str = "default") -> list[str]:
    """Return watched tickers in the order they were added."""
    with transaction() as conn:
        rows = conn.execute(
            "SELECT ticker FROM watchlist WHERE user_id = ? ORDER BY added_at, rowid",
            (user_id,),
        ).fetchall()
    return [row["ticker"] for row in rows]


def add_watchlist(ticker: str, user_id: str = "default") -> bool:
    """Add a ticker; return False if it was already present."""
    with transaction() as conn:
        cursor = conn.execute(
            "INSERT OR IGNORE INTO watchlist (user_id, ticker, added_at) VALUES (?, ?, ?)",
            (user_id, ticker, now_iso()),
        )
    return cursor.rowcount == 1


def remove_watchlist(ticker: str, user_id: str = "default") -> bool:
    """Remove a ticker; return False if it was absent."""
    with transaction() as conn:
        cursor = conn.execute(
            "DELETE FROM watchlist WHERE user_id = ? AND ticker = ?", (user_id, ticker)
        )
    return cursor.rowcount == 1
