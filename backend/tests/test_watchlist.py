import asyncio

import httpx
import pytest
from fastapi.testclient import TestClient

from app.db import DEFAULT_TICKERS, connect, init_db
from app.main import create_app
from app.market.cache import PriceCache
from app.watchlist import PRICE_FIELDS, build_watchlist

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


def test_unpriced_ticker_has_null_price_fields(settings):
    cache = PriceCache()
    for ticker in DEFAULT_TICKERS[:9]:
        cache.update(ticker, 100.0)
    init_db(settings.db_path)
    with connect(settings.db_path) as conn:
        items = build_watchlist(conn, cache)
    assert len(items) == 10
    assert items[9] == {"ticker": "NFLX", **dict.fromkeys(PRICE_FIELDS)}
    assert all(item["price"] == 100.0 for item in items[:9])


def test_wrong_method_on_known_path_is_404(settings):
    """PUT /api/watchlist and POST /api/portfolio hit the catch-all, never a 405."""
    with TestClient(create_app(settings)) as client:
        put = client.put("/api/watchlist")
        post = client.post("/api/portfolio")
    assert (put.status_code, put.json()) == (404, {"error": "Not found"})
    assert (post.status_code, post.json()) == (404, {"error": "Not found"})


async def test_concurrent_watchlist_reads_all_succeed_in_order(live_server):
    async with httpx.AsyncClient(base_url=live_server.url) as client:
        responses = await asyncio.gather(*[client.get("/api/watchlist") for _ in range(20)])
    for r in responses:
        assert r.status_code == 200
        assert [i["ticker"] for i in r.json()["watchlist"]] == list(DEFAULT_TICKERS)


def add(client, ticker):
    return client.post("/api/watchlist", json={"ticker": ticker})


def tickers(client):
    return [i["ticker"] for i in client.get("/api/watchlist").json()["watchlist"]]


def test_add_upper_cases_prices_and_appends_last(client):
    r = add(client, "pypl")
    items = r.json()["watchlist"]
    assert r.status_code == 200
    assert [i["ticker"] for i in items] == [*DEFAULT_TICKERS, "PYPL"]
    assert items[-1]["price"] == 60.0
    assert "PYPL" in client.app.state.source.get_tickers()


def test_re_adding_a_watched_ticker_is_idempotent(client):
    r = add(client, "AAPL")
    assert r.status_code == 200
    assert [i["ticker"] for i in r.json()["watchlist"]] == list(DEFAULT_TICKERS)


@pytest.mark.parametrize("raw", ["PYPL$", "", "ABCDEFGHIJK", ".A", "ß", "ı", "AAPL\n", " AAPL"])
def test_malformed_ticker_is_rejected_and_changes_nothing(client, raw):
    r = add(client, raw)
    assert (r.status_code, r.json()) == (400, {"error": "Invalid ticker: " + raw})
    assert tickers(client) == list(DEFAULT_TICKERS)


@pytest.mark.parametrize("ticker", ["A", "ABCDEFGHIJ", "BRK.B"])
def test_boundary_tickers_are_accepted_when_priced(client, ticker):
    client.app.state.source.prices[ticker] = 10.0
    r = add(client, ticker)
    assert r.status_code == 200
    assert r.json()["watchlist"][-1]["ticker"] == ticker


def test_unpriced_ticker_is_rejected_and_not_left_tracked(client):
    r = add(client, "ZZZZ")
    assert (r.status_code, r.json()) == (400, {"error": "Unknown ticker"})
    assert "ZZZZ" not in tickers(client)
    assert "ZZZZ" not in client.app.state.source.get_tickers()
    assert client.app.state.cache.get_price("ZZZZ") is None


async def test_concurrent_adds_leave_one_row(live_server):
    async with httpx.AsyncClient(base_url=live_server.url) as client:
        body = {"ticker": "PYPL"}
        responses = await asyncio.gather(*[client.post("/api/watchlist", json=body) for _ in range(5)])
        final = (await client.get("/api/watchlist")).json()["watchlist"]
    assert [r.status_code for r in responses] == [200] * 5
    assert [i["ticker"] for i in final].count("PYPL") == 1
