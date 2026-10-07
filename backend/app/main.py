"""FastAPI app factory. Request and response shapes follow planning/API_CONTRACT.md."""
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

from .config import Settings
from .errors import register_error_handlers


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build the app. Static files are mounted last and only if the export exists."""
    settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.settings = settings
        yield

    app = FastAPI(lifespan=lifespan)
    register_error_handlers(app)

    @app.get("/api/health")
    def health() -> dict:
        return {"status": "ok"}

    # Later routers are included above this catch-all so unknown /api paths stay JSON 404s.
    @app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
    def api_not_found(path: str):
        raise HTTPException(status_code=404, detail="Not found")

    if settings.static_dir.is_dir():
        app.mount("/", StaticFiles(directory=settings.static_dir, html=True), name="frontend")
    return app
