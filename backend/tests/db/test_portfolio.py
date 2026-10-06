"""Tests for cash and position queries."""

from app import db


def test_set_and_get_cash():
    db.set_cash(4321.5)
    assert db.get_cash() == 4321.5


def test_get_position_missing_returns_none():
    assert db.get_position("AAPL") is None


def test_upsert_inserts_then_updates():
    db.upsert_position("AAPL", 2, 100.0)
    first = db.get_position("AAPL")
    db.upsert_position("AAPL", 3.5, 120.0)
    second = db.get_position("AAPL")
    assert first["quantity"] == 2 and first["avg_cost"] == 100.0
    assert (second["ticker"], second["quantity"], second["avg_cost"]) == ("AAPL", 3.5, 120.0)
    assert second["updated_at"] >= first["updated_at"]
    assert len(db.get_positions()) == 1


def test_fractional_quantity_round_trips():
    db.upsert_position("TSLA", 0.123456789, 250.5)
    assert db.get_position("TSLA")["quantity"] == 0.123456789


def test_get_positions_shape_and_order():
    db.upsert_position("MSFT", 1, 400.0)
    db.upsert_position("AAPL", 2, 190.0)
    positions = db.get_positions()
    assert [p["ticker"] for p in positions] == ["AAPL", "MSFT"]
    assert set(positions[0]) == {"ticker", "quantity", "avg_cost", "updated_at"}


def test_delete_position():
    db.upsert_position("AAPL", 2, 100.0)
    db.delete_position("AAPL")
    assert db.get_position("AAPL") is None
    assert db.get_positions() == []


def test_delete_missing_position_is_noop():
    db.delete_position("NOPE")
    assert db.get_positions() == []


def test_users_are_isolated():
    with db.transaction() as conn:
        conn.execute(
            "INSERT INTO users_profile (user_id, cash_balance, created_at) VALUES ('bob', 1.0, 'x')"
        )
    db.upsert_position("AAPL", 5, 10.0, user_id="bob")
    assert db.get_cash(user_id="bob") == 1.0
    assert db.get_cash() == 10000.0
    assert db.get_position("AAPL") is None
    assert db.get_positions(user_id="bob")[0]["quantity"] == 5
