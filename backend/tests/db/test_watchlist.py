"""Tests for watchlist queries."""

from app import db
from app.db.schema import DEFAULT_TICKERS


def test_add_appends_in_order():
    assert db.add_watchlist("PYPL") is True
    assert db.add_watchlist("AMD") is True
    assert db.get_watchlist() == [*DEFAULT_TICKERS, "PYPL", "AMD"]


def test_add_existing_returns_false():
    assert db.add_watchlist("AAPL") is False
    assert db.get_watchlist().count("AAPL") == 1


def test_remove_present_and_absent():
    assert db.remove_watchlist("AAPL") is True
    assert db.remove_watchlist("AAPL") is False
    assert "AAPL" not in db.get_watchlist()


def test_readd_moves_to_end():
    db.remove_watchlist("AAPL")
    db.add_watchlist("AAPL")
    assert db.get_watchlist()[-1] == "AAPL"


def test_watchlist_per_user():
    assert db.get_watchlist(user_id="bob") == []
    assert db.add_watchlist("AAPL", user_id="bob") is True
    assert db.get_watchlist(user_id="bob") == ["AAPL"]
    assert db.remove_watchlist("AAPL", user_id="bob") is True
    assert "AAPL" in db.get_watchlist()
