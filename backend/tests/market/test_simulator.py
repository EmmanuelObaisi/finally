"""Simulator tests: derived start prices, GBM math, correlation, events, seeding."""
import asyncio
import dataclasses
import itertools
import math
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

from app.market.cache import PriceCache
from app.market.factory import create_market_data_source
from app.market.interface import MarketDataSource
from app.market.seed_prices import SEED_PRICES, TICKER_PARAMS
from app.market.simulator import (
    TICK_SECONDS,
    GBMSimulator,
    SimulatorDataSource,
    derived_price,
    pair_correlation,
)

BACKEND_DIR = Path(__file__).resolve().parents[2]


def test_derived_price_known_values():
    assert derived_price("PYPL") == 211.74
    assert derived_price("ZZZZ") == 196.93


def test_derived_price_is_process_independent():
    code = "from app.market.simulator import derived_price; print(derived_price('PYPL'), derived_price('ZZZZ'))"
    result = subprocess.run(
        [sys.executable, "-c", code],
        cwd=BACKEND_DIR,
        env={**os.environ, "PYTHONHASHSEED": "12345"},
        capture_output=True,
        text=True,
        check=True,
    )
    assert result.stdout.split() == ["211.74", "196.93"]


async def test_source_add_unknown_ticker_caches_derived_price():
    cache = PriceCache()
    source = SimulatorDataSource(cache)
    await source.add_ticker("PYPL")
    update = cache.get("PYPL")
    assert update.price == 211.74
    assert update.session_start_price == 211.74
    assert cache.version == 1
    await source.add_ticker("PYPL")
    assert cache.version == 1


def log_returns(sim: GBMSimulator, steps: int) -> dict[str, np.ndarray]:
    """Run the simulator and return each ticker's log returns."""
    history = [sim.prices] + [sim.step() for _ in range(steps)]
    return {t: np.diff(np.log([h[t] for h in history])) for t in sim.tickers}


def test_defaults_match_seed_prices_and_tick_interval():
    assert GBMSimulator(list(SEED_PRICES)).prices == SEED_PRICES
    assert TICK_SECONDS == 0.5
    assert SimulatorDataSource(PriceCache()).interval == 0.5
    assert GBMSimulator([]).dt == 0.5 / (252 * 6.5 * 3600)


def test_prices_stay_positive():
    sim = GBMSimulator(list(SEED_PRICES), seed=1)
    for _ in range(10_000):
        assert min(sim.step().values()) > 0


@pytest.fixture(scope="module")
def daily_returns():
    """Log returns with dt of one trading day and events off, so sigma and rho are measurable."""
    sim = GBMSimulator(["AAPL", "MSFT", "JPM", "TSLA"], dt=1 / 252, event_probability=0, seed=1)
    return log_returns(sim, 20_000)


@pytest.mark.parametrize("ticker, sigma", [("AAPL", 0.22), ("MSFT", 0.20), ("JPM", 0.18), ("TSLA", 0.50)])
def test_annualized_volatility_matches_parameters(daily_returns, ticker, sigma):
    measured = daily_returns[ticker].std() * math.sqrt(252)
    assert measured == pytest.approx(sigma, rel=0.05)


@pytest.mark.parametrize("a, b, rho", [("AAPL", "MSFT", 0.6), ("AAPL", "JPM", 0.3), ("AAPL", "TSLA", 0.3)])
def test_log_return_correlation(daily_returns, a, b, rho):
    measured = np.corrcoef(daily_returns[a], daily_returns[b])[0, 1]
    assert measured == pytest.approx(rho, abs=0.05)


def test_drift_moves_price_by_exp_mu_dt(monkeypatch):
    monkeypatch.setitem(TICKER_PARAMS, "AAPL", (0.05, 1e-9))
    sim = GBMSimulator(["AAPL"], dt=1.0, event_probability=0, seed=1)
    assert sim.step()["AAPL"] == pytest.approx(190 * math.exp(0.05), rel=1e-6)


