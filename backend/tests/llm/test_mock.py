"""Deterministic mock responses (CONTRACT.md section 7)."""

import pytest

from app.llm.mock import mock_response


@pytest.mark.parametrize("text, message", [
    ("Please BUY something", "Mock: buying 1 AAPL."),
    ("sell it", "Mock: selling 1 AAPL."),
    ("add a ticker", "Mock: adding PYPL to your watchlist."),
    ("remove one", "Mock: removing PYPL from your watchlist."),
    ("hello", "Mock: I am FinAlly, your AI trading assistant."),
])
def test_messages(text, message):
    assert mock_response(text).message == message


def test_buy_action():
    trade = mock_response("buy").trades[0]
    assert (trade.ticker, trade.side, trade.quantity) == ("AAPL", "buy", 1)


def test_sell_action():
    trade = mock_response("sell").trades[0]
    assert (trade.ticker, trade.side, trade.quantity) == ("AAPL", "sell", 1)


def test_watchlist_actions():
    assert mock_response("add").watchlist_changes[0].model_dump() == {"ticker": "PYPL", "action": "add"}
    assert mock_response("remove").watchlist_changes[0].model_dump() == {"ticker": "PYPL", "action": "remove"}


def test_first_match_wins():
    assert mock_response("sell and then buy").message == "Mock: buying 1 AAPL."


def test_default_has_no_actions():
    response = mock_response("hi")
    assert response.trades == [] and response.watchlist_changes == []


def test_returns_independent_copies():
    mock_response("buy").trades.clear()
    assert len(mock_response("buy").trades) == 1
