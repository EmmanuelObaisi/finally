"""Compatibility with the original persisted SQLite schema."""

import sqlite3

from app.db import _create_schema, _seed_defaults


def test_legacy_database_preserves_balances_positions_and_watchlist():
    with sqlite3.connect(":memory:") as conn:
        conn.row_factory = sqlite3.Row
        conn.executescript("""
            CREATE TABLE users_profile (
                user_id TEXT PRIMARY KEY, cash_balance REAL NOT NULL, created_at TEXT NOT NULL
            );
            INSERT INTO users_profile VALUES ('default', 4321, '2026-01-01');
            CREATE TABLE watchlist (
                user_id TEXT NOT NULL, ticker TEXT NOT NULL, added_at TEXT NOT NULL,
                PRIMARY KEY (user_id, ticker)
            );
            INSERT INTO watchlist VALUES ('default', 'CUSTOM', '2026-01-01');
            CREATE TABLE positions (
                user_id TEXT NOT NULL, ticker TEXT NOT NULL, quantity REAL NOT NULL,
                avg_cost REAL NOT NULL, updated_at TEXT NOT NULL,
                PRIMARY KEY (user_id, ticker)
            );
            INSERT INTO positions VALUES ('default', 'AAPL', 3, 150, '2026-01-01');
        """)
        _create_schema(conn)
        profile = conn.execute("SELECT * FROM users_profile").fetchone()
        assert profile["id"] == "default"
        assert profile["cash_balance"] == 4321
        position = conn.execute("SELECT * FROM positions").fetchone()
        assert (position["quantity"], position["avg_cost"]) == (3, 150)
        watch = conn.execute("SELECT * FROM watchlist").fetchone()
        assert watch["ticker"] == "CUSTOM"
        assert position["id"] and watch["id"]
        # Repeat initialization without changing identifiers or custom watchlist data.
        conn.execute("UPDATE watchlist SET group_key = 'custom'")
        _create_schema(conn)
        _seed_defaults(conn)
        assert conn.execute("SELECT id FROM positions").fetchone()[0] == position["id"]
        assert conn.execute("SELECT id FROM watchlist").fetchone()[0] == watch["id"]
