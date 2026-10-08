import sqlite3

import pytest
from fastapi.testclient import TestClient

from app.db import DEFAULT_TICKERS, connect, init_db, load_tracked_tickers, now_iso
from app.main import create_app

TABLES = ("users_profile", "watchlist", "positions", "trades", "portfolio_snapshots", "chat_messages")


def count(conn, table):
    return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]


def add_position(conn, ticker, user_id="default", quantity=1.0, avg_cost=10.0):
    conn.execute(
        "INSERT INTO positions (user_id, ticker, quantity, avg_cost, updated_at) VALUES (?, ?, ?, ?, ?)",
        (user_id, ticker, quantity, avg_cost, now_iso()),
    )


def test_init_db_creates_directories_file_and_seed(tmp_path):
    path = tmp_path / "a" / "b" / "f.db"
    init_db(path)
    with connect(path) as conn:
        profile = conn.execute("SELECT user_id, cash_balance FROM users_profile").fetchall()
        tickers = [r["ticker"] for r in conn.execute("SELECT ticker FROM watchlist ORDER BY rowid")]
        snaps = conn.execute("SELECT total_value FROM portfolio_snapshots").fetchall()
        mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
    assert path.is_file()
    assert [tuple(r) for r in profile] == [("default", 10000.0)]
    assert tickers == list(DEFAULT_TICKERS)
    assert [r["total_value"] for r in snaps] == [10000.0]
    assert mode == "wal"


def test_init_db_is_idempotent(tmp_path):
    path = tmp_path / "f.db"
    for _ in range(3):
        init_db(path)
    with connect(path) as conn:
        assert (count(conn, "users_profile"), count(conn, "watchlist"),
                count(conn, "portfolio_snapshots")) == (1, 10, 1)


def test_init_db_keeps_user_data_on_restart(tmp_path):
    path = tmp_path / "f.db"
    init_db(path)
    with connect(path) as conn:
        conn.execute("UPDATE users_profile SET cash_balance = ?", (1234.5,))
        conn.execute("DELETE FROM watchlist WHERE ticker = ?", ("NFLX",))
    init_db(path)
    with connect(path) as conn:
        cash = conn.execute("SELECT cash_balance FROM users_profile").fetchone()[0]
        nflx = conn.execute("SELECT 1 FROM watchlist WHERE ticker = 'NFLX'").fetchone()
        assert (cash, nflx, count(conn, "portfolio_snapshots")) == (1234.5, None, 1)


def test_schema_keys_and_user_id_defaults(tmp_path):
    path = tmp_path / "f.db"
    init_db(path)
    with connect(path) as conn:
        info = {t: conn.execute(f"PRAGMA table_info({t})").fetchall() for t in TABLES}
    pk = {t: [c["name"] for c in sorted((c for c in cols if c["pk"]), key=lambda c: c["pk"])]
          for t, cols in info.items()}
    assert pk["users_profile"] == ["user_id"]
    assert pk["watchlist"] == pk["positions"] == ["user_id", "ticker"]
    for table in ("trades", "portfolio_snapshots", "chat_messages"):
        id_col = next(c for c in info[table] if c["name"] == "id")
        assert pk[table] == ["id"] and id_col["type"] == "TEXT"
    for table, cols in info.items():
        user_id = next(c for c in cols if c["name"] == "user_id")
        assert user_id["notnull"] == 1 and user_id["dflt_value"] == "'default'", table


def test_duplicate_ticker_per_user_rejected_other_user_accepted(tmp_path):
    path = tmp_path / "f.db"
    init_db(path)
    with connect(path) as conn:
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute("INSERT INTO watchlist (user_id, ticker, added_at) VALUES ('default', 'AAPL', 'x')")
        conn.execute("INSERT INTO watchlist (user_id, ticker, added_at) VALUES ('other', 'AAPL', 'x')")
        add_position(conn, "AAPL")
        with pytest.raises(sqlite3.IntegrityError):
            add_position(conn, "AAPL")
        add_position(conn, "AAPL", user_id="other")


def test_check_constraints_reject_bad_values(tmp_path):
    path = tmp_path / "f.db"
    init_db(path)
    with connect(path) as conn:
        with pytest.raises(sqlite3.IntegrityError):
            add_position(conn, "TSLA", quantity=0)
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute("UPDATE users_profile SET cash_balance = -1")


def test_load_tracked_tickers_is_watchlist_then_sorted_held_only(tmp_path):
    path = tmp_path / "f.db"
    init_db(path)
    with connect(path) as conn:
        assert load_tracked_tickers(conn) == list(DEFAULT_TICKERS)
        add_position(conn, "PYPL")
        add_position(conn, "AAPL")
        assert load_tracked_tickers(conn) == [*DEFAULT_TICKERS, "PYPL"]


def test_app_start_creates_and_recreates_database(settings):
    with TestClient(create_app(settings)):
        assert settings.db_path.is_file()
    for suffix in ("", "-wal", "-shm"):
        settings.db_path.with_name(settings.db_path.name + suffix).unlink(missing_ok=True)
    with TestClient(create_app(settings)) as client:
        items = client.get("/api/watchlist").json()["watchlist"]
    assert settings.db_path.is_file()
    assert len(items) == 10
