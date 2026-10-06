"""Process-wide singletons: the price cache and the market data source writing to it."""

from app.market import PriceCache, create_market_data_source

price_cache = PriceCache()
market_source = create_market_data_source(price_cache)
