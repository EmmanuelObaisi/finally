"""Shared fixtures: every test runs with no config env vars and a temporary project root."""
import pytest

from app import config
from app.config import Settings

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
