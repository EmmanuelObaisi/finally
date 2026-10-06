"""Tests for init_db, DB_PATH handling and transactions."""

import sqlite3

import pytest

from app import db
from app.db.connection import PROJECT_ROOT, db_path
from app.db.schema import DEFAULT_TICKERS

TABLES = {"users_profile", "watchlist", "positions", "trades", "portfolio_snapshots", "chat_messages"}


def test_init_creates_all_tables(fresh_db):
    conn = sqlite3.connect(fresh_db)
    names = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    conn.close()
    assert TABLES <= names


def test_seed_defaults():
    assert db.get_cash() == 10000.0
    assert db.get_watchlist() == DEFAULT_TICKERS


def test_init_is_idempotent():
    db.set_cash(123.0)
    db.remove_watchlist("AAPL")
    db.init_db()
    assert db.get_cash() == 123.0
    assert "AAPL" not in db.get_watchlist()


def test_init_creates_missing_parent_dir(tmp_path, monkeypatch):
    path = tmp_path / "nested" / "dir" / "x.db"
    monkeypatch.setenv("DB_PATH", str(path))
    db.init_db()
    assert path.exists()


def test_default_path_is_project_db(monkeypatch):
    monkeypatch.delenv("DB_PATH")
    assert db_path() == PROJECT_ROOT / "db" / "finally.db"
    assert (PROJECT_ROOT / "backend").is_dir()


def test_transaction_commits():
    with db.transaction() as conn:
        db.set_cash(50.0, conn)
        db.upsert_position("AAPL", 1, 10.0, conn)
    assert db.get_cash() == 50.0
    assert db.get_position("AAPL")["quantity"] == 1


def test_transaction_rolls_back_on_error():
    with pytest.raises(RuntimeError):
        with db.transaction() as conn:
            db.set_cash(50.0, conn)
            db.upsert_position("AAPL", 1, 10.0, conn)
            db.insert_trade("AAPL", "buy", 1, 10.0, conn)
            raise RuntimeError("boom")
    assert db.get_cash() == 10000.0
    assert db.get_position("AAPL") is None
    with db.transaction() as conn:
        assert conn.execute("SELECT COUNT(*) FROM trades").fetchone()[0] == 0
