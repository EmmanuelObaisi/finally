"""Fixtures for database tests: each test gets a fresh, initialized SQLite file."""

import pytest

from app.db import init_db


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    """Point DB_PATH at a temp file and initialize it."""
    path = tmp_path / "test.db"
    monkeypatch.setenv("DB_PATH", str(path))
    init_db()
    return path
