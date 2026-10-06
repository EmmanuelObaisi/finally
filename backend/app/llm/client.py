"""LLM call via LiteLLM -> OpenRouter -> Cerebras, with a mock mode for tests."""

import asyncio
import os

from litellm import completion

from app.llm.mock import mock_response
from app.llm.schemas import LLMResponse

MODEL = "openrouter/openai/gpt-oss-120b"
EXTRA_BODY = {"provider": {"order": ["cerebras"]}}


def is_mock_mode() -> bool:
    """True when LLM_MOCK=true in the environment."""
    return os.environ.get("LLM_MOCK", "").strip().lower() == "true"


def parse_response(content: str) -> LLMResponse:
    """Validate the raw JSON returned by the LLM; raises pydantic.ValidationError."""
    return LLMResponse.model_validate_json(content)


def call_llm(messages: list[dict]) -> LLMResponse:
    """Call the model synchronously and parse its structured output."""
    response = completion(
        model=MODEL,
        messages=messages,
        response_format=LLMResponse,
        reasoning_effort="low",
        extra_body=EXTRA_BODY,
    )
    return parse_response(response.choices[0].message.content)


async def get_llm_response(user_message: str, messages: list[dict]) -> LLMResponse:
    """Return the mock response in mock mode, otherwise call the LLM off the event loop."""
    if is_mock_mode():
        return mock_response(user_message)
    return await asyncio.to_thread(call_llm, messages)
