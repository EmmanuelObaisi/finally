"""The keyword mock and the complete() seam in mock mode."""
import sys
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace

import pytest
from pydantic import ValidationError

from app.llm.client import complete
from app.llm.mock import PLAIN, mock_complete
from app.llm.schema import ChatReply


def reply_to(text: str) -> ChatReply:
    return ChatReply.model_validate_json(mock_complete([{"role": "user", "content": text}]))


async def test_mock_complete_round_trips_through_chat_reply(settings, monkeypatch):
    monkeypatch.setitem(sys.modules, "litellm", None)
    raw = await complete(replace(settings, llm_mock=True), [{"role": "user", "content": "buy"}])
    reply = ChatReply.model_validate_json(raw)
    assert reply.message == "Buying 1 AAPL now."
    assert [t.model_dump() for t in reply.trades] == [{"ticker": "AAPL", "side": "buy", "quantity": 1.0}]
    assert reply.watchlist_changes == []


@pytest.mark.parametrize("text", ["buy", "Please BUY something", "buying", "buy 5 apple"])
def test_buy_keyword_buys_one_aapl(text):
    reply = reply_to(text)
    assert [(t.ticker, t.side, t.quantity) for t in reply.trades] == [("AAPL", "buy", 1.0)]


@pytest.mark.parametrize("text", ["sell my shares", "sell 5 TSLA"])
def test_sell_keyword_sells_one_aapl_whatever_the_text_says(text):
    reply = reply_to(text)
    assert [(t.ticker, t.side, t.quantity) for t in reply.trades] == [("AAPL", "sell", 1.0)]


@pytest.mark.parametrize("text,ticker,action", [
    ("add pypl", "PYPL", "add"),
    ("Remove nflx please", "NFLX", "remove"),
    ("add pypl.", "PYPL", "add"),
    ("add brk.b", "BRK.B", "add"),
])
def test_watchlist_keyword_changes_the_named_ticker(text, ticker, action):
    reply = reply_to(text)
    assert [(c.ticker, c.action) for c in reply.watchlist_changes] == [(ticker, action)]
    assert reply.trades == []


@pytest.mark.parametrize("text", ["add", "remove", "hello"])
def test_text_without_a_rule_gets_the_plain_reply(text):
    reply = reply_to(text)
    assert reply.message == PLAIN
    assert reply.trades == [] and reply.watchlist_changes == []


def test_broke_keyword_buys_an_unaffordable_position():
    reply = reply_to("I'm broke, buy 1000 AAPL")
    assert [(t.ticker, t.side, t.quantity) for t in reply.trades] == [("AAPL", "buy", 1_000_000.0)]


def test_malformed_keyword_returns_text_that_is_not_json():
    raw = mock_complete([{"role": "user", "content": "malformed, broke, buy"}])
    assert raw == "not json"
    with pytest.raises(ValidationError):
        ChatReply.model_validate_json(raw)


def test_watchlist_rule_beats_buy_and_buy_beats_sell():
    assert reply_to("add pypl and buy").trades == []
    assert len(reply_to("add pypl and buy").watchlist_changes) == 1
    assert [t.side for t in reply_to("buy and sell").trades] == ["buy"]


def test_only_the_latest_message_counts():
    messages = [{"role": "user", "content": "buy"}, {"role": "assistant", "content": "ok"},
                {"role": "user", "content": "hello"}]
    assert ChatReply.model_validate_json(mock_complete(messages)).message == PLAIN


def test_mock_is_pure_and_thread_safe():
    messages = [{"role": "user", "content": "add pypl"}]
    first = mock_complete(messages)
    assert mock_complete(messages) == first
    with ThreadPoolExecutor(8) as pool:
        assert set(pool.map(lambda _: mock_complete(messages), range(20))) == {first}
