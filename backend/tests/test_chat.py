"""Chat flow: POST /api/chat and GET /api/chat/history through the real services."""
import sqlite3
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import FIXED_PRICES, FixedPriceSource


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


def chat_rows(settings) -> list[sqlite3.Row]:
    """All stored chat rows in insertion order."""
    conn = sqlite3.connect(settings.db_path)
    conn.row_factory = sqlite3.Row
    try:
        return conn.execute(
            "SELECT role, content, actions, created_at FROM chat_messages ORDER BY rowid"
        ).fetchall()
    finally:
        conn.close()


def test_response_shape_in_mock_mode(mock_client):
    response = mock_client.post("/api/chat", json={"message": "hello"})
    body = response.json()
    assert response.status_code == 200
    assert set(body) == {"message", "actions", "portfolio", "watchlist"}
    assert body["actions"] == []
    assert len(body["watchlist"]) == 10


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
