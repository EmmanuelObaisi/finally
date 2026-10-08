"""One error shape for every failure: {"error": "..."}."""
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class DomainError(Exception):
    """A rule violation the client can fix, answered as {"error": message}."""

    status_code = 400


class NotFoundError(DomainError):
    """A named resource that does not exist, answered as 404."""

    status_code = 404


def register_error_handlers(app: FastAPI) -> None:
    """Map HTTP errors to their status, validation errors to 400, anything else to 500."""

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0]
        loc = ".".join(str(p) for p in first["loc"] if p != "body")
        return JSONResponse({"error": f"{loc}: {first['msg']}"}, status_code=400)

    @app.exception_handler(DomainError)
    async def domain_error(_: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse({"error": str(exc)}, status_code=exc.status_code)

    @app.exception_handler(Exception)
    async def unhandled_error(_: Request, exc: Exception) -> JSONResponse:
        return JSONResponse({"error": "Internal server error"}, status_code=500)
