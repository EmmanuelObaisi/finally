"""Execution of LLM-requested actions through the portfolio service."""

from app.llm.actions import execute_actions
from app.llm.schemas import LLMResponse


async def test_successful_actions(backend):
    response = LLMResponse.model_validate({
        "message": "ok",
        "trades": [{"ticker": "aapl", "side": "buy", "quantity": 2}],
        "watchlist_changes": [{"ticker": "pypl", "action": "add"}, {"ticker": "nflx", "action": "remove"}],
    })
    actions = await execute_actions(response)
    assert actions["trades"] == [{"ticker": "AAPL", "side": "buy", "quantity": 2, "status": "ok", "price": 190.0}]
    assert actions["watchlist_changes"] == [
        {"ticker": "PYPL", "action": "add", "status": "ok"},
        {"ticker": "NFLX", "action": "remove", "status": "ok"},
    ]
    assert backend.trades == [("aapl", "buy", 2)]
    assert backend.watchlist_calls == [("add", "pypl"), ("remove", "nflx")]


async def test_trade_error_is_reported(backend):
    backend.trade_error = "Insufficient cash"
    response = LLMResponse.model_validate({
        "message": "ok", "trades": [{"ticker": "AAPL", "side": "buy", "quantity": 1000}]})
    trade = (await execute_actions(response))["trades"][0]
    assert trade["status"] == "error"
    assert trade["error"] == "Insufficient cash"
    assert "price" not in trade


async def test_watchlist_error_is_reported(backend):
    backend.watchlist_error = "Unknown ticker"
    response = LLMResponse.model_validate({
        "message": "ok", "watchlist_changes": [{"ticker": "ZZZZ", "action": "add"}]})
    assert (await execute_actions(response))["watchlist_changes"] == [
        {"ticker": "ZZZZ", "action": "add", "status": "error", "error": "Unknown ticker"}]


async def test_no_actions(backend):
    assert await execute_actions(LLMResponse(message="hi")) == {"trades": [], "watchlist_changes": []}
