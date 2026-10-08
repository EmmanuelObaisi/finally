import { beforeEach, describe, expect, it } from "vitest";
import { applyFrame, initialMarketState, SPARK_CAP, useMarketStore, type MarketState } from "./store";
import type { PriceFrame, PriceUpdate } from "./types";

const apply = (state: MarketState, frame: PriceFrame, nowSeconds = 100) => applyFrame(state, frame, nowSeconds);

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

function move(ticker: string, timestamp: number, direction: PriceUpdate["direction"]): PriceFrame {
  return { [ticker]: { ...tick(ticker, 190), timestamp, direction } };
}

beforeEach(() => {
  useMarketStore.setState(initialMarketState());
});

describe("initialMarketState", () => {
  it("starts with no prices and reconnecting", () => {
    expect(initialMarketState()).toEqual({ prices: {}, status: "reconnecting", flash: {}, spark: {} });
  });
});

describe("applyFrame", () => {
  it("replaces the map so a ticker missing from the next frame disappears", () => {
    const first: PriceFrame = { AAPL: tick("AAPL", 190), MSFT: tick("MSFT", 420) };
    const second: PriceFrame = { AAPL: tick("AAPL", 191) };
    const after = apply(apply(initialMarketState(), first), second);
    expect(Object.keys(after.prices)).toEqual(["AAPL"]);
  });

  it("applying the same frame twice leaves prices equal to that frame", () => {
    const frame: PriceFrame = { AAPL: tick("AAPL", 190), MSFT: tick("MSFT", 420) };
    const once = apply(initialMarketState(), frame);
    expect(apply(once, frame).prices).toEqual(frame);
  });

  it("an empty frame leaves no prices", () => {
    const seeded = apply(initialMarketState(), { AAPL: tick("AAPL", 190) });
    expect(apply(seeded, {}).prices).toEqual({});
  });
});

describe("applyFrame flash", () => {
  const first = () => apply(initialMarketState(), move("AAPL", 1, "up"));

  it("the first value a ticker receives never flashes", () => {
    expect(first().flash).toEqual({});
  });

  it("a newer up frame then a newer down frame count up the sequence", () => {
    const up = apply(first(), move("AAPL", 2, "up"));
    expect(up.flash.AAPL).toEqual({ dir: "up", seq: 1 });
    expect(apply(up, move("AAPL", 3, "down")).flash.AAPL).toEqual({ dir: "down", seq: 2 });
  });

  it("a newer flat frame leaves the flash unchanged", () => {
    const up = apply(first(), move("AAPL", 2, "up"));
    expect(apply(up, move("AAPL", 3, "flat")).flash.AAPL).toEqual({ dir: "up", seq: 1 });
  });

  it("a re-sent update with the same timestamp does not flash again", () => {
    const up = apply(first(), move("AAPL", 2, "up"));
    expect(apply(up, move("AAPL", 2, "up")).flash.AAPL).toEqual({ dir: "up", seq: 1 });
  });

  it("two up frames in quick succession reach seq 2", () => {
    const twice = apply(apply(first(), move("AAPL", 1.2, "up")), move("AAPL", 1.7, "up"));
    expect(twice.flash.AAPL).toEqual({ dir: "up", seq: 2 });
  });
});

function priced(price: number): PriceFrame {
  return { AAPL: tick("AAPL", price) };
}

describe("applyFrame sparkline buffer", () => {
  it("floors arrival seconds: same-second frames keep one point with the later price", () => {
    const a = applyFrame(initialMarketState(), priced(1), 100.2);
    const b = applyFrame(a, priced(2), 100.9);
    expect(b.spark.AAPL).toEqual([{ time: 100, value: 2 }]);
  });

  it("appends a point for a later second", () => {
    const a = applyFrame(applyFrame(initialMarketState(), priced(1), 100.2), priced(2), 100.9);
    expect(applyFrame(a, priced(3), 101.1).spark.AAPL).toEqual([
      { time: 100, value: 2 },
      { time: 101, value: 3 },
    ]);
  });

  it("adds nothing for a frame at an earlier second than the last point", () => {
    const a = applyFrame(applyFrame(initialMarketState(), priced(1), 100.2), priced(3), 101.1);
    expect(applyFrame(a, priced(9), 99.5).spark.AAPL).toEqual(a.spark.AAPL);
  });

  it("holds exactly 300 points after 300 distinct seconds", () => {
    let state = initialMarketState();
    for (let i = 0; i < SPARK_CAP; i++) state = applyFrame(state, priced(i), 1000 + i);
    expect(state.spark.AAPL).toHaveLength(SPARK_CAP);
  });

  it("still holds 300 after 301 seconds, with the oldest dropped", () => {
    let state = initialMarketState();
    for (let i = 0; i < SPARK_CAP; i++) state = applyFrame(state, priced(i), 1000 + i);
    const firstTime = state.spark.AAPL[0].time;
    state = applyFrame(state, priced(999), 1000 + SPARK_CAP);
    expect(state.spark.AAPL).toHaveLength(SPARK_CAP);
    expect(state.spark.AAPL[0].time).toBe(firstTime + 1);
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
