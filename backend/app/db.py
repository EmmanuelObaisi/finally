"""SQLite schema, seed and connections. One short-lived connection per request."""
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

USER_ID = "default"
DEFAULT_TICKERS = ("AAPL", "GOOGL", "MSFT", "AMZN", "TSLA", "NVDA", "META", "JPM", "V", "NFLX")
STARTING_CASH = 10000.0

SCHEMA = """
CREATE TABLE IF NOT EXISTS users_profile (
    user_id TEXT NOT NULL DEFAULT 'default' PRIMARY KEY,
    cash_balance REAL NOT NULL DEFAULT 10000.0 CHECK (cash_balance >= 0),
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS watchlist (
    user_id TEXT NOT NULL DEFAULT 'default',
    ticker TEXT NOT NULL,
    added_at TEXT NOT NULL,
    PRIMARY KEY (user_id, ticker)
);
CREATE TABLE IF NOT EXISTS positions (
    user_id TEXT NOT NULL DEFAULT 'default',
    ticker TEXT NOT NULL,
    quantity REAL NOT NULL CHECK (quantity > 0),
    avg_cost REAL NOT NULL CHECK (avg_cost > 0),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, ticker)
);
CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'default',
    ticker TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    quantity REAL NOT NULL CHECK (quantity > 0),
    price REAL NOT NULL,
    executed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'default',
    total_value REAL NOT NULL,
    recorded_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'default',
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    actions TEXT,
    created_at TEXT NOT NULL
);
"""


def now_iso() -> str:
    """Current UTC time in the contract's REST timestamp format."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


@contextmanager
def connect(db_path: Path):
    """Open an autocommit connection with Row access; always closed on exit."""
    conn = sqlite3.connect(db_path, autocommit=True)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def init_db(db_path: Path) -> None:
    """Create the file and schema, and seed defaults only into a fresh database."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with connect(db_path) as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(SCHEMA)
        conn.execute("BEGIN IMMEDIATE")
        if conn.execute("SELECT 1 FROM users_profile WHERE user_id = ?", (USER_ID,)).fetchone() is None:
            now = now_iso()
            conn.execute(
                "INSERT INTO users_profile (user_id, cash_balance, created_at) VALUES (?, ?, ?)",
                (USER_ID, STARTING_CASH, now),
            )
            conn.executemany(
                "INSERT INTO watchlist (user_id, ticker, added_at) VALUES (?, ?, ?)",
                [(USER_ID, ticker, now) for ticker in DEFAULT_TICKERS],
            )
            conn.execute(
                "INSERT INTO portfolio_snapshots (id, user_id, total_value, recorded_at) VALUES (?, ?, ?, ?)",
                (str(uuid.uuid4()), USER_ID, STARTING_CASH, now),
            )
        conn.execute("COMMIT")


def load_tracked_tickers(conn: sqlite3.Connection) -> list[str]:
    """Watchlist tickers in insertion order, then held tickers not on the watchlist, sorted."""
    watched = conn.execute(
        "SELECT ticker FROM watchlist WHERE user_id = ? ORDER BY rowid", (USER_ID,)
    ).fetchall()
    held_only = conn.execute(
        "SELECT ticker FROM positions WHERE user_id = ? "
        "AND ticker NOT IN (SELECT ticker FROM watchlist WHERE user_id = ?) ORDER BY ticker",
        (USER_ID, USER_ID),
    ).fetchall()
    return [row["ticker"] for row in watched + held_only]
