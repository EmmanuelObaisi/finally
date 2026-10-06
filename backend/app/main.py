"""FastAPI entry point: API routers, SSE stream, background tasks and the static frontend."""

import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")

from fastapi import FastAPI  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from starlette.exceptions import HTTPException  # noqa: E402

from app import db, deps  # noqa: E402
from app.llm import create_chat_router  # noqa: E402
from app.market import create_stream_router  # noqa: E402
from app.portfolio import service  # noqa: E402
from app.portfolio.snapshots import record_snapshots  # noqa: E402
from app.routes import portfolio_router, system_router, watchlist_router  # noqa: E402

STATIC_DIR = Path(os.environ.get("STATIC_DIR") or Path(__file__).resolve().parents[1] / "static")


class SPAStaticFiles(StaticFiles):
    """Serves the Next.js export, falling back to index.html for unknown non-API paths."""

    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code != 404 or path.startswith("api"):
                raise
            return await super().get_response("index.html", scope)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize the database, start market data and the snapshot recorder."""
    db.init_db()
    await deps.market_source.start(service.tracked_tickers())
    snapshots = asyncio.create_task(record_snapshots(), name="portfolio-snapshots")
    yield
    snapshots.cancel()
    await deps.market_source.stop()


app = FastAPI(title="FinAlly", lifespan=lifespan)
app.include_router(system_router)
app.include_router(portfolio_router)
app.include_router(watchlist_router)
app.include_router(create_chat_router())
app.include_router(create_stream_router(deps.price_cache))
if STATIC_DIR.is_dir():
    app.mount("/", SPAStaticFiles(directory=STATIC_DIR), name="static")
