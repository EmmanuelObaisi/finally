"""REST routers for health, portfolio and watchlist."""

from app.routes.portfolio import router as portfolio_router
from app.routes.system import router as system_router
from app.routes.watchlist import router as watchlist_router

__all__ = ["portfolio_router", "system_router", "watchlist_router"]
