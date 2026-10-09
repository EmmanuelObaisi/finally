"""TEST-02: trade execution, P&L, rejections, atomicity and the trade route."""
import threading

import pytest

from app import trading
from app.db import connect, init_db
from app.errors import DomainError
from app.market.cache import PriceCache
from app.portfolio import build_portfolio
from app.trading import execute_trade, qty_text

JSON = {"content-type": "application/json"}


@pytest.fixture
def db(tmp_path):
    path = tmp_path / "trade.db"
    init_db(path)
    return path


@pytest.fixture
def cache():
    prices = PriceCache()
    prices.update("AAPL", 100.0)
    return prices


def trade(db, cache, side, ticker="AAPL", quantity=1.0):
    with connect(db) as conn:
        return execute_trade(conn, cache, ticker, side, quantity)


def state(db):
    """(cash, positions, trades count, snapshots count) straight from the database."""
    with connect(db) as conn:
        cash = conn.execute("SELECT cash_balance FROM users_profile").fetchone()[0]
        positions = [tuple(r) for r in conn.execute(
            "SELECT ticker, quantity, avg_cost FROM positions ORDER BY ticker")]
        trades = conn.execute("SELECT COUNT(*) FROM trades").fetchone()[0]
        snapshots = conn.execute("SELECT COUNT(*) FROM portfolio_snapshots").fetchone()[0]
    return cash, positions, trades, snapshots


def test_buy_fills_at_cached_price(db, cache):
    result = trade(db, cache, "buy", quantity=2)
    cash, positions, trades, snapshots = state(db)
    assert (cash, positions, trades, snapshots) == (9800.0, [("AAPL", 2.0, 100.0)], 1, 2)
    with connect(db) as conn:
        row = conn.execute("SELECT side, quantity, price FROM trades").fetchone()
        latest = conn.execute(
            "SELECT total_value FROM portfolio_snapshots ORDER BY rowid DESC").fetchone()[0]
    assert tuple(row) == ("buy", 2.0, 100.0)
    assert latest == result["portfolio"]["total_value"] == 10000.0


def test_buys_merge_into_weighted_average(db, cache):
    trade(db, cache, "buy", quantity=1)
    cache.update("AAPL", 200.0)
    trade(db, cache, "buy", quantity=3)
    assert state(db) == (9300.0, [("AAPL", 4.0, 175.0)], 2, 3)


def test_fractional_quantities_fill(db, cache):
    cache.update("AAPL", 190.12)
    trade(db, cache, "buy", quantity=1.5)
    assert state(db)[0] == round(10000.0 - 285.18, 2)
    cache.update("AAPL", 10000.0)
    trade(db, cache, "buy", quantity=0.000001)
    expected_avg = (1.5 * 190.12 + 0.000001 * 10000.0) / 1.500001
    assert state(db)[1] == [("AAPL", 1.500001, pytest.approx(expected_avg, abs=1e-6))]


def test_buy_exactly_all_cash_leaves_zero(db, cache):
    trade(db, cache, "buy", quantity=100)
    assert state(db)[0] == 0.0


def test_buy_over_cash_by_a_cent_is_rejected(db, cache):
    before = state(db)
    with pytest.raises(DomainError, match="^Insufficient cash$"):
        trade(db, cache, "buy", quantity=100.0001)
    assert state(db) == before


def test_partial_sell_keeps_avg_cost_and_full_sell_deletes_row(db, cache):
    trade(db, cache, "buy", quantity=4)
    cache.update("AAPL", 250.0)
    trade(db, cache, "sell", quantity=1)
    assert state(db)[:2] == (9600.0 + 250.0, [("AAPL", 3.0, 100.0)])
    trade(db, cache, "sell", quantity=3)
    assert state(db)[1] == []


def test_float_residue_leaves_no_position(db, cache):
    trade(db, cache, "buy", quantity=0.1)
    trade(db, cache, "buy", quantity=0.2)
    trade(db, cache, "sell", quantity=0.3)
    assert state(db)[1] == []


def test_selling_at_a_loss_credits_the_lower_price(db, cache):
    trade(db, cache, "buy", quantity=10)
    cache.update("AAPL", 80.0)
    result = trade(db, cache, "sell", quantity=10)
    assert state(db)[0] == 9800.0
    assert result["portfolio"]["positions"] == []
    assert result["portfolio"]["total_value"] == 9800.0


def test_unrealized_pnl_after_a_price_move(db, cache):
    trade(db, cache, "buy", quantity=10)
    cache.update("AAPL", 110.0)
    with connect(db) as conn:
        portfolio = build_portfolio(conn, cache)
    position = portfolio["positions"][0]
    assert (position["unrealized_pnl"], position["pnl_percent"]) == (100.0, 10.0)
    assert portfolio["unrealized_pnl"] == 100.0


@pytest.mark.parametrize("quantity", [0, -1, float("nan"), 1e-9])
def test_non_positive_quantity_is_rejected(db, cache, quantity):
    before = state(db)
    with pytest.raises(DomainError, match="^Quantity must be greater than 0$"):
        trade(db, cache, "buy", quantity=quantity)
    assert state(db) == before


