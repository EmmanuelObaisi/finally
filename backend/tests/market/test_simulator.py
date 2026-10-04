import asyncio

import numpy as np
import pytest

from app.market import seed_prices
from app.market.cache import PriceCache
from app.market.simulator import GBMSimulator, SimulatorDataSource, pair_correlation

DEFAULT = list(seed_prices.SEED_PRICES)


def log_returns(sim: GBMSimulator, steps: int) -> dict[str, np.ndarray]:
    """Run the simulator and return per-ticker log returns."""
    paths = {t: [sim.prices[t]] for t in sim.tickers}
    for _ in range(steps):
        for t, p in sim.step().items():
            paths[t].append(p)
    return {t: np.diff(np.log(p)) for t, p in paths.items()}


def test_prices_stay_positive():
    sim = GBMSimulator(DEFAULT, seed=1)
    for _ in range(10_000):
        assert all(p > 0 for p in sim.step().values())


def test_volatility_matches_sigma():
    sim = GBMSimulator(["AAPL", "TSLA", "JPM"], dt=1 / 252, event_probability=0, seed=2)
    returns = log_returns(sim, 20_000)
    for ticker in ("AAPL", "TSLA", "JPM"):
        sigma = seed_prices.TICKER_PARAMS[ticker][1]
        assert returns[ticker].std() * np.sqrt(252) == pytest.approx(sigma, rel=0.05)


def test_drift(monkeypatch):
    monkeypatch.setitem(seed_prices.TICKER_PARAMS, "AAPL", (0.05, 1e-9))
    sim = GBMSimulator(["AAPL"], dt=1.0, event_probability=0, seed=3)
    new = sim.step()["AAPL"]
    assert new == pytest.approx(190.0 * np.exp(0.05), rel=1e-6)


def test_correlation():
    sim = GBMSimulator(["AAPL", "MSFT", "JPM"], dt=1 / 252, event_probability=0, seed=4)
    r = log_returns(sim, 20_000)
    assert np.corrcoef(r["AAPL"], r["MSFT"])[0, 1] == pytest.approx(0.6, abs=0.05)
    assert np.corrcoef(r["AAPL"], r["JPM"])[0, 1] == pytest.approx(0.3, abs=0.05)


def test_events_always_and_never():
    sim = GBMSimulator(DEFAULT, event_probability=1, seed=5)
    before = dict(sim.prices)
    for t, p in sim.step().items():
        move = abs(p / before[t] - 1)
        assert 0.019 < move < 0.051

    sim = GBMSimulator(DEFAULT, event_probability=0, seed=6)
    for _ in range(1000):
        before = dict(sim.prices)
        for t, p in sim.step().items():
            assert abs(p / before[t] - 1) < 0.005


def test_ticker_management():
    sim = GBMSimulator([], seed=7)
    assert sim.step() == {}
    sim.add_ticker("AAPL")
    sim.add_ticker("AAPL")
    assert sim.tickers == ["AAPL"]
    assert sim.prices["AAPL"] == 190.0
    sim.add_ticker("ZZZZ")
    assert 50 <= sim.prices["ZZZZ"] <= 300
    sim.remove_ticker("NOPE")
    sim.remove_ticker("AAPL")
    assert sim.tickers == ["ZZZZ"]
    assert set(sim.step()) == {"ZZZZ"}


@pytest.mark.parametrize(
    ("a", "b", "expected"),
    [
        ("AAPL", "AAPL", 1.0),
        ("AAPL", "MSFT", 0.6),
        ("JPM", "V", 0.5),
        ("AAPL", "JPM", 0.3),
        ("TSLA", "AAPL", 0.3),
        ("ZZZZ", "AAPL", 0.3),
        ("ZZZZ", "YYYY", 0.3),
    ],
)
def test_pair_correlation(a, b, expected):
    assert pair_correlation(a, b) == expected
    assert pair_correlation(b, a) == expected


async def test_data_source_lifecycle():
    cache = PriceCache()
    source = SimulatorDataSource(cache, interval=0.01, seed=8)
    await source.start(["AAPL", "msft"])
    assert cache.get_price("AAPL") == 190.0
    assert cache.get_price("MSFT") == 420.0
    assert source.get_tickers() == ["AAPL", "MSFT"]

    version = cache.version
    await asyncio.sleep(0.1)
    assert cache.version > version

    await source.add_ticker("AAPL")  # idempotent
    assert source.get_tickers() == ["AAPL", "MSFT"]

    await source.remove_ticker("MSFT")
    assert cache.get("MSFT") is None
    assert source.get_tickers() == ["AAPL"]

    await source.stop()
    await source.stop()
