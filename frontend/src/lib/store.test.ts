import { beforeEach, describe, expect, it } from "vitest";
import { applyFrame, initialMarketState, useMarketStore } from "./store";
import type { PriceFrame, PriceUpdate } from "./types";

function tick(ticker: string, price: number): PriceUpdate {
  return {
    ticker,
    price,
    previous_price: price,
    timestamp: 1,
    change: 0,
    change_percent: 0,
    direction: "flat",
    session_start_price: price,
  };
}

beforeEach(() => {
  useMarketStore.setState(initialMarketState());
});

describe("initialMarketState", () => {
  it("starts with no prices and reconnecting", () => {
    expect(initialMarketState()).toEqual({ prices: {}, status: "reconnecting" });
  });
});

describe("applyFrame", () => {
  it("replaces the map so a ticker missing from the next frame disappears", () => {
    const first: PriceFrame = { AAPL: tick("AAPL", 190), MSFT: tick("MSFT", 420) };
    const second: PriceFrame = { AAPL: tick("AAPL", 191) };
    const after = applyFrame(applyFrame(initialMarketState(), first), second);
    expect(Object.keys(after.prices)).toEqual(["AAPL"]);
  });

  it("applying the same frame twice leaves prices equal to that frame", () => {
    const frame: PriceFrame = { AAPL: tick("AAPL", 190), MSFT: tick("MSFT", 420) };
    const once = applyFrame(initialMarketState(), frame);
    expect(applyFrame(once, frame).prices).toEqual(frame);
  });

  it("an empty frame leaves no prices", () => {
    const seeded = applyFrame(initialMarketState(), { AAPL: tick("AAPL", 190) });
    expect(applyFrame(seeded, {}).prices).toEqual({});
  });
});

describe("useMarketStore", () => {
  it("receiveFrame and setStatus update the shared state", () => {
    const frame: PriceFrame = { AAPL: tick("AAPL", 190) };
    useMarketStore.getState().receiveFrame(frame);
    useMarketStore.getState().setStatus("connected");
    expect(useMarketStore.getState().prices).toEqual(frame);
    expect(useMarketStore.getState().status).toBe("connected");
  });
});
