"""Chooses the market data source from Settings."""

from ..config import Settings
from .cache import PriceCache
from .interface import MarketDataSource
from .massive_client import MassiveDataSource
from .simulator import SimulatorDataSource


def create_market_data_source(cache: PriceCache, settings: Settings) -> MarketDataSource:
    """Massive when a key is set, otherwise the simulator."""
    if settings.massive_api_key:
        return MassiveDataSource(cache, settings.massive_api_key)
    return SimulatorDataSource(
        cache,
        seed=settings.sim_seed,
        event_probability=settings.sim_event_probability,
    )
