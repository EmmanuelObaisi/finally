/** Portfolio math: re-price positions with live SSE prices. */
import type { Portfolio, PriceMap } from "./types";

export function livePortfolio(portfolio: Portfolio, prices: PriceMap): Portfolio {
  const positions = portfolio.positions.map((p) => {
    const current = prices[p.ticker]?.price ?? p.current_price;
    const marketValue = p.quantity * current;
    const cost = p.quantity * p.avg_cost;
    const pnl = marketValue - cost;
    return {
      ...p,
      current_price: current,
      market_value: marketValue,
      unrealized_pnl: pnl,
      pnl_percent: cost ? (pnl / cost) * 100 : 0,
    };
  });
  const positionsValue = positions.reduce((sum, p) => sum + p.market_value, 0);
  const unrealized = positions.reduce((sum, p) => sum + p.unrealized_pnl, 0);
  return {
    cash_balance: portfolio.cash_balance,
    positions,
    positions_value: positionsValue,
    unrealized_pnl: unrealized,
    total_value: portfolio.cash_balance + positionsValue,
  };
}
