import { renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { FakeEventSource } from "../test/fakeEventSource";
import { initialMarketState, useMarketStore } from "./store";
import type { PriceFrame } from "./types";
import { useMarketStream } from "./useMarketStream";

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
