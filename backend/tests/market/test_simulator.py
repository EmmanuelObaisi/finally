"""Tests for the GBM simulator and its async data source."""

import asyncio

import numpy as np

from app.market import seed_prices
from app.market.cache import PriceCache
from app.market.simulator import GBMSimulator, SimulatorDataSource, pair_correlation

TECH_PAIR = ("AAPL", "MSFT")
CROSS_PAIR = ("AAPL", "JPM")


def log_returns(sim: GBMSimulator, steps: int) -> dict[str, np.ndarray]:
    """Step the simulator and collect log returns per ticker."""
    history = {t: [sim.prices[t]] for t in sim.tickers}
    for _ in range(steps):
        for t, p in sim.step().items():
            history[t].append(p)
    return {t: np.diff(np.log(v)) for t, v in history.items()}


def test_prices_stay_positive():
    sim = GBMSimulator(list(seed_prices.SEED_PRICES), seed=1)
    for _ in range(10_000):
        prices = sim.step()
    assert all(p > 0 for p in prices.values())


def test_volatility_matches_sigma():
    sim = GBMSimulator(["AAPL", "TSLA"], dt=1 / 252, event_probability=0, seed=2)
    rets = log_returns(sim, 20_000)
    assert abs(rets["AAPL"].std() * np.sqrt(252) - 0.22) < 0.22 * 0.05
    assert abs(rets["TSLA"].std() * np.sqrt(252) - 0.50) < 0.50 * 0.05


def test_drift_with_negligible_volatility(monkeypatch):
    monkeypatch.setitem(seed_prices.TICKER_PARAMS, "AAPL", (0.05, 1e-9))
    sim = GBMSimulator(["AAPL"], dt=1, event_probability=0, seed=3)
    new = sim.step()["AAPL"]
    assert abs(new / 190.0 - np.exp(0.05)) < 1e-6


def test_correlation_by_sector():
    sim = GBMSimulator(["AAPL", "MSFT", "JPM"], dt=1 / 252, event_probability=0, seed=4)
    rets = log_returns(sim, 20_000)
    tech = np.corrcoef(rets["AAPL"], rets["MSFT"])[0, 1]
    cross = np.corrcoef(rets["AAPL"], rets["JPM"])[0, 1]
    assert abs(tech - 0.6) < 0.05
    assert abs(cross - 0.3) < 0.05


def test_forced_event_moves_two_to_five_percent():
    sim = GBMSimulator(["AAPL", "JPM"], event_probability=1, seed=5)
    before = dict(sim.prices)
    after = sim.step()
    for t in before:
        move = abs(after[t] / before[t] - 1)
        assert 0.019 < move < 0.051


def test_no_events_means_small_moves():
    sim = GBMSimulator(list(seed_prices.SEED_PRICES), event_probability=0, seed=6)
    for _ in range(1000):
        before = dict(sim.prices)
        after = sim.step()
        assert all(abs(after[t] / before[t] - 1) < 0.005 for t in before)


def test_ticker_management():
    sim = GBMSimulator(["AAPL"], seed=7)
    sim.add_ticker("AAPL")
    assert sim.tickers == ["AAPL"]
    sim.remove_ticker("NOPE")
    sim.add_ticker("ZZZZ")
    assert 50 <= sim.prices["ZZZZ"] <= 300
    sim.remove_ticker("AAPL")
    sim.remove_ticker("ZZZZ")
    assert sim.step() == {}


def test_pair_correlation_table():
    assert pair_correlation("AAPL", "AAPL") == 1.0
    assert pair_correlation(*TECH_PAIR) == 0.6
    assert pair_correlation("JPM", "V") == 0.5
    assert pair_correlation("TSLA", "AAPL") == 0.3
    assert pair_correlation(*CROSS_PAIR) == 0.3
    assert pair_correlation("ZZZZ", "AAPL") == 0.3
    assert pair_correlation("MSFT", "AAPL") == pair_correlation("AAPL", "MSFT")


async def test_data_source_lifecycle():
    cache = PriceCache()
    source = SimulatorDataSource(cache, interval=0.01)
    await source.start(["AAPL", "MSFT"])
    assert cache.get_price("AAPL") == 190.0
    version = cache.version
    await asyncio.sleep(0.1)
    assert cache.version > version
    await source.remove_ticker("MSFT")
    assert cache.get("MSFT") is None
    assert source.get_tickers() == ["AAPL"]
    await source.stop()
    await source.stop()


async def test_data_source_add_existing_ticker_is_noop():
    cache = PriceCache()
    source = SimulatorDataSource(cache)
    await source.start(["AAPL"])
    version = cache.version
    await source.add_ticker("AAPL")
    assert cache.version == version
    await source.stop()
