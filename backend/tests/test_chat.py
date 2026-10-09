"""Chat flow: POST /api/chat and GET /api/chat/history through the real services."""
import asyncio
import json
import logging
import re
import sqlite3
import sys
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import FIXED_PRICES, FixedPriceSource

GENERIC = (
    "The AI assistant could not complete that request. "
    "No trades or watchlist changes were made. Try again in a moment."
)
NOT_CONFIGURED = "The AI assistant is not configured: OPENROUTER_API_KEY is missing."
OVER_CAP = "Too many actions in one reply"


@pytest.fixture
def mock_client(settings, monkeypatch):
    """TestClient with LLM_MOCK on and fixed prices."""
    monkeypatch.setattr(
        "app.main.create_market_data_source",
        lambda cache, _settings: FixedPriceSource(cache, dict(FIXED_PRICES)),
    )
    with TestClient(create_app(replace(settings, llm_mock=True))) as test_client:
        yield test_client


def scripted(raw):
    """An async stand-in for app.chat.complete that returns a fixed raw reply."""
    async def fake(_settings, _messages):
        return raw
    return fake


def recording(raw, seen):
    """Like scripted, and appends each messages argument to `seen`."""
    async def fake(_settings, messages):
        seen.append(messages)
        return raw
    return fake


def raising(exc):
    """An async stand-in for app.chat.complete that raises."""
    async def fake(_settings, _messages):
        raise exc
    return fake


def reply_json(message="ok", trades=(), changes=()) -> str:
    """A valid raw model reply."""
    return json.dumps({"message": message, "trades": list(trades),
                       "watchlist_changes": list(changes)})


def buy(ticker="AAPL", quantity=1, side="buy") -> dict:
    return {"ticker": ticker, "side": side, "quantity": quantity}


def wl(ticker, action="add") -> dict:
    return {"ticker": ticker, "action": action}


def say(client, monkeypatch, raw, text="go") -> dict:
    """Script the model's raw reply, post one message and return the JSON body."""
    monkeypatch.setattr("app.chat.complete", scripted(raw))
    response = client.post("/api/chat", json={"message": text})
    assert response.status_code == 200
    return response.json()


def query(settings, sql, params=()) -> list[sqlite3.Row]:
    conn = sqlite3.connect(settings.db_path)
    conn.row_factory = sqlite3.Row
    try:
        return conn.execute(sql, params).fetchall()
    finally:
        conn.close()


def chat_rows(settings) -> list[sqlite3.Row]:
    """All stored chat rows in insertion order."""
    return query(settings, "SELECT role, content, actions, created_at FROM chat_messages ORDER BY rowid")


def count(settings, table) -> int:
    return query(settings, f"SELECT COUNT(*) AS n FROM {table}")[0]["n"]


def insert_rows(settings, rows):
    """Insert (role, content, created_at) chat rows with parameterized SQL."""
    conn = sqlite3.connect(settings.db_path)
    try:
        for i, (role, content, created_at) in enumerate(rows):
            conn.execute(
                "INSERT INTO chat_messages (id, user_id, role, content, actions, created_at) "
                "VALUES (?, 'default', ?, ?, NULL, ?)", (f"id{i}", role, content, created_at))
        conn.commit()
    finally:
        conn.close()


# --- tracer and shape ---

def test_response_shape_in_mock_mode(mock_client):
    response = mock_client.post("/api/chat", json={"message": "hello"})
    body = response.json()
    assert response.status_code == 200
    assert set(body) == {"message", "actions", "portfolio", "watchlist"}
    assert body["actions"] == []
    assert len(body["watchlist"]) == 10


def test_response_shape_portfolio_and_watchlist_keys(mock_client):
    body = mock_client.post("/api/chat", json={"message": "hello"}).json()
    assert set(body["portfolio"]) == {"cash", "total_value", "unrealized_pnl", "positions"}
    assert set(body["watchlist"][0]) == {
        "ticker", "price", "previous_price", "timestamp", "change", "change_percent",
        "direction", "session_start_price"}


