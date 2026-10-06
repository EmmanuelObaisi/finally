"""SQLite connection handling, transactions and lazy initialization."""

import os
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

from app.db.schema import DEFAULT_CASH, DEFAULT_TICKERS, DEFAULT_USER, SCHEMA

PROJECT_ROOT = Path(__file__).resolve().parents[3]


def db_path() -> Path:
    """Return the database file path from DB_PATH, defaulting to <project root>/db/finally.db."""
    return Path(os.environ.get("DB_PATH") or PROJECT_ROOT / "db" / "finally.db")


def now_iso() -> str:
    """Return the current time as an ISO 8601 UTC string."""
    return datetime.now(UTC).isoformat()


@contextmanager
def transaction() -> Iterator[sqlite3.Connection]:
    """Open a connection and run one atomic write-locked unit: commit on success, roll back on error."""
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, isolation_level=None)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("BEGIN IMMEDIATE")
        yield conn
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        conn.close()


@contextmanager
def use_connection(conn: sqlite3.Connection | None) -> Iterator[sqlite3.Connection]:
    """Yield the caller's connection, or a fresh transaction when none is given."""
    if conn is not None:
        yield conn
        return
    with transaction() as new_conn:
        yield new_conn


def init_db() -> None:
    """Create tables if missing and seed the default user and watchlist on first run."""
    with transaction() as conn:
        for statement in SCHEMA.split(";"):
            conn.execute(statement)
        exists = conn.execute(
            "SELECT 1 FROM users_profile WHERE user_id = ?", (DEFAULT_USER,)
        ).fetchone()
        if not exists:
            _seed(conn)


def _seed(conn: sqlite3.Connection) -> None:
    """Insert the default user with starting cash and the default watchlist."""
    now = now_iso()
    conn.execute(
        "INSERT INTO users_profile (user_id, cash_balance, created_at) VALUES (?, ?, ?)",
        (DEFAULT_USER, DEFAULT_CASH, now),
    )
    conn.executemany(
        "INSERT INTO watchlist (user_id, ticker, added_at) VALUES (?, ?, ?)",
        [(DEFAULT_USER, ticker, now) for ticker in DEFAULT_TICKERS],
    )
