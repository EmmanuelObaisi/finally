# FinAlly Backend

FastAPI app managed with `uv`. Currently contains the market data subsystem.

```bash
uv sync --extra dev
uv run pytest
uv run ruff check . && uv run ruff format --check .
uv run uvicorn app.main:app --reload
```

## Layout

```
app/
├── main.py              # FastAPI app: lifespan starts the market source, /api/health
└── market/
    ├── models.py        # PriceUpdate
    ├── cache.py         # PriceCache (thread-safe, version counter)
    ├── interface.py     # MarketDataSource ABC
    ├── seed_prices.py   # simulator seed prices, GBM params, sectors
    ├── simulator.py     # GBMSimulator + SimulatorDataSource
    ├── massive_client.py# MassiveDataSource (snapshot, free-plan EOD fallback)
    ├── factory.py       # picks the source from MASSIVE_API_KEY
    └── stream.py        # GET /api/stream/prices (SSE)
```

Design: `planning/MARKET_INTERFACE.md`, `planning/MARKET_SIMULATOR.md`, `planning/MASSIVE_API.md`.

`app/main.py` tracks the ten default tickers until the database layer provides
watchlist ∪ open positions.
