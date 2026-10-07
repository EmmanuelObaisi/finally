from pathlib import Path

import pytest

from app import config


def test_defaults(monkeypatch, tmp_path):
    s = config.Settings.from_env()
    assert s.db_path == tmp_path / "db" / "finally.db"
    assert not s.llm_mock and s.sim_seed is None and s.sim_event_probability == 0.001
    assert s.openrouter_api_key == "" and s.massive_api_key == ""


def test_root_dotenv_is_loaded_and_real_env_wins(monkeypatch, tmp_path):
    (tmp_path / ".env").write_text("SIM_SEED=7\nSIM_EVENT_PROBABILITY=0.5\nLLM_MOCK=true\n")
    monkeypatch.setenv("SIM_EVENT_PROBABILITY", "0.0")        # real env beats .env
    s = config.Settings.from_env()
    assert s.sim_seed == 7 and s.llm_mock and s.sim_event_probability == 0.0


CONFIG_VARS = ("OPENROUTER_API_KEY", "MASSIVE_API_KEY", "LLM_MOCK", "DB_PATH", "SIM_SEED",
               "SIM_EVENT_PROBABILITY", "STATIC_DIR")


@pytest.mark.parametrize("blank", ["", "   "])
def test_blank_values_fall_back_to_defaults(monkeypatch, tmp_path, blank):
    for name in CONFIG_VARS:
        monkeypatch.setenv(name, blank)
    s = config.Settings.from_env()
    assert s.openrouter_api_key == "" and s.massive_api_key == ""
    assert s.llm_mock is False
    assert s.db_path == tmp_path / "db" / "finally.db"
    assert s.sim_seed is None and s.sim_event_probability == 0.001
    assert s.static_dir == config.BACKEND_DIR / "static"


def test_committed_env_example_loads_as_defaults(monkeypatch, tmp_path):
    template = config.BACKEND_DIR.parent / ".env.example"
    (tmp_path / ".env").write_text(template.read_text())
    s = config.Settings.from_env()
    assert s.sim_event_probability == 0.001 and s.sim_seed is None
    assert s.db_path == tmp_path / "db" / "finally.db" and s.llm_mock is False


def test_explicit_env_vars_are_read(monkeypatch, tmp_path):
    monkeypatch.setenv("OPENROUTER_API_KEY", "  or-key  ")
    monkeypatch.setenv("MASSIVE_API_KEY", " mass-key ")
    monkeypatch.setenv("DB_PATH", str(tmp_path / "custom.db"))
    s = config.Settings.from_env()
    assert s.openrouter_api_key == "or-key" and s.massive_api_key == "mass-key"
    assert s.db_path == Path(tmp_path / "custom.db")
