import { describe, expect, it } from "vitest";
import { livePosition } from "./positions";
import type { Position } from "./types";

const aapl: Position = {
  ticker: "AAPL",
  quantity: 1.5,
  avg_cost: 180,
  current_price: 190,
  market_value: 285,
  unrealized_pnl: 15,
  pnl_percent: 5.5556,
};

describe("livePosition", () => {
  it("reproduces the server numbers at the server's own price", () => {
    const live = livePosition(aapl, 190);
    expect(Math.abs(live.pnl - 15)).toBeLessThan(0.01);
    expect(Math.abs(live.pnlPercent - 5.5556)).toBeLessThan(0.01);
  });

  it("revalues at a new price against the same cost basis", () => {
    const live = livePosition(aapl, 200);
    expect(live.value).toBe(300);
    expect(live.pnl).toBe(30);
    expect(live.pnlPercent).toBeCloseTo(11.11, 2);
  });

  it("gives a finite zero percent when the cost basis rounds to zero", () => {
    const micro = { ...aapl, quantity: 0.000001, market_value: 0, unrealized_pnl: 0 };
    expect(livePosition(micro, 190).pnlPercent).toBe(0);
  });
});
