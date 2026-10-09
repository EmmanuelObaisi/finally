import { beforeEach, describe, expect, it } from "vitest";
import type { WatchlistItem } from "./types";
import { initialWatchlistState, resetWatchlistStore, useWatchlistStore } from "./watchlistStore";

const items: WatchlistItem[] = [
  {
    ticker: "AAPL",
    price: 190,
    previous_price: 190,
    timestamp: 1,
    change: 0,
    change_percent: 0,
    direction: "flat",
    session_start_price: 190,
  },
];

beforeEach(() => resetWatchlistStore());

describe("watchlist store", () => {
  it("starts with nothing pushed", () => {
    expect(useWatchlistStore.getState().pushed).toBeNull();
    expect(useWatchlistStore.getState().seq).toBe(0);
    expect(initialWatchlistState()).toEqual({ pushed: null, seq: 0 });
  });

  it("counts every publish, even of the same list", () => {
    useWatchlistStore.getState().publish(items);
    useWatchlistStore.getState().publish(items);
    expect(useWatchlistStore.getState().seq).toBe(2);
    expect(useWatchlistStore.getState().pushed).toBe(items);
  });

  it("reset restores the initial state", () => {
    useWatchlistStore.getState().publish(items);
    resetWatchlistStore();
    expect(useWatchlistStore.getState().pushed).toBeNull();
    expect(useWatchlistStore.getState().seq).toBe(0);
  });
});