def test_micro_quantity_boundaries(db, cache):
    cache.update("AAPL", 10000.0)
    trade(db, cache, "buy", quantity=0.000001)
    with pytest.raises(DomainError, match="Quantity must be greater than 0"):
        trade(db, cache, "buy", quantity=0.0000004)


@pytest.mark.parametrize("side,ticker,quantity,message", [
    ("buy", "ZZZZ", 1, "No price available for ZZZZ"),
    ("buy", "AAPL", 1000, "Insufficient cash"),
    ("buy", "AAPL", 0.00004, "Order value is too small"),
    ("sell", "AAPL", 1, "Insufficient shares: you hold 0 AAPL"),
    ("sell", "PYPL", 1, "Insufficient shares: you hold 0 PYPL"),
])
def test_rejections_change_nothing(db, cache, side, ticker, quantity, message):
    before = state(db)
    with pytest.raises(DomainError, match=f"^{message}$"):
        trade(db, cache, side, ticker, quantity)
    assert state(db) == before


def test_sub_cent_sell_is_rejected(db, cache):
    trade(db, cache, "buy", quantity=1)
    before = state(db)
    with pytest.raises(DomainError, match="^Order value is too small$"):
        trade(db, cache, "sell", quantity=0.00004)
    assert state(db) == before


def test_selling_one_micro_share_too_many(db, cache):
    trade(db, cache, "buy", quantity=4)
    before = state(db)
    with pytest.raises(DomainError, match="^Insufficient shares: you hold 4 AAPL$"):
        trade(db, cache, "sell", quantity=4.000001)
    assert state(db) == before


def test_same_buy_twice_is_two_orders(db, cache):
    trade(db, cache, "buy", quantity=2)
    trade(db, cache, "buy", quantity=2)
    assert state(db) == (9600.0, [("AAPL", 4.0, 100.0)], 2, 3)


def test_failure_inside_the_fill_rolls_everything_back(db, cache, monkeypatch):
    before = state(db)

    def boom(*_):
        raise RuntimeError("boom")

    monkeypatch.setattr(trading, "build_portfolio", boom)
    with pytest.raises(RuntimeError):
        trade(db, cache, "buy", quantity=2)
    assert state(db) == before


def test_concurrent_buys_only_one_can_afford(db, cache):
    barrier = threading.Barrier(2)
    outcomes = []

    def buy():
        with connect(db) as conn:
            barrier.wait()
            try:
                execute_trade(conn, cache, "AAPL", "buy", 60)
                outcomes.append("filled")
            except DomainError as exc:
                outcomes.append(str(exc))

    threads = [threading.Thread(target=buy) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert sorted(outcomes) == ["Insufficient cash", "filled"]
    assert state(db)[0] == 4000.0


def test_qty_text():
    assert (qty_text(1.5), qty_text(0.0), qty_text(10.0), qty_text(0.000001)) == (
        "1.5", "0", "10", "0.000001")


def test_route_buy_returns_trade_and_portfolio(client):
    r = client.post("/api/portfolio/trade", json={"ticker": "aapl", "quantity": 2, "side": "buy"})
    body = r.json()
    assert r.status_code == 200 and list(body) == ["trade", "portfolio"]
    assert list(body["trade"]) == ["id", "ticker", "side", "quantity", "price", "executed_at"]
    assert body["portfolio"]["cash"] == 9800.0
    assert client.get("/api/portfolio").json() == body["portfolio"]


@pytest.mark.parametrize("content,message", [
    ('{"ticker": "AAPL", "quantity": NaN, "side": "buy"}', "quantity: Input should be a finite number"),
    ('{"ticker": "AAPL", "quantity": 1e999, "side": "buy"}', "quantity: Input should be a finite number"),
    ('{"ticker": "AAPL", "quantity": "1e3", "side": "buy"}', "quantity: Input should be a valid number"),
    ('{"ticker": "AAPL", "quantity": true, "side": "buy"}', "quantity: Input should be a valid number"),
    ('{"ticker": "AAPL", "side": "buy"}', "quantity: Field required"),
    ('{"ticker": "AAPL", "quantity": 1, "side": "hold"}', "side: Input should be 'buy' or 'sell'"),
    ('{"ticker": "AAPL$", "quantity": 1, "side": "buy"}', "Invalid ticker: AAPL$"),
    ('{"ticker": "AAPL", "quantity": 1, "side": "sell"}', "Insufficient shares: you hold 0 AAPL"),
])
def test_route_rejections_are_400_envelopes(client, content, message):
    r = client.post("/api/portfolio/trade", content=content, headers=JSON)
    assert (r.status_code, r.json()) == (400, {"error": message})
    assert client.get("/api/portfolio").json()["cash"] == 10000.0


def test_get_on_the_trade_path_is_not_found(client):
    r = client.get("/api/portfolio/trade")
    assert (r.status_code, r.json()) == (404, {"error": "Not found"})
