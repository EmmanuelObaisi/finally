"""Tests for trade execution, valuation and watchlist rules."""

import pytest

from app import db, deps
from app.portfolio import service
from app.portfolio.service import TradeError, WatchlistError


async def test_buy_debits_cash_creates_position_and_snapshot(market):
    trade = await service.execute_trade("aapl", "buy", 10)
    assert trade["ticker"] == "AAPL"
    assert trade["price"] == 100.0
    assert db.get_cash() == 9000.0
    assert db.get_position("AAPL")["quantity"] == 10
    assert len(db.get_snapshots()) == 1
    assert "AAPL" in market.tickers


async def test_buy_blends_average_cost(market):
    await service.execute_trade("AAPL", "buy", 10)
    deps.price_cache.update("AAPL", 200.0)
    await service.execute_trade("AAPL", "buy", 10)
    position = db.get_position("AAPL")
    assert position["quantity"] == 20
    assert position["avg_cost"] == 150.0


async def test_fractional_buy(market):
    await service.execute_trade("AAPL", "buy", 0.5)
    assert db.get_position("AAPL")["quantity"] == 0.5
    assert db.get_cash() == 9950.0


async def test_buy_with_insufficient_cash_rolls_back(market):
    with pytest.raises(TradeError, match="Insufficient cash"):
        await service.execute_trade("AAPL", "buy", 101)
    assert db.get_cash() == 10000.0
    assert db.get_position("AAPL") is None
    assert db.get_snapshots() == []


async def test_sell_at_a_loss_and_close_position(market):
    await service.execute_trade("AAPL", "buy", 10)
    deps.price_cache.update("AAPL", 90.0)
    await service.execute_trade("AAPL", "sell", 4)
    assert db.get_position("AAPL")["quantity"] == 6
    assert db.get_cash() == 9000.0 + 360.0
    await service.execute_trade("AAPL", "sell", 6)
    assert db.get_position("AAPL") is None
    assert db.get_cash() == 9900.0


async def test_sell_more_than_owned(market):
    await service.execute_trade("AAPL", "buy", 1)
    with pytest.raises(TradeError, match="Insufficient shares"):
        await service.execute_trade("AAPL", "sell", 2)
    assert db.get_position("AAPL")["quantity"] == 1


@pytest.mark.parametrize(
    ("ticker", "side", "quantity", "message"),
    [
        ("AAPL", "hold", 1, "Side"),
        ("AAPL", "buy", 0, "Quantity"),
        ("AAPL", "buy", -1, "Quantity"),
        ("A1!", "buy", 1, "Invalid ticker"),
        ("NOPE", "buy", 1, "Unknown ticker"),
    ],
)
async def test_trade_validation(market, ticker, side, quantity, message):
    with pytest.raises(TradeError, match=message):
        await service.execute_trade(ticker, side, quantity)


async def test_unknown_ticker_buy_is_not_left_tracked(market):
    with pytest.raises(TradeError):
        await service.execute_trade("NOPE", "buy", 1)
    assert "NOPE" not in market.tickers


async def test_buy_unwatched_ticker_tracks_it_without_watching(market):
    await service.execute_trade("PYPL", "buy", 1)
    assert "PYPL" in market.tickers
    assert "PYPL" not in db.get_watchlist()
    assert service.tracked_tickers()[-1] == "PYPL"
    await service.execute_trade("PYPL", "sell", 1)
    assert "PYPL" not in market.tickers


async def test_get_portfolio_values_positions(market):
    await service.execute_trade("AAPL", "buy", 10)
    deps.price_cache.update("AAPL", 110.0)
    portfolio = service.get_portfolio()
    assert portfolio["cash_balance"] == 9000.0
    assert portfolio["positions_value"] == 1100.0
    assert portfolio["total_value"] == 10100.0
    assert portfolio["unrealized_pnl"] == 100.0
    assert portfolio["positions"] == [{
        "ticker": "AAPL", "quantity": 10, "avg_cost": 100.0, "current_price": 110.0,
        "market_value": 1100.0, "unrealized_pnl": 100.0, "pnl_percent": 10.0,
    }]


async def test_watchlist_with_prices(market):
    await market.start(db.get_watchlist())
    items = service.get_watchlist_with_prices()
    assert [i["ticker"] for i in items][:3] == ["AAPL", "GOOGL", "MSFT"]
    assert items[0] == {"ticker": "AAPL", "price": 100.0, "previous_price": 100.0, "change": 0,
                        "direction": "flat", "day_change_percent": 0}
    assert items[3]["price"] is None


async def test_add_to_watchlist(market):
    await service.add_to_watchlist(" pypl ")
    assert db.get_watchlist()[-1] == "PYPL"
    await service.add_to_watchlist("PYPL")
    assert db.get_watchlist().count("PYPL") == 1


@pytest.mark.parametrize(("ticker", "message"), [("bad ticker", "Invalid"), ("NOPE", "Unknown")])
async def test_add_to_watchlist_rejects(market, ticker, message):
    with pytest.raises(WatchlistError, match=message):
        await service.add_to_watchlist(ticker)
    assert "NOPE" not in market.tickers


async def test_remove_from_watchlist_keeps_held_ticker_tracked(market):
    await service.execute_trade("AAPL", "buy", 1)
    await service.remove_from_watchlist("aapl")
    assert "AAPL" not in db.get_watchlist()
    assert deps.price_cache.get_price("AAPL") == 100.0
    await service.remove_from_watchlist("MSFT")
    assert "MSFT" not in market.tickers


async def test_remove_absent_ticker(market):
    with pytest.raises(WatchlistError, match="not on the watchlist"):
        await service.remove_from_watchlist("PYPL")