def test_event_moves_are_two_to_five_percent():
    sim = GBMSimulator(list(SEED_PRICES), event_probability=1, seed=1)
    before = sim.prices
    after = sim.step()
    for ticker in SEED_PRICES:
        assert 0.019 <= abs(after[ticker] / before[ticker] - 1) <= 0.051


def test_no_events_means_no_large_moves():
    sim = GBMSimulator(list(SEED_PRICES), event_probability=0, seed=1)
    before = sim.prices
    for _ in range(1_000):
        after = sim.step()
        assert all(abs(after[t] / before[t] - 1) < 0.01 for t in SEED_PRICES)
        before = after


def test_same_seed_is_reproducible_and_different_seed_differs():
    def run(seed):
        sim = GBMSimulator(list(SEED_PRICES), seed=seed)
        return [sim.step() for _ in range(100)]

    assert run(42) == run(42)
    assert run(42) != run(43)


def test_start_prices_do_not_depend_on_add_order():
    forward = GBMSimulator(["AAPL", "PYPL", "ZZZZ"], seed=3)
    backward = GBMSimulator(["ZZZZ", "PYPL", "AAPL"], seed=3)
    assert forward.prices == backward.prices


async def test_settings_reach_the_simulator(settings):
    tuned = dataclasses.replace(settings, sim_seed=7, sim_event_probability=0.25)
    first = create_market_data_source(PriceCache(), tuned)
    second = create_market_data_source(PriceCache(), tuned)
    assert isinstance(first, SimulatorDataSource)
    assert first.sim.event_probability == 0.25
    for source in (first, second):
        for ticker in ("AAPL", "MSFT", "PYPL"):
            await source.add_ticker(ticker)
    assert [first.sim.step() for _ in range(10)] == [second.sim.step() for _ in range(10)]


def test_ticker_management_edge_cases():
    sim = GBMSimulator(["AAPL"], seed=1)
    sim.step()
    price = sim.prices["AAPL"]
    sim.add_ticker("AAPL")
    assert sim.prices["AAPL"] == price
    assert sim.tickers == ["AAPL"]
    sim.remove_ticker("NOPE")
    assert sim.tickers == ["AAPL"]
    assert GBMSimulator([]).step() == {}


def test_pair_correlation_values_and_symmetry():
    assert pair_correlation("AAPL", "MSFT") == 0.6
    assert pair_correlation("JPM", "V") == 0.5
    assert pair_correlation("AAPL", "TSLA") == 0.3
    assert pair_correlation("AAPL", "JPM") == 0.3
    assert pair_correlation("PYPL", "ZZZZ") == 0.3
    assert pair_correlation("AAPL", "AAPL") == 1.0
    for a, b in itertools.combinations([*SEED_PRICES, "PYPL"], 2):
        assert pair_correlation(a, b) == pair_correlation(b, a)


def test_derived_price_range_and_precision():
    prices = [derived_price(f"T{i}") for i in range(1000)]
    assert all(50.0 <= p <= 300.0 for p in prices)
    assert all(round(p, 2) == p for p in prices)


async def test_running_source_moves_prices_and_removes_tickers():
    cache = PriceCache()
    source = SimulatorDataSource(cache, interval=0.01, seed=1)
    await source.start(["AAPL", "MSFT"])
    await asyncio.sleep(0.1)
    moved = [t for t in ("AAPL", "MSFT") if cache.get(t).price != cache.get(t).session_start_price]
    assert moved
    await source.remove_ticker("MSFT")
    assert cache.get("MSFT") is None
    assert source.get_tickers() == ["AAPL"]
    await source.stop()


def test_simulator_source_conforms_to_the_interface():
    assert issubclass(SimulatorDataSource, MarketDataSource)
    assert not SimulatorDataSource.__abstractmethods__
