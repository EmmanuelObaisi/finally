"""System prompt and message construction for the chat LLM call."""

import json

SYSTEM_PROMPT = """You are FinAlly, an AI trading assistant inside a simulated trading workstation.
The user trades a virtual portfolio with fake money using market orders that fill instantly.

Your job:
- Analyze portfolio composition, risk concentration and P&L.
- Suggest trades with brief reasoning.
- Execute trades when the user asks or agrees, by listing them in "trades".
- Manage the watchlist proactively, by listing changes in "watchlist_changes".
- Be concise and data-driven. Use the numbers in the context below.

Rules:
- When the user asks for a trade, include it in "trades" even if the ticker has no price in the context.
  The system fetches live prices and validates cash and holdings, and reports any failure to the user.
- Tickers are upper-case symbols such as AAPL. Quantities are positive numbers of shares.
- Leave "trades" and "watchlist_changes" empty unless the user asked for an action or agreed to one.
- Always respond with valid JSON matching the required schema.
"""


def build_context(portfolio: dict, watchlist: list[dict]) -> str:
    """Render the portfolio and watchlist as a context block for the LLM."""
    return "Current portfolio:\n" + json.dumps(portfolio) + "\n\nWatchlist with live prices:\n" + json.dumps(watchlist)


def history_message(row: dict) -> dict:
    """Convert a stored chat row into an LLM message, noting executed actions."""
    content = row["content"]
    if row.get("actions") and any(row["actions"].values()):
        content += "\n[Executed actions: " + json.dumps(row["actions"]) + "]"
    return {"role": row["role"], "content": content}


def build_messages(user_message: str, portfolio: dict, watchlist: list[dict], history: list[dict]) -> list[dict]:
    """Assemble the full message list: system prompt, context, history, new user message."""
    system = SYSTEM_PROMPT + "\n" + build_context(portfolio, watchlist)
    messages = [{"role": "system", "content": system}]
    messages += [history_message(row) for row in history]
    messages.append({"role": "user", "content": user_message})
    return messages
