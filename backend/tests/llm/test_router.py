"""POST /api/chat route behaviour."""

from types import SimpleNamespace

import pytest

from app.llm import client as llm_client
from app.llm import router
from app.llm.schemas import LLMResponse


@pytest.fixture
def mock_mode(monkeypatch):
    monkeypatch.setenv("LLM_MOCK", "true")


@pytest.fixture
def live_mode(monkeypatch):
    monkeypatch.setenv("LLM_MOCK", "false")


def fake_completion(content: str):
    """Return a litellm.completion stand-in that yields the given content."""
    def completion(**kwargs):
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])
    return completion


def test_mock_buy(client, backend, mock_mode):
    response = client.post("/api/chat", json={"message": "buy please"})
    assert response.status_code == 200
    body = response.json()
    assert body["message"] == "Mock: buying 1 AAPL."
    assert body["actions"]["trades"] == [
        {"ticker": "AAPL", "side": "buy", "quantity": 1, "status": "ok", "price": 190.0}]
    assert body["actions"]["watchlist_changes"] == []
    assert body["portfolio"]["cash_balance"] == 10000.0


def test_messages_are_stored(client, backend, mock_mode):
    client.post("/api/chat", json={"message": "add pypl"})
    user, assistant = backend.chat_rows
    assert (user["role"], user["content"], user["actions"]) == ("user", "add pypl", None)
    assert assistant["role"] == "assistant"
    assert assistant["actions"]["watchlist_changes"][0]["status"] == "ok"


def test_history_is_sent_once(client, backend, mock_mode, monkeypatch):
    sent = []

    async def fake_llm(user_message, messages):
        sent.append(messages)
        return LLMResponse(message="reply")

    monkeypatch.setattr(router, "get_llm_response", fake_llm)
    client.post("/api/chat", json={"message": "first"})
    client.post("/api/chat", json={"message": "second"})
    contents = [m["content"] for m in sent[1][1:]]
    assert contents == ["first", "reply", "second"]


def test_live_call_parses_structured_output(client, backend, live_mode, monkeypatch):
    captured = {}

    def completion(**kwargs):
        captured.update(kwargs)
        return fake_completion('{"message": "Selling.", "trades": [{"ticker": "AAPL", "side": "sell", "quantity": 1}]}')()

    monkeypatch.setattr(llm_client, "completion", completion)
    body = client.post("/api/chat", json={"message": "dump apple"}).json()
    assert body["message"] == "Selling."
    assert body["actions"]["trades"][0]["status"] == "ok"
    assert captured["model"] == "openrouter/openai/gpt-oss-120b"
    assert captured["extra_body"] == {"provider": {"order": ["cerebras"]}}
    assert captured["messages"][-1] == {"role": "user", "content": "dump apple"}


def test_malformed_output_returns_502(client, backend, live_mode, monkeypatch):
    monkeypatch.setattr(llm_client, "completion", fake_completion("not json"))
    response = client.post("/api/chat", json={"message": "hi"})
    assert response.status_code == 502
    assert "LLM request failed" in response.json()["detail"]
    assert [r["role"] for r in backend.chat_rows] == ["user"]


def test_llm_exception_returns_502(client, backend, live_mode, monkeypatch):
    def boom(**kwargs):
        raise RuntimeError("timeout")

    monkeypatch.setattr(llm_client, "completion", boom)
    response = client.post("/api/chat", json={"message": "hi"})
    assert response.status_code == 502
    assert "timeout" in response.json()["detail"]
    assert backend.chat_rows[0]["content"] == "hi"


def test_failed_action_still_returns_200(client, backend, mock_mode):
    backend.trade_error = "Insufficient shares"
    body = client.post("/api/chat", json={"message": "sell"}).json()
    assert body["actions"]["trades"][0] == {
        "ticker": "AAPL", "side": "sell", "quantity": 1, "status": "error", "error": "Insufficient shares"}


def test_missing_message_is_422(client):
    assert client.post("/api/chat", json={}).status_code == 422
