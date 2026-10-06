"""Fixtures that stub the portfolio service and database for LLM tests."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import db
from app.llm import create_chat_router
from app.portfolio import service

PORTFOLIO = {"cash_balance": 10000.0, "total_value": 10000.0, "positions_value": 0.0,
             "unrealized_pnl": 0.0, "positions": []}
WATCHLIST = [{"ticker": "AAPL", "price": 190.0, "previous_price": 189.5, "change": 0.5,
              "direction": "up", "day_change_percent": 0.1}]


class FakeBackend:
    """Records service and db calls; set trade_error / watchlist_error to make actions fail."""

    def __init__(self):
        self.chat_rows: list[dict] = []
        self.trades: list[tuple] = []
        self.watchlist_calls: list[tuple] = []
        self.trade_error: str | None = None
        self.watchlist_error: str | None = None

    async def execute_trade(self, ticker, side, quantity):
        if self.trade_error:
            raise service.TradeError(self.trade_error)
        self.trades.append((ticker, side, quantity))
        return {"ticker": ticker.upper(), "side": side, "quantity": quantity, "price": 190.0,
                "executed_at": "2026-10-06T00:00:00+00:00"}

    async def add_to_watchlist(self, ticker):
        if self.watchlist_error:
            raise service.WatchlistError(self.watchlist_error)
        self.watchlist_calls.append(("add", ticker))

    async def remove_from_watchlist(self, ticker):
        if self.watchlist_error:
            raise service.WatchlistError(self.watchlist_error)
        self.watchlist_calls.append(("remove", ticker))

    def insert_chat_message(self, role, content, actions=None, user_id="default"):
        self.chat_rows.append({"role": role, "content": content, "actions": actions, "created_at": ""})

    def get_chat_messages(self, limit=20, user_id="default"):
        return self.chat_rows[-limit:]


@pytest.fixture
def backend(monkeypatch):
    """Patch service and db functions with an in-memory FakeBackend."""
    fake = FakeBackend()
    monkeypatch.setattr(service, "execute_trade", fake.execute_trade)
    monkeypatch.setattr(service, "add_to_watchlist", fake.add_to_watchlist)
    monkeypatch.setattr(service, "remove_from_watchlist", fake.remove_from_watchlist)
    monkeypatch.setattr(service, "get_portfolio", lambda: PORTFOLIO)
    monkeypatch.setattr(service, "get_watchlist_with_prices", lambda: WATCHLIST)
    monkeypatch.setattr(db, "insert_chat_message", fake.insert_chat_message)
    monkeypatch.setattr(db, "get_chat_messages", fake.get_chat_messages)
    return fake


@pytest.fixture
def client(backend):
    """TestClient for an app containing only the chat router."""
    app = FastAPI()
    app.include_router(create_chat_router())
    return TestClient(app)
