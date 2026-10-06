"""Health check."""

from fastapi import APIRouter

router = APIRouter(prefix="/api")


@router.get("/health")
def health() -> dict:
    """Liveness probe for Docker and deployments."""
    return {"status": "ok"}
