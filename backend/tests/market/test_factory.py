"""The factory picks the market data source from Settings alone."""
import dataclasses

import numpy as np
import pytest
from massive import RESTClient

from app.config import Settings
from app.market.cache import PriceCache
from app.market.factory import create_market_data_source
from app.market.massive_client import MassiveDataSource
from app.market.simulator import SimulatorDataSource


@pytest.mark.parametrize("value", [None, "", "   "])
def test_blank_or_missing_key_gives_the_simulator(monkeypatch, value):
    if value is not None:
        monkeypatch.setenv("MASSIVE_API_KEY", value)
    source = create_market_data_source(PriceCache(), Settings.from_env())
    assert isinstance(source, SimulatorDataSource)


def test_a_key_gives_massive_with_a_real_client(monkeypatch):
    monkeypatch.setenv("MASSIVE_API_KEY", "abc")
    source = create_market_data_source(PriceCache(), Settings.from_env())
    assert isinstance(source, MassiveDataSource)
    assert isinstance(source.client, RESTClient)


def test_simulator_branch_carries_seed_and_event_probability(settings):
    custom = dataclasses.replace(settings, sim_seed=7, sim_event_probability=0.25)
    source = create_market_data_source(PriceCache(), custom)
    assert source.sim.event_probability == 0.25
    assert source.sim.rng.bit_generator.state == np.random.default_rng(7).bit_generator.state
