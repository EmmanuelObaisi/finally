"""Tests for PriceCache, PriceUpdate and the factory."""

import pytest

from app.market.cache import PriceCache
from app.market.factory import create_market_data_source
from app.market.massive_client import MassiveDataSource
from app.market.simulator import SimulatorDataSource


def test_first_update_is_flat():
    cache = PriceCache()
    update = cache.update("AAPL", 190.0)
    assert update.previous_price == 190.0
    assert update.direction == "flat"
    assert update.change == 0
    assert update.day_change_percent == 0


def test_second_update_sets_direction_and_reference_sticks():
    cache = PriceCache()
    cache.update("AAPL", 100.0)
    update = cache.update("AAPL", 101.234)
    assert update.price == 101.23
    assert update.previous_price == 100.0
    assert update.direction == "up"
    assert update.change == 1.23
    assert update.reference_price == 100.0
    assert update.day_change_percent == 1.23
    assert cache.update("AAPL", 99.0).direction == "down"


def test_explicit_reference_price():
    cache = PriceCache()
    update = cache.update("AAPL", 110.0, reference_price=100.0)
    assert update.day_change_percent == 10.0


def test_remove_bumps_version_only_when_present():
    cache = PriceCache()
    cache.update("AAPL", 1.0)
    version = cache.version
    cache.remove("AAPL")
    assert cache.version == version + 1
    assert cache.get_price("AAPL") is None
    cache.remove("AAPL")
    assert cache.version == version + 1


def test_to_dict_shape():
    cache = PriceCache()
    data = cache.update("AAPL", 1.0, timestamp=5.0).to_dict()
    assert set(data) == {"ticker", "price", "previous_price", "timestamp", "change", "direction", "day_change_percent"}


@pytest.mark.parametrize("key", [None, "", "   "])
def test_factory_uses_simulator_without_key(monkeypatch, key):
    if key is None:
        monkeypatch.delenv("MASSIVE_API_KEY", raising=False)
    else:
        monkeypatch.setenv("MASSIVE_API_KEY", key)
    assert isinstance(create_market_data_source(PriceCache()), SimulatorDataSource)


def test_factory_uses_massive_with_key(monkeypatch):
    monkeypatch.setenv("MASSIVE_API_KEY", "abc")
    assert isinstance(create_market_data_source(PriceCache()), MassiveDataSource)
