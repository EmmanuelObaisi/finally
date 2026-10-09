import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fmtClock } from "../lib/format";
import { resetSelectionStore, useSelectionStore } from "../lib/selectionStore";
import { initialMarketState, SPARK_CAP, useMarketStore, type SparkPoint } from "../lib/store";
import type { PriceFrame } from "../lib/types";

const lwc = vi.hoisted(() => {
  const setData = vi.fn();
  const fitContent = vi.fn();
  const remove = vi.fn();
  const addSeries = vi.fn((..._args: unknown[]) => ({ setData }));
  const createChart = vi.fn((..._args: unknown[]) => ({ addSeries, timeScale: () => ({ fitContent }), remove }));
  return { setData, fitContent, remove, addSeries, createChart };
});

// Partial mock: real enums and series definitions, fake chart (the canvas needs a real browser).
vi.mock("lightweight-charts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("lightweight-charts")>()),
  createChart: lwc.createChart,
}));

import { LineSeries } from "lightweight-charts";
import MainChartPanel from "./MainChartPanel";

function points(n: number, base = 100): SparkPoint[] {
  return Array.from({ length: n }, (_, i) => ({ time: 1000 + i, value: base + i }));
}

function price(ticker: string, value: number, changePercent = 0.63): PriceFrame[string] {
  return {
    ticker,
    price: value,
    previous_price: value,
    timestamp: 1,
    change: 0,
    change_percent: changePercent,
    direction: "flat",
    session_start_price: value,
  };
}

function selectReady(selected: string | null) {
  act(() => useSelectionStore.setState({ status: "ready", selected }));
}

function setMarket(patch: Partial<ReturnType<typeof initialMarketState>>) {
  act(() => useMarketStore.setState(patch));
}

beforeEach(() => {
  vi.restoreAllMocks();
  for (const fn of Object.values(lwc)) fn.mockClear();
  useMarketStore.setState(initialMarketState());
  resetSelectionStore();
});

describe("MainChartPanel states", () => {
  it("shows a pulsing skeleton while the watchlist loads", () => {
    render(<MainChartPanel />);
    const loading = screen.getByTestId("main-chart-loading");
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(loading).toHaveAttribute("aria-label", "Loading chart");
    expect(loading).toHaveTextContent("");
    expect(screen.queryByTestId("main-chart")).not.toBeInTheDocument();
  });

  it("shows the fixed error copy with no Retry button", () => {
    render(<MainChartPanel />);
    act(() => useSelectionStore.setState({ status: "error" }));
    const error = screen.getByTestId("main-chart-error");
    expect(error).toHaveTextContent("Chart unavailable");
    expect(error).toHaveTextContent(
      "The watchlist did not load, so there is no ticker to chart. Use Retry in the watchlist panel.",
    );
    expect(error.querySelector("button")).toBeNull();
    expect(screen.queryByTestId("main-chart-loading")).not.toBeInTheDocument();
  });

  it("shows the empty overlay and -- values for an empty watchlist", () => {
    render(<MainChartPanel />);
    selectReady(null);
    const empty = screen.getByTestId("main-chart-empty");
    expect(empty).toHaveTextContent("No ticker selected");
    expect(empty).toHaveTextContent("Add a ticker to the watchlist to chart its price.");
    expect(screen.getByTestId("main-chart-title")).toHaveTextContent("Price chart");
    expect(screen.getByTestId("main-chart-price")).toHaveTextContent("--");
    expect(screen.getByTestId("main-chart-change")).toHaveTextContent("--");
  });

  it.each([0, 1])("shows the waiting overlay with %i buffered points", (n) => {
    render(<MainChartPanel />);
    setMarket({ spark: { AAPL: points(n) } });
    selectReady("AAPL");
    const waiting = screen.getByTestId("main-chart-waiting");
    expect(waiting).toHaveTextContent("Collecting prices for AAPL");
    expect(waiting).toHaveTextContent("The chart fills in as live prices stream.");
    expect(screen.queryByTestId("main-chart")).not.toBeInTheDocument();
  });

  it("reports the buffered point count while waiting", () => {
    const { container } = render(<MainChartPanel />);
    setMarket({ spark: { AAPL: points(1) } });
    selectReady("AAPL");
    expect(container.querySelector("[role=img]")).toHaveAttribute("data-points", "1");
  });

  it("renders the chart box with data attributes and an aria-label at two points", () => {
    render(<MainChartPanel />);
    setMarket({ spark: { AAPL: points(2) }, prices: { AAPL: price("AAPL", 190.12) } });
    selectReady("AAPL");
    const chart = screen.getByTestId("main-chart");
    expect(chart).toHaveAttribute("data-ticker", "AAPL");
    expect(chart).toHaveAttribute("data-points", "2");
    expect(chart).toHaveAttribute("role", "img");
    expect(chart).toHaveAttribute("aria-label", "AAPL price since page load, now $190.12");
    expect(screen.queryByTestId("main-chart-waiting")).not.toBeInTheDocument();
    expect(screen.queryByTestId("main-chart-loading")).not.toBeInTheDocument();
  });

  it("feeds the series from the buffer and fits after setData", () => {
    render(<MainChartPanel />);
    setMarket({ spark: { AAPL: points(3) } });
    selectReady("AAPL");
    expect(lwc.setData).toHaveBeenLastCalledWith([
      { time: 1000, value: 100 },
      { time: 1001, value: 101 },
      { time: 1002, value: 102 },
    ]);
    const fitOrder = lwc.fitContent.mock.invocationCallOrder.at(-1)!;
    expect(fitOrder).toBeGreaterThan(lwc.setData.mock.invocationCallOrder.at(-1)!);
  });

  it("never reports more points than the store cap", () => {
    render(<MainChartPanel />);
    setMarket({ spark: { AAPL: points(SPARK_CAP) } });
    selectReady("AAPL");
    expect(screen.getByTestId("main-chart")).toHaveAttribute("data-points", String(SPARK_CAP));
  });

  it("switches ticker without recreating the chart and removes it once on unmount", () => {
    const view = render(<MainChartPanel />);
    setMarket({ spark: { AAPL: points(2), MSFT: points(4, 400) } });
    selectReady("AAPL");
    act(() => useSelectionStore.getState().select("MSFT"));
    expect(lwc.setData).toHaveBeenLastCalledWith(points(4, 400));
    expect(screen.getByTestId("main-chart")).toHaveAttribute("data-ticker", "MSFT");
    expect(lwc.createChart).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(lwc.remove).toHaveBeenCalledTimes(1);
  });
});

