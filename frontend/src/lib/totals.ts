import type { Portfolio, PriceFrame } from "./types";

/** Cash and total value; each position uses its live price, else its average cost. */
export function liveTotals(portfolio: Portfolio, prices: PriceFrame): { cash: number; total: number } {
  const held = portfolio.positions.reduce(
    (sum, p) => sum + p.quantity * (prices[p.ticker]?.price ?? p.avg_cost),
    0,
  );
  return { cash: portfolio.cash, total: portfolio.cash + held };
}
