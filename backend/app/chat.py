"""Chat turn: prompt, one LLM call, per-action execution through the trading services, persistence."""
import asyncio
import logging

from fastapi import APIRouter, Request
from pydantic import BaseModel

from .chat_store import load_recent, save_turn
from .db import connect, now_iso
from .errors import DomainError
from .llm.client import LLMUnavailable, complete
from .llm.prompt import HISTORY_LIMIT, build_messages
from .llm.schema import ChatReply
from .portfolio import build_portfolio
from .trading import place_trade
from .watchlist import add_to_watchlist, build_watchlist, remove_from_watchlist

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_MESSAGE_CHARS = 2000
MAX_ACTIONS = 10
HISTORY_ROWS = 100
OVER_CAP_ERROR = "Too many actions in one reply"
GENERIC_ERROR = (
    "The AI assistant could not complete that request. "
    "No trades or watchlist changes were made. Try again in a moment."
)


class ChatRequest(BaseModel):
    """Body of POST /api/chat."""

    message: str


def redact(text: str, key: str) -> str:
    """Replace the API key in text with [redacted]."""
    return text.replace(key, "[redacted]") if key else text


def read_context(state) -> tuple[dict, list[dict], list[dict]]:
    """Portfolio, watchlist and the recent history, read on one short connection."""
    with connect(state.settings.db_path) as conn:
        return (
            build_portfolio(conn, state.cache),
            build_watchlist(conn, state.cache),
            load_recent(conn, HISTORY_LIMIT),
        )


async def get_reply(state, messages: list[dict]) -> tuple[ChatReply | None, str]:
    """The parsed model reply, or (None, fixed error text) on any LLM or parse failure."""
    try:
        raw = await complete(state.settings, messages)
        return ChatReply.model_validate_json(raw), ""
    except LLMUnavailable as exc:
        return None, str(exc)
    except Exception as exc:
        logger.warning(
            "chat LLM turn failed: %s: %s",
            type(exc).__name__, redact(str(exc), state.settings.openrouter_api_key),
        )
        return None, GENERIC_ERROR


def trade_action(order, ok: bool, error: str | None, fill: dict | None = None) -> dict:
    """The action record of one requested trade."""
    return {
        "type": "trade",
        "ticker": fill["ticker"] if fill else order.ticker,
        "side": order.side,
        "quantity": fill["quantity"] if fill else order.quantity,
        "price": fill["price"] if fill else None,
        "ok": ok,
        "error": error,
    }


def watchlist_action(change, ok: bool, error: str | None) -> dict:
    """The action record of one requested watchlist change."""
    return {
        "type": "watchlist",
        "ticker": change.ticker.upper() if ok else change.ticker,
        "action": change.action,
        "ok": ok,
        "error": error,
    }


async def run_trade(state, order) -> dict:
    """Fill one requested trade; a rule violation becomes a failed action."""
    try:
        result = await place_trade(state, order.ticker, order.side, order.quantity)
    except DomainError as exc:
        return trade_action(order, False, str(exc))
    return trade_action(order, True, None, result["trade"])


async def run_watchlist(state, change) -> dict:
    """Apply one requested watchlist change; a rule violation becomes a failed action."""
    try:
        if change.action == "add":
            await add_to_watchlist(state, change.ticker)
        else:
            await remove_from_watchlist(state, change.ticker)
    except DomainError as exc:
        return watchlist_action(change, False, str(exc))
    return watchlist_action(change, True, None)


async def execute(state, reply: ChatReply) -> list[dict]:
    """Run trades then watchlist changes one at a time; entries past the cap are not run."""
    actions = []
    for index, order in enumerate(reply.trades):
        if index < MAX_ACTIONS:
            actions.append(await run_trade(state, order))
        else:
            actions.append(trade_action(order, False, OVER_CAP_ERROR))
    for index, change in enumerate(reply.watchlist_changes):
        if index < MAX_ACTIONS:
            actions.append(await run_watchlist(state, change))
        else:
            actions.append(watchlist_action(change, False, OVER_CAP_ERROR))
    return actions


def finish_turn(state, text: str, asked_at: str, message: str, actions: list[dict]) -> dict:
    """Store the turn and return the response with fresh portfolio and watchlist."""
    with connect(state.settings.db_path) as conn:
        save_turn(conn, text, asked_at, message, actions)
        return {
            "message": message,
            "actions": actions,
            "portfolio": build_portfolio(conn, state.cache),
            "watchlist": build_watchlist(conn, state.cache),
        }


async def run_turn(state, raw_text: str) -> dict:
    """One whole chat turn; no connection is held while the model call is awaited."""
    text = raw_text.strip()
    if not text:
        raise DomainError("Message must not be empty")
    if len(text) > MAX_MESSAGE_CHARS:
        raise DomainError("Message is too long")
    asked_at = now_iso()
    portfolio, watchlist, history = await asyncio.to_thread(read_context, state)
    reply, error = await get_reply(state, build_messages(portfolio, watchlist, history, text))
    actions = await execute(state, reply) if reply else []
    message = reply.message if reply else error
    return await asyncio.to_thread(finish_turn, state, text, asked_at, message, actions)


@router.post("/api/chat")
async def post_chat(body: ChatRequest, request: Request) -> dict:
    """Run one chat turn."""
    return await run_turn(request.app.state, body.message)


@router.get("/api/chat/history")
def get_chat_history(request: Request) -> dict:
    """The stored conversation, oldest first."""
    with connect(request.app.state.settings.db_path) as conn:
        return {"messages": load_recent(conn, HISTORY_ROWS)}
