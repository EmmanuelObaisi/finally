"""Deterministic LLM responses for LLM_MOCK=true (CONTRACT.md section 7)."""

from app.llm.schemas import LLMResponse, TradeRequest, WatchlistChange

MOCK_RULES = [
    ("buy", LLMResponse(message="Mock: buying 1 AAPL.",
                        trades=[TradeRequest(ticker="AAPL", side="buy", quantity=1)])),
    ("sell", LLMResponse(message="Mock: selling 1 AAPL.",
                         trades=[TradeRequest(ticker="AAPL", side="sell", quantity=1)])),
    ("add", LLMResponse(message="Mock: adding PYPL to your watchlist.",
                        watchlist_changes=[WatchlistChange(ticker="PYPL", action="add")])),
    ("remove", LLMResponse(message="Mock: removing PYPL from your watchlist.",
                           watchlist_changes=[WatchlistChange(ticker="PYPL", action="remove")])),
]
DEFAULT_RESPONSE = LLMResponse(message="Mock: I am FinAlly, your AI trading assistant.")


def mock_response(user_message: str) -> LLMResponse:
    """Return the first mock response whose keyword appears in the message."""
    text = user_message.lower()
    for keyword, response in MOCK_RULES:
        if keyword in text:
            return response.model_copy(deep=True)
    return DEFAULT_RESPONSE.model_copy(deep=True)
