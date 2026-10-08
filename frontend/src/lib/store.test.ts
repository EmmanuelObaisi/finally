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

function move(ticker: string, timestamp: number, direction: PriceUpdate["direction"]): PriceFrame {
  return { [ticker]: { ...tick(ticker, 190), timestamp, direction } };
}

beforeEach(() => {
  useMarketStore.setState(initialMarketState());
});

describe("initialMarketState", () => {
  it("starts with no prices and reconnecting", () => {
    expect(initialMarketState()).toEqual({ prices: {}, status: "reconnecting", flash: {} });
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

describe("applyFrame flash", () => {
  const first = () => applyFrame(initialMarketState(), move("AAPL", 1, "up"));

  it("the first value a ticker receives never flashes", () => {
    expect(first().flash).toEqual({});
  });

  it("a newer up frame then a newer down frame count up the sequence", () => {
    const up = applyFrame(first(), move("AAPL", 2, "up"));
    expect(up.flash.AAPL).toEqual({ dir: "up", seq: 1 });
    expect(applyFrame(up, move("AAPL", 3, "down")).flash.AAPL).toEqual({ dir: "down", seq: 2 });
  });

  it("a newer flat frame leaves the flash unchanged", () => {
    const up = applyFrame(first(), move("AAPL", 2, "up"));
    expect(applyFrame(up, move("AAPL", 3, "flat")).flash.AAPL).toEqual({ dir: "up", seq: 1 });
  });

  it("a re-sent update with the same timestamp does not flash again", () => {
    const up = applyFrame(first(), move("AAPL", 2, "up"));
    expect(applyFrame(up, move("AAPL", 2, "up")).flash.AAPL).toEqual({ dir: "up", seq: 1 });
  });

  it("two up frames in quick succession reach seq 2", () => {
    const twice = applyFrame(applyFrame(first(), move("AAPL", 1.2, "up")), move("AAPL", 1.7, "up"));
    expect(twice.flash.AAPL).toEqual({ dir: "up", seq: 2 });
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
