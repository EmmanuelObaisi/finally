"""Deterministic keyword mock for LLM_MOCK=true; replaces only the model call."""
import re

from .schema import ChatReply, TradeOrder, WatchlistChange

WATCHLIST_RULE = re.compile(r"\b(add|remove)\s+([a-z][a-z.]{0,9})\b")
PLAIN = "I can analyze your portfolio, place trades and manage your watchlist. What would you like to do?"


def _trade(message: str, side: str, quantity: float) -> ChatReply:
    return ChatReply(message=message, trades=[TradeOrder(ticker="AAPL", side=side, quantity=quantity)])


def _watchlist(action: str, ticker: str) -> ChatReply:
    message = f"Adding {ticker} to your watchlist." if action == "add" else f"Removing {ticker} from your watchlist."
    return ChatReply(message=message, watchlist_changes=[WatchlistChange(ticker=ticker, action=action)])


def mock_complete(messages: list[dict]) -> str:
    """Raw reply text for the latest user message: first matching keyword rule wins."""
    text = messages[-1]["content"].lower()
    if "malformed" in text:
        return "not json"
    found = WATCHLIST_RULE.search(text)
    if "broke" in text:
        reply = _trade("Buying a very large position.", "buy", 1_000_000)
    elif found:
        reply = _watchlist(found.group(1), found.group(2).upper())
    elif "buy" in text:
        reply = _trade("Buying 1 AAPL now.", "buy", 1)
    elif "sell" in text:
        reply = _trade("Selling 1 AAPL now.", "sell", 1)
    else:
        reply = ChatReply(message=PLAIN)
    return reply.model_dump_json()
