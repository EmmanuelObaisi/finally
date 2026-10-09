"""Prompt assembly: system rules, portfolio context and outcome-annotated history."""
HISTORY_LIMIT = 0
SYSTEM_PROMPT = ""


def build_context(portfolio: dict, watchlist: list[dict]) -> str:
    return ""


def action_line(action: dict) -> str:
    return ""


def build_messages(portfolio, watchlist, history, user_text) -> list[dict]:
    return []
