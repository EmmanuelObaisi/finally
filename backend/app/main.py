"""FastAPI application: market data wiring and health check."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.market import PriceCache, create_market_data_source, create_stream_router

# Replaced by watchlist ∪ positions from SQLite once the database layer exists.
DEFAULT_TICKERS = ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA", "NVDA", "META", "JPM", "V", "NFLX"]

price_cache = PriceCache()
market_source = create_market_data_source(price_cache)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await market_source.start(DEFAULT_TICKERS)
    yield
    await market_source.stop()


app = FastAPI(title="FinAlly", lifespan=lifespan)
app.include_router(create_stream_router(price_cache))


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok", "tickers": market_source.get_tickers()}
