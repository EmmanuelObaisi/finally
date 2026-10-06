import { describe, expect, it } from "vitest";
import type { PriceUpdate } from "@/lib/types";
import { appendHistory } from "./usePriceStream";

const tick = (price: number, timestamp: number): PriceUpdate => ({
  ticker: "AAPL",
  price,
  previous_price: price,
  timestamp,
  change: 0,
  direction: "flat",
  day_change_percent: 0,
});

describe("appendHistory", () => {
  it("appends one point per second and replaces within the same second", () => {
    let h = appendHistory({}, { AAPL: tick(100, 10.2) });
    h = appendHistory(h, { AAPL: tick(101, 10.7) });
    h = appendHistory(h, { AAPL: tick(102, 11.1) });
    expect(h.AAPL).toEqual([
      { time: 10, value: 101 },
      { time: 11, value: 102 },
    ]);
  });

  it("starts history for new tickers", () => {
    const h = appendHistory({}, { PYPL: { ...tick(60, 5), ticker: "PYPL" } });
    expect(h.PYPL).toEqual([{ time: 5, value: 60 }]);
  });
});
