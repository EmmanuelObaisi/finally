"""complete(): the real-branch call shape, failure propagation and the missing-key rule."""
import os
import subprocess
import sys
import types
from dataclasses import replace
from importlib.metadata import version
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.llm.client import MAX_TOKENS, MODEL, NOT_CONFIGURED, PROVIDER, TIMEOUT_SECONDS, LLMUnavailable, complete
from app.llm.schema import ChatReply

BACKEND_DIR = Path(__file__).resolve().parents[1]
MESSAGES = [{"role": "system", "content": "s"}, {"role": "user", "content": "hi"}]


def fake_litellm(monkeypatch, content='{"message": "hi"}', error=None):
    """Install a fake litellm module whose acompletion records its kwargs."""
    module = types.ModuleType("litellm")
    module.calls = []

    async def acompletion(**kwargs):
        module.calls.append(kwargs)
        if error:
            raise error
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])

    module.acompletion = acompletion
    monkeypatch.setitem(sys.modules, "litellm", module)
    return module


@pytest.fixture
def keyed(settings):
    return replace(settings, openrouter_api_key="sk-test")


async def test_real_branch_awaits_acompletion_once_with_the_pinned_arguments(keyed, monkeypatch):
    module = fake_litellm(monkeypatch)
    await complete(keyed, MESSAGES)
    assert module.calls == [dict(
        model=MODEL, messages=MESSAGES, response_format=ChatReply, reasoning_effort="low",
        extra_body={"provider": {"order": ["cerebras"], "allow_fallbacks": False,
                                 "require_parameters": True}},
        timeout=30, num_retries=0, max_tokens=2000, api_key="sk-test")]
    assert (MODEL, TIMEOUT_SECONDS, MAX_TOKENS) == ("openrouter/openai/gpt-oss-120b", 30, 2000)
    assert PROVIDER["allow_fallbacks"] is False and PROVIDER["require_parameters"] is True


async def test_real_branch_returns_the_message_content(keyed, monkeypatch):
    fake_litellm(monkeypatch, content='{"message": "hello"}')
    assert await complete(keyed, MESSAGES) == '{"message": "hello"}'


async def test_none_content_is_returned_as_none(keyed, monkeypatch):
    fake_litellm(monkeypatch, content=None)
    assert await complete(keyed, MESSAGES) is None


async def test_real_branch_silences_litellm_and_skips_the_cost_map_fetch(keyed, monkeypatch):
    monkeypatch.delenv("LITELLM_LOCAL_MODEL_COST_MAP", raising=False)
    module = fake_litellm(monkeypatch)
    await complete(keyed, MESSAGES)
    assert module.suppress_debug_info is True
    assert os.environ["LITELLM_LOCAL_MODEL_COST_MAP"] == "True"
    monkeypatch.delenv("LITELLM_LOCAL_MODEL_COST_MAP")


@pytest.mark.parametrize("error", [TimeoutError("slow"), RuntimeError("boom")])
async def test_litellm_errors_propagate_unchanged(keyed, monkeypatch, error):
    fake_litellm(monkeypatch, error=error)
    with pytest.raises(type(error)) as caught:
        await complete(keyed, MESSAGES)
    assert caught.value is error


async def test_missing_key_raises_before_any_litellm_call(settings, monkeypatch):
    module = fake_litellm(monkeypatch)
    with pytest.raises(LLMUnavailable) as caught:
        await complete(settings, MESSAGES)
    assert str(caught.value) == NOT_CONFIGURED
    assert module.calls == []


async def test_mock_mode_never_awaits_acompletion(keyed, monkeypatch):
    module = fake_litellm(monkeypatch)
    await complete(replace(keyed, llm_mock=True), MESSAGES)
    assert module.calls == []


def run_in_backend(code: str) -> str:
    env = {**os.environ, "LITELLM_LOCAL_MODEL_COST_MAP": "True"}
    result = subprocess.run([sys.executable, "-c", code], cwd=BACKEND_DIR, env=env,
                            capture_output=True, text=True, check=True)
    return result.stdout.strip()


def test_installed_litellm_is_the_approved_version():
    assert version("litellm") == "1.104.0"


def test_installed_litellm_supports_response_schema_for_the_model():
    code = ("import litellm; from app.llm.client import MODEL; "
            "print(litellm.supports_response_schema(model=MODEL, custom_llm_provider='openrouter'))")
    assert run_in_backend(code) == "True"


def test_importing_the_llm_modules_does_not_import_litellm():
    code = ("import sys; import app.llm.client, app.llm.mock, app.llm.prompt; "
            "print('litellm' in sys.modules)")
    assert run_in_backend(code) == "False"