def test_tracer_buy_fills_and_persists_the_pair(mock_client):
    body = mock_client.post("/api/chat", json={"message": "buy"}).json()
    assert body["actions"] == [{
        "type": "trade", "ticker": "AAPL", "side": "buy", "quantity": 1.0,
        "price": 100.0, "ok": True, "error": None,
    }]
    assert body["portfolio"]["cash"] == 9900.0
    messages = mock_client.get("/api/chat/history").json()["messages"]
    assert [m["role"] for m in messages] == ["user", "assistant"]
    assert messages[0]["content"] == "buy"
    assert messages[0]["actions"] is None
    assert messages[1]["content"] == "Buying 1 AAPL now."
    assert messages[1]["actions"] == body["actions"]


# --- validation ---

@pytest.mark.parametrize("text", ["", "   ", "\n\t "])
def test_empty_message_is_400_and_stores_nothing(mock_client, settings, text):
    response = mock_client.post("/api/chat", json={"message": text})
    assert response.status_code == 400
    assert response.json() == {"error": "Message must not be empty"}
    assert count(settings, "chat_messages") == 0


@pytest.mark.parametrize("body", [{}, {"message": 5}])
def test_empty_message_bad_body_is_400(mock_client, settings, body):
    response = mock_client.post("/api/chat", json=body)
    assert response.status_code == 400
    assert "error" in response.json()
    assert count(settings, "chat_messages") == 0


def test_too_long_boundary(mock_client, settings):
    assert mock_client.post("/api/chat", json={"message": "x" * 2000}).status_code == 200
    response = mock_client.post("/api/chat", json={"message": "x" * 2001})
    assert response.status_code == 400
    assert response.json() == {"error": "Message is too long"}
    assert count(settings, "chat_messages") == 2


def test_too_long_counts_stripped_text_and_stores_it_stripped(mock_client, settings):
    response = mock_client.post("/api/chat", json={"message": "   " + "x" * 2000 + "   "})
    assert response.status_code == 200
    assert chat_rows(settings)[0]["content"] == "x" * 2000


def test_too_long_counts_code_points(mock_client, settings):
    emoji = "\U0001F600"
    assert mock_client.post("/api/chat", json={"message": emoji * 2000}).status_code == 200
    response = mock_client.post("/api/chat", json={"message": emoji * 2001})
    assert response.status_code == 400
    assert response.json() == {"error": "Message is too long"}
    assert count(settings, "chat_messages") == 2


