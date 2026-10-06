"""Tests for trades, snapshots and chat messages."""

from datetime import datetime
from uuid import UUID

from app import db


def test_insert_trade_returns_row():
    trade = db.insert_trade("AAPL", "buy", 1.5, 190.25)
    assert UUID(trade["id"])
    assert trade["ticker"] == "AAPL" and trade["side"] == "buy"
    assert trade["quantity"] == 1.5 and trade["price"] == 190.25
    assert datetime.fromisoformat(trade["executed_at"]).utcoffset().total_seconds() == 0


def test_insert_trade_persists():
    trade = db.insert_trade("TSLA", "sell", 2, 250.0)
    with db.transaction() as conn:
        row = dict(conn.execute("SELECT * FROM trades").fetchone())
    assert row == {**trade, "user_id": "default"}


def test_snapshots_oldest_first():
    for value in (100.0, 200.0, 300.0):
        db.insert_snapshot(value)
    snapshots = db.get_snapshots()
    assert [s["total_value"] for s in snapshots] == [100.0, 200.0, 300.0]
    assert set(snapshots[0]) == {"total_value", "recorded_at"}


def test_snapshots_limit_keeps_latest():
    for value in range(5):
        db.insert_snapshot(float(value))
    assert [s["total_value"] for s in db.get_snapshots(limit=2)] == [3.0, 4.0]


def test_chat_messages_round_trip():
    actions = {"trades": [{"ticker": "AAPL", "side": "buy", "quantity": 1, "status": "ok"}],
               "watchlist_changes": []}
    db.insert_chat_message("user", "buy apple")
    db.insert_chat_message("assistant", "Done.", actions)
    messages = db.get_chat_messages()
    assert [m["role"] for m in messages] == ["user", "assistant"]
    assert messages[0]["actions"] is None
    assert messages[1]["actions"] == actions
    assert set(messages[0]) == {"role", "content", "actions", "created_at"}


def test_chat_messages_limit_keeps_latest_oldest_first():
    for i in range(25):
        db.insert_chat_message("user", f"m{i}")
    messages = db.get_chat_messages()
    assert len(messages) == 20
    assert messages[0]["content"] == "m5" and messages[-1]["content"] == "m24"


def test_history_per_user():
    db.insert_snapshot(1.0, user_id="bob")
    db.insert_chat_message("user", "hi", user_id="bob")
    assert db.get_snapshots() == []
    assert db.get_chat_messages() == []
    assert len(db.get_snapshots(user_id="bob")) == 1
    assert len(db.get_chat_messages(user_id="bob")) == 1
