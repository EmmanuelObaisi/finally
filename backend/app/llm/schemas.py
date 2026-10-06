"""Pydantic models for the chat endpoint and the LLM structured output."""

from typing import Literal

from pydantic import BaseModel


class TradeRequest(BaseModel):
    """A trade the LLM wants executed."""

    ticker: str
    side: Literal["buy", "sell"]
    quantity: float


class WatchlistChange(BaseModel):
    """A watchlist modification the LLM wants applied."""

    ticker: str
    action: Literal["add", "remove"]


class LLMResponse(BaseModel):
    """Structured output the LLM must return."""

    message: str
    trades: list[TradeRequest] = []
    watchlist_changes: list[WatchlistChange] = []


class ChatRequest(BaseModel):
    """Body of POST /api/chat."""

    message: str
