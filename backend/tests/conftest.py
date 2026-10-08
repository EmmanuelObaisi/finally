"""Shared fixtures: every test runs with no config env vars and a temporary project root."""
import asyncio
import types

import pytest
import pytest_asyncio
import uvicorn
from fastapi.testclient import TestClient

from app import config
from app.config import Settings
from app.db import DEFAULT_TICKERS
from app.main import create_app
from app.market.interface import MarketDataSource

CONFIG_VARS = ("OPENROUTER_API_KEY", "MASSIVE_API_KEY", "LLM_MOCK", "DB_PATH", "SIM_SEED",
               "SIM_EVENT_PROBABILITY", "STATIC_DIR")


@pytest.fixture(autouse=True)
def isolated_env(monkeypatch, tmp_path):
    """Point ROOT_DIR at tmp_path and unset config vars; teardown restores the original env."""
    monkeypatch.setattr(config, "ROOT_DIR", tmp_path)
    for name in CONFIG_VARS:
        # setenv records the original value (or absence) so teardown also drops anything
        # load_dotenv wrote; delenv then leaves the variable unset for the test.
        monkeypatch.setenv(name, "")
        monkeypatch.delenv(name)


@pytest.fixture
def settings(tmp_path) -> Settings:
    """Explicit Settings: no environment and no .env involved."""
    return Settings(openrouter_api_key="", massive_api_key="", llm_mock=False,
                    db_path=tmp_path / "t.db", sim_seed=None, sim_event_probability=0.001,
                    static_dir=tmp_path / "static")


@pytest_asyncio.fixture
async def live_server(settings):
    """Real uvicorn server on a free port: the only transport that streams SSE incrementally."""
    config_ = uvicorn.Config(create_app(settings), host="127.0.0.1", port=0,
                             log_level="warning", timeout_graceful_shutdown=1)
    server = uvicorn.Server(config_)
    task = asyncio.create_task(server.serve())
    for _ in range(200):
        if server.started:
            break
        await asyncio.sleep(0.05)
    assert server.started
    port = server.servers[0].sockets[0].getsockname()[1]
    yield types.SimpleNamespace(url=f"http://127.0.0.1:{port}", server=server, task=task)
    server.should_exit = True
    await asyncio.wait_for(task, 5)


FIXED_PRICES = {ticker: 100.0 for ticker in DEFAULT_TICKERS} | {"PYPL": 60.0}


class FixedPriceSource(MarketDataSource):
    """Prices known tickers once when tracked and never ticks; unknown tickers stay unpriced."""

    def __init__(self, cache, prices):
        self.cache = cache
        self.prices = prices
        self.tracked: set[str] = set()
        self.added: list[str] = []

    async def start(self, tickers):
        for ticker in tickers:
            await self.add_ticker(ticker)

    async def stop(self):
        pass

    async def add_ticker(self, ticker):
        self.added.append(ticker)
        if ticker in self.tracked:
            return
        self.tracked.add(ticker)
        if ticker in self.prices:
            self.cache.update(ticker, self.prices[ticker])

    async def remove_ticker(self, ticker):
        self.tracked.discard(ticker)
        self.cache.remove(ticker)

    def get_tickers(self):
        return sorted(self.tracked)


@pytest.fixture
def client(settings, monkeypatch):
    """TestClient whose market source is a FixedPriceSource (no ticking, exact cash maths)."""
    monkeypatch.setattr(
        "app.main.create_market_data_source",
        lambda cache, _settings: FixedPriceSource(cache, dict(FIXED_PRICES)),
    )
    with TestClient(create_app(settings)) as test_client:
        yield test_client
