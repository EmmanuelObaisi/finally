"""POST /api/chat: LLM chat with auto-executed trades and watchlist changes."""

from fastapi import APIRouter, HTTPException

from app import db
from app.llm.actions import execute_actions
from app.llm.client import get_llm_response
from app.llm.prompt import build_messages
from app.llm.schemas import ChatRequest
from app.portfolio import service

HISTORY_LIMIT = 20


async def handle_chat(user_message: str) -> dict:
    """Run one chat turn and return the ChatResponse dict (CONTRACT.md section 6)."""
    history = db.get_chat_messages(limit=HISTORY_LIMIT)
    messages = build_messages(user_message, service.get_portfolio(), service.get_watchlist_with_prices(), history)
    db.insert_chat_message("user", user_message)
    try:
        response = await get_llm_response(user_message, messages)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM request failed: {exc}") from exc
    actions = await execute_actions(response)
    db.insert_chat_message("assistant", response.message, actions)
    return {"message": response.message, "actions": actions, "portfolio": service.get_portfolio()}


def create_chat_router() -> APIRouter:
    """Build the router exposing POST /api/chat."""
    router = APIRouter(prefix="/api")

    @router.post("/chat")
    async def chat(request: ChatRequest) -> dict:
        """Send a message to FinAlly and get its reply plus executed actions."""
        return await handle_chat(request.message)

    return router
