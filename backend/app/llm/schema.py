"""Structured-output models for the chat reply; value rules stay in the trading services."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class TradeOrder(BaseModel):
    """One market order the model asks for."""
    model_config = ConfigDict(extra="forbid")
    ticker: str
    side: Literal["buy", "sell"]
    quantity: float = Field(allow_inf_nan=False)


class WatchlistChange(BaseModel):
    """One watchlist edit the model asks for."""
    model_config = ConfigDict(extra="forbid")
    ticker: str
    action: Literal["add", "remove"]


class ChatReply(BaseModel):
    """The model's whole reply: text plus the actions to execute."""
    model_config = ConfigDict(extra="forbid")
    message: str
    trades: list[TradeOrder] = []
    watchlist_changes: list[WatchlistChange] = []