def test_unencodable_text_is_400_with_no_side_effects(mock_client, settings):
    body = '{"message": "buy \\ud800"}'  # httpx cannot encode a lone surrogate, so send the escape
    response = mock_client.post(
        "/api/chat", content=body, headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json() == {"error": "Message contains invalid characters"}
    assert mock_client.get("/api/portfolio").json()["cash"] == 10000.0
    assert count(settings, "trades") == 0
    assert mock_client.get("/api/chat/history").json() == {"messages": []}


# --- execution ---

def test_execute_buy_then_sell(client, settings, monkeypatch):
    before = count(settings, "portfolio_snapshots")
    body = say(client, monkeypatch, reply_json(trades=[buy(quantity=5)]))
    assert body["actions"] == [{
        "type": "trade", "ticker": "AAPL", "side": "buy", "quantity": 5.0,
        "price": 100.0, "ok": True, "error": None}]
    assert body["portfolio"]["cash"] == 9500.0
    assert [(p["ticker"], p["quantity"]) for p in body["portfolio"]["positions"]] == [("AAPL", 5.0)]
    assert count(settings, "trades") == 1
    assert count(settings, "portfolio_snapshots") == before + 1
    body = say(client, monkeypatch, reply_json(trades=[buy(quantity=2, side="sell")]))
    assert body["actions"][0]["quantity"] == 2.0 and body["actions"][0]["ok"] is True
    assert body["portfolio"]["positions"][0]["quantity"] == 3.0


def test_execute_uppercases_tickers(client, monkeypatch):
    body = say(client, monkeypatch, reply_json(
        trades=[buy("aapl")], changes=[wl("pypl")]))
    assert body["actions"][0]["ticker"] == "AAPL"
    assert body["actions"][1]["ticker"] == "PYPL"


def test_execute_watchlist_add_and_remove(client, monkeypatch):
    body = say(client, monkeypatch, reply_json(changes=[wl("PYPL")]))
    assert body["actions"] == [{"type": "watchlist", "ticker": "PYPL", "action": "add",
                                "ok": True, "error": None}]
    assert "PYPL" in [w["ticker"] for w in body["watchlist"]]
    assert body["watchlist"] == client.get("/api/watchlist").json()["watchlist"]
    body = say(client, monkeypatch, reply_json(changes=[wl("NFLX", "remove")]))
    assert body["actions"][0]["ok"] is True
    assert "NFLX" not in [w["ticker"] for w in body["watchlist"]]


def test_failure_insufficient_cash_keeps_requested_quantity(client, settings, monkeypatch):
    body = say(client, monkeypatch, reply_json(trades=[buy(quantity=1000)]))
    assert body["actions"] == [{
        "type": "trade", "ticker": "AAPL", "side": "buy", "quantity": 1000.0,
        "price": None, "ok": False, "error": "Insufficient cash"}]
    assert body["portfolio"]["cash"] == 10000.0
    assert count(settings, "trades") == 0


@pytest.mark.parametrize("order, error", [
    (buy(side="sell"), "Insufficient shares: you hold 0 AAPL"),
    (buy("AAPL$"), "Invalid ticker: AAPL$"),
    (buy(quantity=0), "Quantity must be greater than 0"),
])
def test_failure_trade_rejections(client, monkeypatch, order, error):
    body = say(client, monkeypatch, reply_json(trades=[order]))
    assert body["actions"][0]["ok"] is False
    assert body["actions"][0]["error"] == error
    assert body["actions"][0]["price"] is None


def test_failure_watchlist_rejections(client, monkeypatch):
    body = say(client, monkeypatch, reply_json(changes=[wl("ZZZZ"), wl("PYPL", "remove")]))
    assert [(a["ok"], a["error"]) for a in body["actions"]] == [
        (False, "Unknown ticker"), (False, "Ticker not in watchlist")]
    assert body["actions"][0]["ticker"] == "ZZZZ"


def test_failure_does_not_block_the_next_action(client, monkeypatch):
    body = say(client, monkeypatch, reply_json(
        trades=[buy(quantity=1000), buy("MSFT")]))
    assert [a["ok"] for a in body["actions"]] == [False, True]
    assert [p["ticker"] for p in body["portfolio"]["positions"]] == ["MSFT"]


def test_tracking_unwatched_ticker_streams_but_is_not_watched(client, monkeypatch):
    body = say(client, monkeypatch, reply_json(trades=[buy("PYPL")]))
    assert body["actions"][0]["ok"] is True
    assert "PYPL" not in [w["ticker"] for w in body["watchlist"]]
    assert "PYPL" in client.app.state.source.tracked
    position = body["portfolio"]["positions"][0]
    assert (position["ticker"], position["current_price"]) == ("PYPL", 60.0)


def test_execute_ordering_trades_then_watchlist(client, monkeypatch):
    body = say(client, monkeypatch, reply_json(
        trades=[buy("MSFT"), buy("NVDA")], changes=[wl("PYPL"), wl("NFLX", "remove")]))
    assert [(a["type"], a["ticker"]) for a in body["actions"]] == [
        ("trade", "MSFT"), ("trade", "NVDA"), ("watchlist", "PYPL"), ("watchlist", "NFLX")]


def test_execute_adjacency_duplicates_are_independent(client, monkeypatch):
    body = say(client, monkeypatch, reply_json(trades=[buy(quantity=5), buy(quantity=5)]))
    assert [a["ok"] for a in body["actions"]] == [True, True]
    assert body["portfolio"]["cash"] == 9000.0
    body = say(client, monkeypatch, reply_json(changes=[wl("PYPL"), wl("PYPL")]))
    assert [a["ok"] for a in body["actions"]] == [True, True]
    assert [w["ticker"] for w in body["watchlist"]].count("PYPL") == 1
    body = say(client, monkeypatch, reply_json(changes=[wl("PYPL"), wl("PYPL", "remove")]))
    assert [a["ok"] for a in body["actions"]] == [True, True]
    assert "PYPL" not in [w["ticker"] for w in body["watchlist"]]


def test_cap_eleven_trades(client, monkeypatch):
    body = say(client, monkeypatch, reply_json(trades=[buy("MSFT")] * 11))
    assert [a["ok"] for a in body["actions"]] == [True] * 10 + [False]
    last = body["actions"][-1]
    assert (last["error"], last["quantity"], last["price"]) == (OVER_CAP, 1.0, None)
    assert body["portfolio"]["positions"][0]["quantity"] == 10.0
    assert body["portfolio"]["cash"] == 9000.0


def test_cap_eleven_watchlist_changes(client, monkeypatch):
    body = say(client, monkeypatch, reply_json(changes=[wl("PYPL")] * 11))
    assert [a["ok"] for a in body["actions"]] == [True] * 10 + [False]
    assert body["actions"][-1]["error"] == OVER_CAP


def test_cap_both_lists_over_cap_keep_order(client, monkeypatch):
    body = say(client, monkeypatch, reply_json(
        trades=[buy("MSFT")] * 11, changes=[wl("PYPL")] * 11))
    assert [(a["type"], a["ok"]) for a in body["actions"]] == (
        [("trade", True)] * 10 + [("trade", False)] + [("watchlist", True)] * 10 + [("watchlist", False)])


def test_cap_exactly_ten_trades_all_execute(client, monkeypatch):
    body = say(client, monkeypatch, reply_json(trades=[buy("MSFT")] * 10))
    assert [a["ok"] for a in body["actions"]] == [True] * 10


def test_empty_actions_change_nothing(client, settings, monkeypatch):
    trades, snaps = count(settings, "trades"), count(settings, "portfolio_snapshots")
    body = say(client, monkeypatch, reply_json("just talking"))
    assert body["actions"] == []
    assert body["message"] == "just talking"
    assert count(settings, "trades") == trades
    assert count(settings, "portfolio_snapshots") == snaps
    assert body["portfolio"]["cash"] == 10000.0 and len(body["watchlist"]) == 10


def test_parallel_turns_cannot_overspend(client, settings, monkeypatch):
    async def slow(_settings, _messages):
        await asyncio.sleep(0.2)
        return reply_json(trades=[buy(quantity=60)])

    monkeypatch.setattr("app.chat.complete", slow)
    with ThreadPoolExecutor(2) as pool:
        futures = [pool.submit(client.post, "/api/chat", json={"message": "go"}) for _ in range(2)]
        bodies = [f.result().json() for f in futures]
    results = sorted((b["actions"][0]["ok"], b["actions"][0]["error"]) for b in bodies)
    assert results == [(False, "Insufficient cash"), (True, None)]
    assert client.get("/api/portfolio").json()["cash"] == 4000.0
    assert count(settings, "chat_messages") == 4


# --- persistence and history ---

def test_persist_pair_shape(client, settings, monkeypatch):
    say(client, monkeypatch, reply_json("Buying now", trades=[buy()]), text="  buy it  ")
    user, assistant = chat_rows(settings)
    assert (user["role"], assistant["role"]) == ("user", "assistant")
    assert user["content"] == "buy it" and user["actions"] is None
    assert assistant["content"] == "Buying now"
    assert json.loads(assistant["actions"])[0]["ok"] is True
    for row in (user, assistant):
        assert re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", row["created_at"])
    ids = [r["id"] for r in query(client.app.state.settings, "SELECT id FROM chat_messages")]
    assert len(set(ids)) == 2


def test_persist_text_is_stored_verbatim(client, settings, monkeypatch):
    text = "caf\u00e9 \U0001F600 \u05e9\u05dc\u05d5\u05dd '; DROP TABLE trades; --"
    body = say(client, monkeypatch, reply_json("ok"), text=text)
    assert body["message"] == "ok"
    assert chat_rows(settings)[0]["content"] == text
    assert client.get("/api/chat/history").json()["messages"][0]["content"] == text
    assert count(settings, "trades") == 0


def test_persist_times_user_row_uses_time_before_the_model_call(client, settings, monkeypatch):
    monkeypatch.setattr("app.chat.now_iso", lambda: "2026-01-01T00:00:00Z")
    monkeypatch.setattr("app.chat_store.now_iso", lambda: "2026-01-01T00:00:05Z")
    say(client, monkeypatch, reply_json())
    user, assistant = chat_rows(settings)
    assert (user["created_at"], assistant["created_at"]) == (
        "2026-01-01T00:00:00Z", "2026-01-01T00:00:05Z")


def test_history_same_second_turns_keep_order(client, monkeypatch):
    monkeypatch.setattr("app.chat.now_iso", lambda: "2026-01-01T00:00:00Z")
    monkeypatch.setattr("app.chat_store.now_iso", lambda: "2026-01-01T00:00:00Z")
    for i in range(3):
        say(client, monkeypatch, reply_json(f"a{i}"), text=f"u{i}")
    messages = client.get("/api/chat/history").json()["messages"]
    assert [m["content"] for m in messages] == ["u0", "a0", "u1", "a1", "u2", "a2"]
    assert [m["actions"] for m in messages[:2]] == [None, []]


def test_history_caps_at_100_newest_oldest_first(client, settings):
    insert_rows(settings, [
        ("user" if i % 2 else "assistant", f"m{i}", f"2026-01-01T00:{i // 60:02d}:{i % 60:02d}Z")
        for i in range(1, 106)])
    messages = client.get("/api/chat/history").json()["messages"]
    assert len(messages) == 100
    assert messages[0]["content"] == "m6" and messages[-1]["content"] == "m105"


def test_history_empty(client):
    assert client.get("/api/chat/history").json() == {"messages": []}


def test_prompt_window_system_20_history_then_user(client, settings, monkeypatch):
    insert_rows(settings, [
        ("user" if i % 2 else "assistant", f"m{i}", f"2026-01-01T00:{i // 60:02d}:{i % 60:02d}Z")
        for i in range(1, 26)])
    seen = []
    monkeypatch.setattr("app.chat.complete", recording(reply_json(), seen))
    client.post("/api/chat", json={"message": "the new one"})
    messages = seen[0]
    assert len(messages) == 22
    assert messages[0]["role"] == "system"
    assert "10000.0" in messages[0]["content"] and "weight_percent" in messages[0]["content"]
    assert [m["content"] for m in messages[1:-1]] == [f"m{i}" for i in range(6, 26)]
    assert messages[-1] == {"role": "user", "content": "the new one"}


def test_prompt_outcome_lines_are_added_to_history_not_storage(client, settings, monkeypatch):
    say(client, monkeypatch, reply_json("Buying 5", trades=[buy(quantity=5)]))
    say(client, monkeypatch, reply_json("Selling 20", trades=[buy(quantity=20, side="sell")]))
    seen = []
    monkeypatch.setattr("app.chat.complete", recording(reply_json(), seen))
    client.post("/api/chat", json={"message": "recap"})
    assistants = [m["content"] for m in seen[0] if m["role"] == "assistant"]
    assert assistants[0].endswith("[Executed: bought 5 AAPL at $100.00]")
    assert assistants[1].endswith("[Failed: sell 20 AAPL - Insufficient shares: you hold 5 AAPL]")
    assert all("[" not in r["content"] for r in chat_rows(settings))


def test_fresh_state_matches_the_get_endpoints(client, monkeypatch):
    body = say(client, monkeypatch, reply_json(trades=[buy(quantity=3)], changes=[wl("PYPL")]))
    assert body["portfolio"] == client.get("/api/portfolio").json()
    assert body["watchlist"] == client.get("/api/watchlist").json()["watchlist"]


# --- LLM failures ---

FAILURES = {
    "timeout": raising(TimeoutError()),
    "provider_error": raising(RuntimeError("provider said no")),
    "not_json": scripted("not json"),
    "fenced": scripted('```json\n{"message": "hi"}\n```'),
    "none": scripted(None),
    "empty_string": scripted(""),
    "empty_object": scripted("{}"),
    "nan_quantity": scripted(
        '{"message": "x", "trades": [{"ticker": "AAPL", "side": "buy", "quantity": NaN}]}'),
    "wrong_enum": scripted(reply_json(trades=[buy(side="hold")])),
    "extra_key": scripted('{"message": "x", "extra": 1}'),
    "lone_surrogate": scripted('{"message": "bad \\ud800 text"}'),
}


@pytest.mark.parametrize("name", FAILURES)
def test_llm_failure_is_a_graceful_reply(client, settings, monkeypatch, name):
    monkeypatch.setattr("app.chat.complete", FAILURES[name])
    response = client.post("/api/chat", json={"message": "buy lots"})
    body = response.json()
    assert response.status_code == 200
    assert body["message"] == GENERIC
    assert body["actions"] == []
    assert body["portfolio"]["cash"] == 10000.0 and body["portfolio"]["positions"] == []
    assert len(body["watchlist"]) == 10
    rows = chat_rows(settings)
    assert [r["role"] for r in rows] == ["user", "assistant"]
    assert rows[1]["actions"] == "[]"
    assert count(settings, "trades") == 0


def test_llm_failure_not_configured(client, settings):
    body = client.post("/api/chat", json={"message": "hello"}).json()
    assert body["message"] == NOT_CONFIGURED
    assert body["actions"] == []
    assert count(settings, "chat_messages") == 2


def test_llm_failure_no_leak_in_body_or_log(settings, monkeypatch, caplog):
    key = "sk-or-v1-secret-key"
    monkeypatch.setattr(
        "app.main.create_market_data_source",
        lambda cache, _settings: FixedPriceSource(cache, dict(FIXED_PRICES)))
    monkeypatch.setattr("app.chat.complete", raising(RuntimeError(f"401 for key {key}")))
    with TestClient(create_app(replace(settings, openrouter_api_key=key))) as keyed:
        with caplog.at_level(logging.WARNING, logger="app.chat"):
            response = keyed.post("/api/chat", json={"message": "hi"})
    assert key not in response.text and "401" not in response.text
    assert response.json()["message"] == GENERIC
    assert "RuntimeError" in caplog.text and "[redacted]" in caplog.text
    assert key not in caplog.text


# --- mock mode ---

def test_mock_buy_twice_buys_twice_with_identical_messages(mock_client):
    first = mock_client.post("/api/chat", json={"message": "buy"}).json()
    second = mock_client.post("/api/chat", json={"message": "buy"}).json()
    assert first["message"] == second["message"]
    assert second["portfolio"]["cash"] == 9800.0


def test_mock_broke_fails_with_insufficient_cash(mock_client):
    action = mock_client.post("/api/chat", json={"message": "broke"}).json()["actions"][0]
    assert (action["ok"], action["error"], action["quantity"]) == (False, "Insufficient cash", 1000000.0)


def test_mock_malformed_is_the_graceful_failure(mock_client, settings):
    import app.chat
    import app.llm.client
    body = mock_client.post("/api/chat", json={"message": "malformed"}).json()
    assert body["message"] == GENERIC and body["actions"] == []
    assert count(settings, "chat_messages") == 2
    assert app.chat.complete is app.llm.client.complete


def test_mock_watchlist_add_and_remove(mock_client):
    added = mock_client.post("/api/chat", json={"message": "add pypl"}).json()
    assert "PYPL" in [w["ticker"] for w in added["watchlist"]]
    removed = mock_client.post("/api/chat", json={"message": "remove pypl"}).json()
    assert "PYPL" not in [w["ticker"] for w in removed["watchlist"]]


def test_mock_mode_never_imports_litellm(mock_client, monkeypatch):
    monkeypatch.setitem(sys.modules, "litellm", None)
    response = mock_client.post("/api/chat", json={"message": "buy"})
    assert response.status_code == 200 and response.json()["actions"][0]["ok"] is True
