"""Tests for the REST endpoints in CONTRACT.md section 6."""

PORTFOLIO_KEYS = {"cash_balance", "total_value", "positions_value", "unrealized_pnl", "positions"}
WATCH_KEYS = {"ticker", "price", "previous_price", "change", "direction", "day_change_percent"}


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_fresh_portfolio(client):
    body = client.get("/api/portfolio").json()
    assert set(body) == PORTFOLIO_KEYS
    assert body["cash_balance"] == 10000.0
    assert body["positions"] == []


def test_trade_returns_trade_and_portfolio(client):
    response = client.post("/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 2, "side": "buy"})
    assert response.status_code == 200
    body = response.json()
    assert {"ticker", "side", "quantity", "price", "executed_at"} <= set(body["trade"])
    assert body["portfolio"]["cash_balance"] == 9800.0
    assert body["portfolio"]["positions"][0]["ticker"] == "AAPL"


def test_trade_validation_is_400(client):
    response = client.post("/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 1000, "side": "buy"})
    assert response.status_code == 400
    assert "Insufficient cash" in response.json()["detail"]
    response = client.post("/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 1, "side": "short"})
    assert response.status_code == 400


def test_history_has_startup_and_trade_snapshots(client):
    client.post("/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 1, "side": "buy"})
    history = client.get("/api/portfolio/history").json()
    assert len(history) == 2
    assert set(history[0]) == {"total_value", "recorded_at"}


def test_watchlist_get(client):
    items = client.get("/api/watchlist").json()
    assert len(items) == 10
    assert set(items[0]) == WATCH_KEYS
    assert items[0]["ticker"] == "AAPL"
    assert items[0]["price"] == 100.0


def test_watchlist_add_and_remove(client):
    items = client.post("/api/watchlist", json={"ticker": "pypl"}).json()
    assert items[-1]["ticker"] == "PYPL"
    assert len(client.post("/api/watchlist", json={"ticker": "PYPL"}).json()) == 11
    items = client.delete("/api/watchlist/PYPL").json()
    assert "PYPL" not in [i["ticker"] for i in items]


def test_watchlist_errors(client):
    assert client.post("/api/watchlist", json={"ticker": "NOPE"}).status_code == 400
    assert client.post("/api/watchlist", json={"ticker": "1bad"}).status_code == 400
    response = client.delete("/api/watchlist/PYPL")
    assert response.status_code == 404
    assert "detail" in response.json()


def test_unknown_api_path_is_json_404(client):
    response = client.get("/api/nope")
    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}
