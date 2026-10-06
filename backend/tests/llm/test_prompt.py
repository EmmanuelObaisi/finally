"""Prompt and message construction."""

from app.llm.prompt import build_messages


def test_message_order_and_context():
    history = [{"role": "user", "content": "hi", "actions": None},
               {"role": "assistant", "content": "hello", "actions": None}]
    messages = build_messages("buy AAPL", {"cash_balance": 123.0}, [{"ticker": "AAPL", "price": 190.0}], history)
    assert [m["role"] for m in messages] == ["system", "user", "assistant", "user"]
    assert "FinAlly, an AI trading assistant" in messages[0]["content"]
    assert '"cash_balance": 123.0' in messages[0]["content"]
    assert '"ticker": "AAPL"' in messages[0]["content"]
    assert messages[-1] == {"role": "user", "content": "buy AAPL"}


def test_history_includes_actions():
    actions = {"trades": [{"ticker": "AAPL", "status": "ok"}], "watchlist_changes": []}
    history = [{"role": "assistant", "content": "Bought.", "actions": actions}]
    content = build_messages("ok", {}, [], history)[1]["content"]
    assert content.startswith("Bought.")
    assert "Executed actions" in content and '"AAPL"' in content