describe("MainChartPanel chart configuration", () => {
  it("adds a 2px primary LineSeries with two-decimal price format", () => {
    render(<MainChartPanel />);
    expect(lwc.addSeries).toHaveBeenCalledWith(
      LineSeries,
      expect.objectContaining({
        color: "#209dd7",
        lineWidth: 2,
        priceLineVisible: true,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        priceFormat: { type: "price", precision: 2, minMove: 0.01 },
      }),
    );
  });

  it("is a fixed, auto-sized chart that keeps the TradingView logo and formats times as local clock", () => {
    render(<MainChartPanel />);
    const options = lwc.createChart.mock.calls[0][1] as Record<string, any>;
    expect(options.autoSize).toBe(true);
    expect(options.handleScroll).toBe(false);
    expect(options.handleScale).toBe(false);
    expect(options.layout.attributionLogo).not.toBe(false);
    expect(options.timeScale.secondsVisible).toBe(true);
    expect(options.timeScale.tickMarkFormatter(1000)).toBe(fmtClock(1000));
    expect(options.timeScale.tickMarkFormatter("2026-10-09")).toBeNull();
    expect(options.localization.timeFormatter(1000)).toBe(fmtClock(1000));
  });
});

describe("MainChartPanel title bar", () => {
  it("dims price and change while disconnected only", () => {
    render(<MainChartPanel />);
    setMarket({ prices: { AAPL: price("AAPL", 190.12, 0.63) } });
    selectReady("AAPL");
    const cells = [screen.getByTestId("main-chart-price"), screen.getByTestId("main-chart-change")];
    for (const cell of cells) expect(cell).not.toHaveClass("opacity-60");
    setMarket({ status: "reconnecting" });
    for (const cell of cells) expect(cell).not.toHaveClass("opacity-60");
    setMarket({ status: "disconnected" });
    for (const cell of cells) expect(cell).toHaveClass("opacity-60");
  });

  it("shows the live price and a toned change with its tooltip", () => {
    render(<MainChartPanel />);
    setMarket({ prices: { AAPL: price("AAPL", 190.12, 0.63) } });
    selectReady("AAPL");
    expect(screen.getByTestId("main-chart-price")).toHaveTextContent("$190.12");
    const change = screen.getByTestId("main-chart-change");
    expect(change).toHaveTextContent("+0.63%");
    expect(change).toHaveClass("text-up");
    expect(change).toHaveAttribute("title", "Change since session start");
  });

  it("truncates a 10-character ticker and keeps the full symbol in the title", () => {
    render(<MainChartPanel />);
    selectReady("ABCDEFGHIJ");
    const title = screen.getByTestId("main-chart-title");
    expect(title).toHaveClass("truncate");
    expect(title).toHaveAttribute("title", "ABCDEFGHIJ");
  });
});
