"""FastAPI app factory. Request and response shapes follow planning/API_CONTRACT.md."""
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from . import portfolio, trading, watchlist
from .config import Settings
from .db import connect, init_db, load_tracked_tickers
from .errors import register_error_handlers
from .market import stream
from .market.cache import PriceCache
from .market.factory import create_market_data_source


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build the app. Static files are mounted last and only if the export exists."""
    settings = settings or Settings.from_env()
    cache = PriceCache()
    source = create_market_data_source(cache, settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.settings = settings
        app.state.cache = cache
        app.state.source = source
        app.state.tracking_lock = asyncio.Lock()
        init_db(settings.db_path)
        with connect(settings.db_path) as conn:
            tickers = load_tracked_tickers(conn)
        await source.start(tickers)
        yield
        await source.stop()

    app = FastAPI(lifespan=lifespan)
    register_error_handlers(app)

    @app.get("/api/health")
    def health() -> dict:
        return {"status": "ok"}

    app.include_router(stream.router)
    app.include_router(watchlist.router)
    app.include_router(portfolio.router)
    app.include_router(trading.router)

    # Later routers are included above this catch-all so unknown /api paths stay JSON 404s.
    # A response instance is a raw ASGI app, so Starlette matches every HTTP method
    # (API_CONTRACT.md: any unknown /api path, any method, is 404).
    app.add_route("/api/{path:path}", JSONResponse({"error": "Not found"}, status_code=404))

    if settings.static_dir.is_dir():
        app.mount("/", StaticFiles(directory=settings.static_dir, html=True), name="frontend")
    return app
