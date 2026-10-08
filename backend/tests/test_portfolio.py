import logging

from fastapi.testclient import TestClient

from app.db import connect, init_db, now_iso
from app.main import create_app
from app.market.cache import PriceCache
from app.portfolio import build_portfolio


def make_db(tmp_path, positions=()):
    path = tmp_path / "p.db"
    init_db(path)
    with connect(path) as conn:
        for ticker, quantity, avg_cost in positions:
            conn.execute(
                "INSERT INTO positions (user_id, ticker, quantity, avg_cost, updated_at) "
                "VALUES ('default', ?, ?, ?, ?)",
                (ticker, quantity, avg_cost, now_iso()),
            )
    return path


def portfolio(path, cache):
    with connect(path) as conn:
        return build_portfolio(conn, cache)


def test_fresh_portfolio_is_cash_only(settings):
    with TestClient(create_app(settings)) as client:
        r = client.get("/api/portfolio")
    assert r.status_code == 200
    assert r.json() == {"cash": 10000.0, "total_value": 10000.0, "unrealized_pnl": 0.0, "positions": []}


def test_position_valued_at_cached_price(tmp_path):
    cache = PriceCache()
    cache.update("AAPL", 190.0)
    result = portfolio(make_db(tmp_path, [("AAPL", 1.5, 180.0)]), cache)
    assert result["positions"] == [{
        "ticker": "AAPL", "quantity": 1.5, "avg_cost": 180.0, "current_price": 190.0,
        "market_value": 285.0, "unrealized_pnl": 15.0, "pnl_percent": 5.5556,
    }]
    assert result["total_value"] == 10285.0 and result["unrealized_pnl"] == 15.0


def test_unpriced_position_valued_at_avg_cost_and_logged(tmp_path, caplog):
    with caplog.at_level(logging.ERROR):
        result = portfolio(make_db(tmp_path, [("AAPL", 1.5, 180.0)]), PriceCache())
    position = result["positions"][0]
    assert (position["current_price"], position["market_value"]) == (180.0, 270.0)
    assert (position["unrealized_pnl"], position["pnl_percent"]) == (0.0, 0.0)
    assert any(r.levelno == logging.ERROR and "AAPL" in r.getMessage() for r in caplog.records)


def test_price_equal_to_avg_cost_has_zero_pnl(tmp_path):
    cache = PriceCache()
    cache.update("AAPL", 180.0)
    position = portfolio(make_db(tmp_path, [("AAPL", 2.0, 180.0)]), cache)["positions"][0]
    assert (position["unrealized_pnl"], position["pnl_percent"]) == (0.0, 0.0)


def test_values_are_rounded_and_total_is_cash_plus_market_values(tmp_path):
    cache = PriceCache()
    cache.update("AAPL", 190.0)
    cache.update("MSFT", 410.55)
    result = portfolio(make_db(tmp_path, [("AAPL", 0.1234567, 33.333333), ("MSFT", 3.0, 400.0)]), cache)
    aapl = result["positions"][0]
    assert aapl["quantity"] == 0.123457 and aapl["avg_cost"] == 33.33
    assert result["total_value"] == round(
        result["cash"] + sum(p["market_value"] for p in result["positions"]), 2)
