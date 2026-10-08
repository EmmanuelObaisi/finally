import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialMarketState, SPARK_CAP, useMarketStore } from "../lib/store";
import type { PriceFrame } from "../lib/types";

const lwc = vi.hoisted(() => {
  const setData = vi.fn();
  const update = vi.fn();
  const fitContent = vi.fn();
  const remove = vi.fn();
  const addSeries = vi.fn(() => ({ setData, update }));
  const createChart = vi.fn(() => ({ addSeries, timeScale: () => ({ fitContent }), remove }));
  return { setData, update, fitContent, remove, addSeries, createChart };
});

vi.mock("lightweight-charts", () => ({
  createChart: lwc.createChart,
  LineSeries: "LineSeries",
  CrosshairMode: { Hidden: 3 },
  ColorType: { Solid: "solid" },
}));

import Sparkline from "./Sparkline";

function frame(price: number): PriceFrame {
  return {
    AAPL: {
      ticker: "AAPL",
      price,
      previous_price: price,
      timestamp: 1,
      change: 0,
      change_percent: 0,
      direction: "flat",
      session_start_price: price,
    },
  };
}

function send(price: number, nowSeconds: number) {
  vi.spyOn(Date, "now").mockReturnValue(nowSeconds * 1000);
  act(() => useMarketStore.getState().receiveFrame(frame(price)));
}

beforeEach(() => {
  vi.restoreAllMocks();
  for (const fn of Object.values(lwc)) fn.mockClear();
  useMarketStore.setState(initialMarketState());
});

describe("Sparkline", () => {
  it("renders a 24px aria-hidden container", () => {
    render(<Sparkline ticker="AAPL" />);
    const box = screen.getByTestId("sparkline-AAPL");
    expect(box).toHaveClass("h-6");
    expect(box).toHaveAttribute("aria-hidden", "true");
  });

  it("creates one non-interactive chart without the attribution logo", () => {
    render(<Sparkline ticker="AAPL" />);
    expect(lwc.createChart).toHaveBeenCalledTimes(1);
    const options = (lwc.createChart.mock.calls[0] as unknown[])[1] as Record<string, any>;
    expect(options.autoSize).toBe(true);
    expect(options.layout.attributionLogo).toBe(false);
    expect(options.handleScroll).toBe(false);
    expect(options.handleScale).toBe(false);
    expect(options.crosshair.mode).toBe(3);
  });

  it("adds a thin blue LineSeries", () => {
    render(<Sparkline ticker="AAPL" />);
    expect(lwc.addSeries).toHaveBeenCalledWith(
      "LineSeries",
      expect.objectContaining({ color: "#209dd7", lineWidth: 1 }),
    );
  });

  it("seeds the series with the buffer present at mount", () => {
    send(10, 100.2);
    send(11, 101.4);
    render(<Sparkline ticker="AAPL" />);
    expect(lwc.setData).toHaveBeenCalledWith([
      { time: 100, value: 10 },
      { time: 101, value: 11 },
    ]);
  });

  it("re-seeds the series from the capped buffer and refits after a new frame", () => {
    render(<Sparkline ticker="AAPL" />);
    lwc.fitContent.mockClear();
    send(12, 102.5);
    expect(lwc.setData).toHaveBeenLastCalledWith([{ time: 102, value: 12 }]);
    expect(lwc.fitContent).toHaveBeenCalled();
  });

  it("never holds more points than the store cap", () => {
    render(<Sparkline ticker="AAPL" />);
    for (let i = 0; i < SPARK_CAP + 5; i++) send(10 + i, 100 + i);
    const last = lwc.setData.mock.calls.at(-1)![0] as unknown[];
    expect(last).toHaveLength(SPARK_CAP);
  });

  it("removes the chart on unmount", () => {
    const view = render(<Sparkline ticker="AAPL" />);
    view.unmount();
    expect(lwc.remove).toHaveBeenCalledTimes(1);
  });
});
