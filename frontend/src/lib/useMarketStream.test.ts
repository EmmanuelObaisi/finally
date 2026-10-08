import { renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeEventSource } from "../test/fakeEventSource";
import { initialMarketState, useMarketStore } from "./store";
import type { PriceFrame } from "./types";
import { BACKOFF_MS, RED_AFTER_MS, useMarketStream } from "./useMarketStream";

const frame: PriceFrame = {
  AAPL: {
    ticker: "AAPL",
    price: 190,
    previous_price: 189,
    timestamp: 1,
    change: 1,
    change_percent: 0.53,
    direction: "up",
    session_start_price: 189,
  },
};

beforeEach(() => {
  useMarketStore.setState(initialMarketState());
});

describe("useMarketStream", () => {
  it("opens exactly one EventSource on the price stream", () => {
    renderHook(() => useMarketStream());
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe("/api/stream/prices");
  });

  it("open marks the store connected", () => {
    renderHook(() => useMarketStream());
    FakeEventSource.instances[0].open();
    expect(useMarketStore.getState().status).toBe("connected");
  });

  it("a message puts the frame in the store", () => {
    renderHook(() => useMarketStream());
    FakeEventSource.instances[0].emit(frame);
    expect(useMarketStore.getState().prices).toEqual(frame);
  });

  it("an error while connecting is reconnecting, while closed is disconnected", () => {
    renderHook(() => useMarketStream());
    const es = FakeEventSource.instances[0];
    es.fail(0);
    expect(useMarketStore.getState().status).toBe("reconnecting");
    es.fail(2);
    expect(useMarketStore.getState().status).toBe("disconnected");
  });

  it("an empty frame keeps the stream open and clears prices", () => {
    renderHook(() => useMarketStream());
    const es = FakeEventSource.instances[0];
    es.emit(frame);
    es.emit({});
    expect(useMarketStore.getState().prices).toEqual({});
    expect(es.readyState).not.toBe(FakeEventSource.CLOSED);
  });

  it("unmount closes the stream", () => {
    const { unmount } = renderHook(() => useMarketStream());
    unmount();
    expect(FakeEventSource.instances[0].readyState).toBe(FakeEventSource.CLOSED);
  });

  it("under StrictMode exactly one stream stays open", () => {
    renderHook(() => useMarketStream(), { wrapper: StrictMode });
    const open = FakeEventSource.instances.filter((es) => es.readyState !== FakeEventSource.CLOSED);
    expect(open).toHaveLength(1);
  });
});

describe("connection state machine", () => {
  const status = () => useMarketStore.getState().status;
  const instances = () => FakeEventSource.instances;
  const last = () => instances()[instances().length - 1];
  const notClosed = () => instances().filter((es) => es.readyState !== FakeEventSource.CLOSED);

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exports the thresholds from the UI-SPEC", () => {
    expect(RED_AFTER_MS).toBe(5000);
    expect(BACKOFF_MS).toEqual([1000, 2000, 4000, 10000]);
  });

  it("stays reconnecting until 5000 ms without an open, then turns disconnected", () => {
    renderHook(() => useMarketStream());
    expect(status()).toBe("reconnecting");
    vi.advanceTimersByTime(4999);
    expect(status()).toBe("reconnecting");
    vi.advanceTimersByTime(1);
    expect(status()).toBe("disconnected");
  });

  it("an open before 5000 ms cancels the red timer", () => {
    renderHook(() => useMarketStream());
    vi.advanceTimersByTime(3000);
    last().open();
    vi.advanceTimersByTime(10_000);
    expect(status()).toBe("connected");
  });

  it("repeated errors while connecting do not restart the timer or flicker back to yellow", () => {
    renderHook(() => useMarketStream());
    const es = last();
    es.open();
    es.fail(0);
    expect(status()).toBe("reconnecting");
    vi.advanceTimersByTime(1000);
    es.fail(0);
    vi.advanceTimersByTime(1000);
    es.fail(0);
    vi.advanceTimersByTime(2999);
    expect(status()).toBe("reconnecting");
    vi.advanceTimersByTime(1);
    expect(status()).toBe("disconnected");
    es.fail(0);
    expect(status()).toBe("disconnected");
    es.open();
    expect(status()).toBe("connected");
  });

  it("a closed error is disconnected at once and closes that source", () => {
    renderHook(() => useMarketStream());
    const es = last();
    es.fail(FakeEventSource.CLOSED);
    expect(status()).toBe("disconnected");
    expect(es.readyState).toBe(FakeEventSource.CLOSED);
  });

  it("recreates the source after 1, 2, 4, 10 and 10 s with at most one open", () => {
    renderHook(() => useMarketStream());
    last().fail(FakeEventSource.CLOSED);
    vi.advanceTimersByTime(999);
    expect(instances()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(instances()).toHaveLength(2);

    for (const [i, delay] of [2000, 4000, 10_000, 10_000].entries()) {
      last().fail(FakeEventSource.CLOSED);
      vi.advanceTimersByTime(delay - 1);
      expect(instances()).toHaveLength(i + 2);
      vi.advanceTimersByTime(1);
      expect(instances()).toHaveLength(i + 3);
      expect(notClosed().length).toBeLessThanOrEqual(1);
    }
  });

  it("an open resets the backoff to 1 s", () => {
    renderHook(() => useMarketStream());
    last().fail(FakeEventSource.CLOSED);
    vi.advanceTimersByTime(1000);
    last().fail(FakeEventSource.CLOSED);
    vi.advanceTimersByTime(2000);
    last().open();
    expect(status()).toBe("connected");
    const before = instances().length;
    last().fail(FakeEventSource.CLOSED);
    vi.advanceTimersByTime(999);
    expect(instances()).toHaveLength(before);
    vi.advanceTimersByTime(1);
    expect(instances()).toHaveLength(before + 1);
  });

  it("unmount closes the current source and stops reconnecting", () => {
    const { unmount } = renderHook(() => useMarketStream());
    last().fail(FakeEventSource.CLOSED);
    vi.advanceTimersByTime(1000);
    expect(notClosed()).toHaveLength(1);
    unmount();
    expect(notClosed()).toHaveLength(0);
    const count = instances().length;
    vi.advanceTimersByTime(20_000);
    expect(instances()).toHaveLength(count);
  });
});
