"""Prompt assembly: system rules, portfolio context and outcome-annotated history."""
import copy
import json

import pytest

from app.llm.prompt import HISTORY_LIMIT, SYSTEM_PROMPT, action_line, build_context, build_messages

D01 = ("Only put an entry in trades or watchlist_changes when the user explicitly asks for it or "
       "agrees to your suggestion. Questions, hypotheticals and analysis get empty lists.")


def position(ticker, market_value):
    return {"ticker": ticker, "quantity": 10.0, "avg_cost": 100.0, "current_price": market_value / 10,
            "market_value": market_value, "unrealized_pnl": 5.0, "pnl_percent": 1.5}


def portfolio(cash=5000.0, total=10000.0, positions=None):
    return {"cash": cash, "total_value": total, "unrealized_pnl": 12.5,
            "positions": positions if positions is not None else [position("AAPL", 5000.0)]}


def context(**kwargs):
    return json.loads(build_context(portfolio(**kwargs), [{"ticker": "AAPL", "price": 190.0, "change": 1}]))


def test_system_prompt_carries_the_decided_rules():
    assert D01 in SYSTEM_PROMPT
    for phrase in ("weight_percent", "cash_percent", "never claim", "square brackets",
                   "real stock ticker", "suggest"):
        assert phrase.lower() in SYSTEM_PROMPT.lower()


def test_history_limit_is_twenty():
    assert HISTORY_LIMIT == 20


def test_context_precomputes_cash_and_position_weights():
    data = context()
    assert data["cash_percent"] == 50.0
    assert data["positions"][0]["weight_percent"] == 50.0


def test_context_weight_of_a_quarter_position():
    assert context(positions=[position("AAPL", 2500.0)])["positions"][0]["weight_percent"] == 25.0


def test_context_with_zero_total_value_has_zero_percents():
    data = context(cash=0.0, total=0.0, positions=[position("AAPL", 0.0)])
    assert data["cash_percent"] == 0.0
    assert data["positions"][0]["weight_percent"] == 0.0


def test_context_keeps_the_position_numbers_and_trims_the_watchlist():
    data = context()
    assert {"cash", "total_value", "unrealized_pnl"} <= data.keys()
    assert {"quantity", "avg_cost", "current_price", "market_value", "unrealized_pnl",
            "pnl_percent"} <= data["positions"][0].keys()
    assert data["watchlist"] == [{"ticker": "AAPL", "price": 190.0}]


def test_context_keeps_null_price_for_unpriced_watchlist_item():
    data = json.loads(build_context(portfolio(), [{"ticker": "XYZ", "price": None}]))
    assert data["watchlist"] == [{"ticker": "XYZ", "price": None}]


@pytest.mark.parametrize("action,line", [
    ({"type": "trade", "ticker": "AAPL", "side": "buy", "quantity": 5.0, "price": 190.12, "ok": True, "error": None},
     "[Executed: bought 5 AAPL at $190.12]"),
    ({"type": "trade", "ticker": "AAPL", "side": "sell", "quantity": 2.5, "price": 1234.5, "ok": True, "error": None},
     "[Executed: sold 2.5 AAPL at $1,234.50]"),
    ({"type": "trade", "ticker": "AAPL", "side": "sell", "quantity": 20.0, "price": None, "ok": False,
      "error": "Insufficient shares: you hold 10 AAPL"},
     "[Failed: sell 20 AAPL - Insufficient shares: you hold 10 AAPL]"),
    ({"type": "watchlist", "ticker": "PYPL", "action": "add", "ok": True, "error": None},
     "[Watchlist: added PYPL]"),
    ({"type": "watchlist", "ticker": "PYPL", "action": "remove", "ok": True, "error": None},
     "[Watchlist: removed PYPL]"),
    ({"type": "watchlist", "ticker": "XYZ", "action": "add", "ok": False, "error": "Unknown ticker"},
     "[Failed: add XYZ - Unknown ticker]"),
])
def test_action_line_formats(action, line):
    assert action_line(action) == line


def history():
    action = {"type": "trade", "ticker": "AAPL", "side": "buy", "quantity": 5.0, "price": 190.12,
              "ok": True, "error": None}
    return [
        {"role": "user", "content": "buy 5 aapl", "actions": None},
        {"role": "assistant", "content": "Buying 5 AAPL now.", "actions": [action]},
        {"role": "user", "content": "thanks", "actions": None},
        {"role": "assistant", "content": "Welcome.", "actions": []},
    ]


def test_build_messages_orders_system_history_then_new_user_text():
    messages = build_messages(portfolio(), [], history(), "what now?")
    assert messages[0]["role"] == "system"
    assert SYSTEM_PROMPT in messages[0]["content"]
    assert json.loads(messages[0]["content"].split("Current state (JSON):\n")[1])["cash"] == 5000.0
    assert [m["role"] for m in messages[1:]] == ["user", "assistant", "user", "assistant", "user"]
    assert messages[-1] == {"role": "user", "content": "what now?"}


def test_assistant_history_gets_outcome_lines_and_others_stay_raw():
    messages = build_messages(portfolio(), [], history(), "next")
    assert messages[1]["content"] == "buy 5 aapl"
    assert messages[2]["content"] == "Buying 5 AAPL now.\n[Executed: bought 5 AAPL at $190.12]"
    assert messages[3]["content"] == "thanks"
    assert messages[4]["content"] == "Welcome."


def test_build_messages_does_not_mutate_the_stored_rows():
    rows = history()
    before = copy.deepcopy(rows)
    build_messages(portfolio(), [], rows, "next")
    assert rows == before
