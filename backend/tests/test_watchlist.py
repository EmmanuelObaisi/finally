from fastapi.testclient import TestClient

from app.db import DEFAULT_TICKERS
from app.main import create_app

ITEM_KEYS = {"ticker", "price", "previous_price", "timestamp", "change", "change_percent",
             "direction", "session_start_price"}


def test_get_watchlist_returns_seeded_tickers_in_order_with_prices(settings):
    with TestClient(create_app(settings)) as client:
        r = client.get("/api/watchlist")
    items = r.json()["watchlist"]
    assert r.status_code == 200
    assert [item["ticker"] for item in items] == list(DEFAULT_TICKERS)
    assert all(set(item) == ITEM_KEYS for item in items)
    assert all(isinstance(item["price"], float) and item["price"] > 0 for item in items)
