import type { Position } from "./types";

/**
 * Live numbers for one position. The cost basis comes from the server's own
 * rounded values so the result stays within a cent of the server.
 */
export function livePosition(p: Position, price: number): { price: number; value: number; pnl: number; pnlPercent: number } {
  const cost = p.market_value - p.unrealized_pnl;
  const value = p.quantity * price;
  const pnl = value - cost;
  return { price, value, pnl, pnlPercent: cost > 0 ? (pnl / cost) * 100 : 0 };
}
