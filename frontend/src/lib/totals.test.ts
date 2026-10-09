import { describe, expect, it } from "vitest";
import { liveTotals } from "./totals";
import type { Portfolio, PriceFrame, PriceUpdate } from "./types";

function portfolio(positions: Portfolio["positions"] = []): Portfolio {
  return { cash: 1000, total_value: 1000, unrealized_pnl: 0, positions };
}

const aapl = {
  ticker: "AAPL",
  quantity: 1.5,
  avg_cost: 180,
  current_price: 180,
  market_value: 270,
  unrealized_pnl: 0,
  pnl_percent: 0,
};

function frame(price: number): PriceFrame {
  const update: PriceUpdate = {
    ticker: "AAPL",
    price,
    previous_price: price,
    timestamp: 1,
    change: 0,
    change_percent: 0,
    direction: "flat",
    session_start_price: price,
  };
  return { AAPL: update };
}

describe("liveTotals", () => {
  it("with no positions the total equals cash", () => {
    expect(liveTotals(portfolio(), {})).toEqual({ cash: 1000, total: 1000 });
  });

  it("values a position at its live price", () => {
    expect(liveTotals(portfolio([aapl]), frame(190))).toEqual({ cash: 1000, total: 1285 });
  });

  it("falls back to the server's current price, not average cost, when there is no live price", () => {
    const gained = { ...aapl, avg_cost: 100, current_price: 180 };
    expect(liveTotals(portfolio([gained]), {})).toEqual({ cash: 1000, total: 1270 });
  });
});
