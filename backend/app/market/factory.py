"""Chooses the market data source from Settings."""

from ..config import Settings
from .cache import PriceCache
from .interface import MarketDataSource
from .simulator import SimulatorDataSource


def create_market_data_source(cache: PriceCache, settings: Settings) -> MarketDataSource:
    """Build the market data source that writes to the given cache."""
    return SimulatorDataSource(
        cache,
        seed=settings.sim_seed,
        event_probability=settings.sim_event_probability,
    )
