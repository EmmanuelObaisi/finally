"""MKT-08 trade path: a ticker streams exactly when it is watched or held."""
from app.db import USER_ID, connect, init_db, now_iso
from app.tracking import is_wanted


def buy(client, ticker, quantity=1):
    return client.post("/api/portfolio/trade", json={"ticker": ticker, "quantity": quantity, "side": "buy"})


def sell(client, ticker, quantity=1):
    return client.post("/api/portfolio/trade", json={"ticker": ticker, "quantity": quantity, "side": "sell"})


def test_buying_an_unwatched_ticker_streams_it_priced(client):
    r = buy(client, "PYPL")
    assert r.status_code == 200
    assert "PYPL" in client.app.state.source.get_tickers()
    assert client.app.state.cache.get_price("PYPL") == 60.0
    assert r.json()["portfolio"]["positions"][0]["current_price"] == 60.0


def test_selling_the_last_share_of_an_unwatched_ticker_stops_streaming(client):
    buy(client, "PYPL")
    r = sell(client, "PYPL")
    assert r.status_code == 200
    assert "PYPL" not in client.app.state.source.get_tickers()
    assert client.app.state.cache.get_price("PYPL") is None
    assert r.json()["portfolio"]["positions"] == []


def test_unaffordable_buy_of_an_unwatched_ticker_is_not_left_streaming(client):
    r = buy(client, "PYPL", 1000)
    assert (r.status_code, r.json()) == (400, {"error": "Insufficient cash"})
    assert "PYPL" not in client.app.state.source.get_tickers()
    assert client.app.state.cache.get_price("PYPL") is None


def test_buying_an_unpriceable_ticker_is_rejected_and_not_tracked(client):
    r = buy(client, "ZZZZ")
    assert (r.status_code, r.json()) == (400, {"error": "No price available for ZZZZ"})
    assert "ZZZZ" not in client.app.state.source.get_tickers()


def test_selling_a_never_held_ticker_never_starts_tracking_it(client):
    r = sell(client, "PYPL")
    assert (r.status_code, r.json()) == (400, {"error": "Insufficient shares: you hold 0 PYPL"})
    assert "PYPL" not in client.app.state.source.added


def test_watched_ticker_stays_tracked_after_partial_and_full_sells(client):
    source, cache = client.app.state.source, client.app.state.cache
    buy(client, "AAPL", 2)
    sell(client, "AAPL", 1)
    assert "AAPL" in source.get_tickers() and cache.get_price("AAPL") == 100.0
    sell(client, "AAPL", 1)
    assert "AAPL" in source.get_tickers() and cache.get_price("AAPL") == 100.0


def test_rejected_zero_quantity_buy_of_an_unwatched_ticker_is_not_tracked(client):
    r = buy(client, "PYPL", 0)
    assert r.status_code == 400
    assert "PYPL" not in client.app.state.source.get_tickers()


def test_is_wanted_covers_watchlist_and_positions(tmp_path):
    path = tmp_path / "w.db"
    init_db(path)
    assert is_wanted(path, "AAPL") is True
    assert is_wanted(path, "PYPL") is False
    with connect(path) as conn:
        conn.execute(
            "INSERT INTO positions (user_id, ticker, quantity, avg_cost, updated_at) "
            "VALUES (?, 'PYPL', 1, 60, ?)", (USER_ID, now_iso()))
    assert is_wanted(path, "PYPL") is True


def test_removing_a_held_ticker_keeps_it_streaming_and_priced(client, caplog):
    source, cache = client.app.state.source, client.app.state.cache
    buy(client, "AAPL", 2)
    r = client.delete("/api/watchlist/AAPL")
    assert r.status_code == 200
    assert "AAPL" not in [i["ticker"] for i in r.json()["watchlist"]]
    assert "AAPL" in source.get_tickers()
    cache.update("AAPL", 110.0)
    position = client.get("/api/portfolio").json()["positions"][0]
    assert (position["ticker"], position["quantity"], position["current_price"]) == ("AAPL", 2.0, 110.0)
    assert "No cached price" not in caplog.text


def test_selling_a_removed_held_ticker_stops_streaming_it(client):
    buy(client, "AAPL")
    client.delete("/api/watchlist/AAPL")
    sell(client, "AAPL")
    assert "AAPL" not in client.app.state.source.get_tickers()
    assert client.app.state.cache.get_price("AAPL") is None
