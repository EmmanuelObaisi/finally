"""Pytest configuration and fixtures."""

import pytest


@pytest.fixture(autouse=True)
def local_auth_disabled(monkeypatch):
    """Existing API tests run as the trusted local demo; auth tests opt in."""
    monkeypatch.setenv("AUTH_DISABLED", "true")


@pytest.fixture
def event_loop_policy():
    """Use the default event loop policy for all async tests."""
    import asyncio

    return asyncio.DefaultEventLoopPolicy()
