import type { Portfolio, PriceFrame } from "./types";

/** Cash and total value; each position uses its live price, else the server's current price. */
export function liveTotals(portfolio: Portfolio, prices: PriceFrame): { cash: number; total: number } {
  const held = portfolio.positions.reduce(
    (sum, p) => sum + p.quantity * (prices[p.ticker]?.price ?? p.current_price),
    0,
  );
  return { cash: portfolio.cash, total: portfolio.cash + held };
}
