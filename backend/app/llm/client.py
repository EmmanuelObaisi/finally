"""The one LLM seam: mock or real call, returning the model's raw JSON text."""
import os

MODEL = "openrouter/openai/gpt-oss-120b"
PROVIDER = {"order": ["cerebras"], "allow_fallbacks": False, "require_parameters": True}
TIMEOUT_SECONDS = 30
MAX_TOKENS = 2000
NOT_CONFIGURED = "The AI assistant is not configured: OPENROUTER_API_KEY is missing."


class LLMUnavailable(Exception):
    """The assistant cannot be reached and the text is safe to show the user."""


async def complete(settings, messages: list[dict]) -> str | None:
    """Raw JSON text of the model's reply, mock or real."""
    if settings.llm_mock:
        from .mock import mock_complete
        return mock_complete(messages)
    if not settings.openrouter_api_key:
        raise LLMUnavailable(NOT_CONFIGURED)
    os.environ.setdefault("LITELLM_LOCAL_MODEL_COST_MAP", "True")
    import litellm
    from .schema import ChatReply
    litellm.suppress_debug_info = True
    response = await litellm.acompletion(
        model=MODEL, messages=messages, response_format=ChatReply, reasoning_effort="low",
        extra_body={"provider": PROVIDER}, timeout=TIMEOUT_SECONDS, num_retries=0,
        max_tokens=MAX_TOKENS, api_key=settings.openrouter_api_key,
    )
    return response.choices[0].message.content
