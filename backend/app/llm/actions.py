"""Execute the trades and watchlist changes requested by the LLM."""

from app.llm.schemas import LLMResponse, TradeRequest, WatchlistChange
from app.portfolio import service


async def run_trade(trade: TradeRequest) -> dict:
    """Execute one trade and report its outcome."""
    result = {"ticker": trade.ticker.upper(), "side": trade.side, "quantity": trade.quantity}
    try:
        executed = await service.execute_trade(trade.ticker, trade.side, trade.quantity)
    except service.TradeError as exc:
        return result | {"status": "error", "error": str(exc)}
    return result | {"status": "ok", "price": executed["price"]}


async def run_watchlist_change(change: WatchlistChange) -> dict:
    """Apply one watchlist change and report its outcome."""
    result = {"ticker": change.ticker.upper(), "action": change.action}
    apply = service.add_to_watchlist if change.action == "add" else service.remove_from_watchlist
    try:
        await apply(change.ticker)
    except service.WatchlistError as exc:
        return result | {"status": "error", "error": str(exc)}
    return result | {"status": "ok"}


async def execute_actions(response: LLMResponse) -> dict:
    """Run watchlist changes, then trades, collecting per-action results."""
    watchlist_changes = [await run_watchlist_change(c) for c in response.watchlist_changes]
    trades = [await run_trade(t) for t in response.trades]
    return {"trades": trades, "watchlist_changes": watchlist_changes}
