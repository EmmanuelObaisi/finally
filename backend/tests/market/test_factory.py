import pytest

from app.market.cache import PriceCache
from app.market.factory import create_market_data_source
from app.market.interface import MarketDataSource
from app.market.massive_client import MassiveDataSource
from app.market.simulator import SimulatorDataSource


@pytest.mark.parametrize("value", [None, "", "   "])
def test_no_key_uses_simulator(monkeypatch, value):
    if value is None:
        monkeypatch.delenv("MASSIVE_API_KEY", raising=False)
    else:
        monkeypatch.setenv("MASSIVE_API_KEY", value)
    source = create_market_data_source(PriceCache())
    assert isinstance(source, SimulatorDataSource)
    assert isinstance(source, MarketDataSource)


def test_key_uses_massive(monkeypatch):
    monkeypatch.setenv("MASSIVE_API_KEY", "abc123")
    source = create_market_data_source(PriceCache())
    assert isinstance(source, MassiveDataSource)
    assert isinstance(source, MarketDataSource)
