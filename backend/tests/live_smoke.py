"""Manual live check, not collected by pytest. Run: uv run --directory backend python tests/live_smoke.py"""
import asyncio
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx

from app.config import Settings
from app.llm.client import MAX_TOKENS, MODEL, PROVIDER, TIMEOUT_SECONDS
from app.llm.prompt import build_messages
from app.llm.schema import ChatReply

PORTFOLIO = {"cash": 8000.0, "total_value": 10000.0, "unrealized_pnl": 0.0, "positions": [
    {"ticker": "AAPL", "quantity": 10.0, "avg_cost": 200.0, "current_price": 200.0,
     "market_value": 2000.0, "unrealized_pnl": 0.0, "pnl_percent": 0.0}]}
WATCHLIST = [{"ticker": "AAPL", "price": 200.0}, {"ticker": "NVDA", "price": 118.4}]


async def ask(settings: Settings, text: str):
    """Call the real model once; return the response and its validated reply."""
    os.environ.setdefault("LITELLM_LOCAL_MODEL_COST_MAP", "True")
    import litellm
    litellm.suppress_debug_info = True
    response = await litellm.acompletion(
        model=MODEL, messages=build_messages(PORTFOLIO, WATCHLIST, [], text), response_format=ChatReply,
        reasoning_effort="low", extra_body={"provider": PROVIDER}, timeout=TIMEOUT_SECONDS,
        num_retries=0, max_tokens=MAX_TOKENS, api_key=settings.openrouter_api_key)
    reply = ChatReply.model_validate_json(response.choices[0].message.content)
    return response, reply


def provider_name(key: str, generation_id: str) -> str:
    """OpenRouter's record of which host served the call; the record can lag a moment."""
    for _ in range(10):
        found = httpx.get("https://openrouter.ai/api/v1/generation", params={"id": generation_id},
                          headers={"Authorization": f"Bearer {key}"})
        if found.status_code == 200:
            return found.json()["data"]["provider_name"]
        time.sleep(2)
    raise AssertionError("generation record not found")


async def main() -> None:
    settings = Settings.from_env()
    assert settings.openrouter_api_key, "OPENROUTER_API_KEY is not set"
    response, reply = await ask(settings, "How concentrated is my portfolio?")
    name = provider_name(settings.openrouter_api_key, response.id)
    print("finish:", response.choices[0].finish_reason, "reply chars:", len(reply.message), "provider:", name)
    assert name == "Cerebras"
    _, hypothetical = await ask(settings, "What if I bought 100 TSLA?")
    assert hypothetical.trades == [], hypothetical.trades
    print("hypothetical produced no trades")


asyncio.run(main())
