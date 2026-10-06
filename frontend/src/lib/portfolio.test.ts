import { describe, expect, it } from "vitest";
import { livePortfolio } from "./portfolio";
import type { Portfolio, PriceMap } from "./types";

const base: Portfolio = {
  cash_balance: 1000,
  total_value: 2000,
  positions_value: 1000,
  unrealized_pnl: 0,
  positions: [
    { ticker: "AAPL", quantity: 10, avg_cost: 100, current_price: 100, market_value: 1000, unrealized_pnl: 0, pnl_percent: 0 },
  ],
};

const price = (ticker: string, p: number): PriceMap => ({
  [ticker]: { ticker, price: p, previous_price: p, timestamp: 1, change: 0, direction: "flat", day_change_percent: 0 },
});

describe("livePortfolio", () => {
  it("re-prices positions and totals with live prices", () => {
    const live = livePortfolio(base, price("AAPL", 110));
    expect(live.positions[0].market_value).toBe(1100);
    expect(live.positions[0].unrealized_pnl).toBe(100);
    expect(live.positions[0].pnl_percent).toBeCloseTo(10);
    expect(live.positions_value).toBe(1100);
    expect(live.total_value).toBe(2100);
    expect(live.unrealized_pnl).toBe(100);
  });

  it("reports a loss when the price drops", () => {
    const live = livePortfolio(base, price("AAPL", 90));
    expect(live.positions[0].unrealized_pnl).toBe(-100);
    expect(live.positions[0].pnl_percent).toBeCloseTo(-10);
  });

  it("falls back to the server price when no live price exists", () => {
    const live = livePortfolio(base, {});
    expect(live.total_value).toBe(2000);
  });

  it("is just cash with no positions", () => {
    const live = livePortfolio({ ...base, positions: [] }, {});
    expect(live.total_value).toBe(1000);
  });
});
