"""Route fixtures: the full app running its lifespan against a temp DB and FakeSource."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.portfolio.conftest import market, temp_db  # noqa: F401


@pytest.fixture
def client(market):  # noqa: F811
    """TestClient with lifespan (init_db, market start, snapshot task) running."""
    with TestClient(app) as test_client:
        yield test_client
