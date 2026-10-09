import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fmtClock, fmtDateTime, fmtDay } from "../lib/format";
import { resetHistoryStore, useHistoryStore } from "../lib/historyStore";
import { resetPortfolioStore, usePortfolioStore } from "../lib/portfolioStore";
import { initialMarketState, useMarketStore } from "../lib/store";
import type { HistoryPoint, Portfolio } from "../lib/types";

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

import { AreaSeries, TickMarkType } from "lightweight-charts";
import PnlChartPanel from "./PnlChartPanel";

const T0 = Math.floor(Date.parse("2026-10-09T10:00:00Z") / 1000);
const T1 = T0 + 60;
const iso = (s: number) => new Date(s * 1000).toISOString();
const snap = (s: number, value: number): HistoryPoint => ({ total_value: value, recorded_at: iso(s) });

/** Cash only (total = cash) or one AAPL share, so total = cash + 112.40. */
function portfolio(cash: number, held = false): Portfolio {
  const positions = held
    ? [{ ticker: "AAPL", quantity: 1, avg_cost: 100, current_price: 112.4, market_value: 112.4, unrealized_pnl: 12.4, pnl_percent: 12.4 }]
    : [];
  return { cash, total_value: cash, unrealized_pnl: 0, positions };
}

/** A history fetch settled by hand, in the order the calls were made. */
function historyFetch() {
  const calls: { resolve: (h: HistoryPoint[]) => void; reject: () => void }[] = [];
  const fetchFn = vi.fn(
    () =>
      new Promise((resolve, reject) => {
        calls.push({
          resolve: (history) => resolve({ ok: true, status: 200, json: async () => ({ history }) }),
          reject: () => reject(new Error("down")),
        });
      }),
  );
  vi.stubGlobal("fetch", fetchFn);
  return { calls, fetchFn };
}

const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const setPortfolio = (p: Portfolio | null) => act(() => usePortfolioStore.setState({ portfolio: p }));
const setStatus = (status: "connected" | "reconnecting" | "disconnected") =>
  act(() => useMarketStore.setState({ status }));

/** Render with the first fetch already answered by `history`. */
async function mountWith(history: HistoryPoint[], p: Portfolio | null = null) {
  const fetched = historyFetch();
  if (p) usePortfolioStore.setState({ portfolio: p });
  render(<PnlChartPanel />);
  fetched.calls[0].resolve(history);
  await settle();
  return fetched;
}

beforeEach(() => {
  vi.restoreAllMocks();
  for (const fn of Object.values(lwc)) fn.mockClear();
  useMarketStore.setState(initialMarketState());
  resetPortfolioStore();
  resetHistoryStore();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("PnlChartPanel states", () => {
  it("shows the loading skeleton while the first fetch is pending", () => {
    historyFetch();
    render(<PnlChartPanel />);
    const loading = screen.getByTestId("pnl-loading");
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(loading).toHaveAttribute("aria-label", "Loading portfolio value");
    expect(screen.queryByTestId("pnl-chart")).not.toBeInTheDocument();
  });

  it("shows the error with Retry, which reloads and fails again", async () => {
    const { calls, fetchFn } = historyFetch();
    render(<PnlChartPanel />);
    calls[0].reject();
    await settle();
    const error = screen.getByTestId("pnl-error");
    expect(error).toHaveTextContent("Portfolio value unavailable");
    expect(error).toHaveTextContent(
      "The server did not return your portfolio history. Check that FinAlly is running, then retry.",
    );
    fireEvent.click(screen.getByTestId("pnl-retry"));
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("pnl-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("pnl-error")).not.toBeInTheDocument();
    calls[1].reject();
    await settle();
    expect(screen.getByTestId("pnl-error")).toBeInTheDocument();
  });

  it("shows the empty overlay for one history point and no positions", async () => {
    await mountWith([snap(T0, 10000)], portfolio(10000));
    const empty = screen.getByTestId("pnl-empty");
    expect(empty).toHaveTextContent("No portfolio history yet");
    expect(empty).toHaveTextContent("Your portfolio value is charted after your first trade.");
    expect(screen.queryByTestId("pnl-chart")).not.toBeInTheDocument();
  });

  it("keeps the chart for closed-out history of two points and no positions", async () => {
    await mountWith([snap(T0, 10000), snap(T1, 10000)], portfolio(10000));
    expect(screen.getByTestId("pnl-chart")).toBeInTheDocument();
    expect(screen.queryByTestId("pnl-empty")).not.toBeInTheDocument();
  });

  it("shows the empty overlay for empty history and no portfolio", async () => {
    await mountWith([]);
    expect(screen.getByTestId("pnl-empty")).toBeInTheDocument();
  });

  it("keeps the stale chart and shows no error when a refetch fails", async () => {
    const { calls } = await mountWith([snap(T0, 10000), snap(T1, 10000)], portfolio(10000));
    act(() => useHistoryStore.getState().load());
    calls[1].reject();
    await settle();
    expect(screen.getByTestId("pnl-chart")).toBeInTheDocument();
    expect(screen.queryByTestId("pnl-error")).not.toBeInTheDocument();
  });
});

describe("PnlChartPanel chart", () => {
  it("plots history plus one live point equal to the header total, then fits", async () => {
    vi.spyOn(Date, "now").mockReturnValue((T1 + 5) * 1000);
    await mountWith([snap(T0, 10000), snap(T1, 10000)], portfolio(9900, true));
    const last = lwc.setData.mock.calls.at(-1)![0] as { time: number; value: number }[];
    expect(last).toHaveLength(3);
    expect(last[2].time).toBe(T1 + 5);
    expect(last[2].value).toBeCloseTo(10012.4, 6);
    const chart = screen.getByTestId("pnl-chart");
    expect(chart).toHaveAttribute("data-points", "3");
    expect(chart).toHaveAttribute("aria-label", "Portfolio value over time, now $10,012.40");
    expect(lwc.fitContent).toHaveBeenCalled();
    expect(lwc.fitContent.mock.invocationCallOrder.at(-1)!).toBeGreaterThan(
      lwc.setData.mock.invocationCallOrder.at(-1)!,
    );
  });

  it("adds an area series with the primary line and gradient", () => {
    historyFetch();
    render(<PnlChartPanel />);
    expect(lwc.addSeries).toHaveBeenCalledTimes(1);
    const [definition, options] = lwc.addSeries.mock.calls[0];
    expect(definition).toBe(AreaSeries);
    expect(options).toMatchObject({
      lineColor: "#209dd7",
      topColor: "rgb(32 157 215 / 0.28)",
      bottomColor: "rgb(32 157 215 / 0)",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
  });

  it("creates a fixed chart without the logo and formats ticks and the crosshair label", () => {
    historyFetch();
    render(<PnlChartPanel />);
    const options = lwc.createChart.mock.calls[0][1] as {
      layout: { attributionLogo: boolean };
      handleScroll: boolean;
      handleScale: boolean;
      timeScale: { secondsVisible: boolean; tickMarkFormatter: (t: unknown, type: TickMarkType) => string | null };
      localization: { timeFormatter: (t: number) => string };
    };
    expect(options.layout.attributionLogo).toBe(false);
    expect(options.handleScroll).toBe(false);
    expect(options.handleScale).toBe(false);
    expect(options.timeScale.secondsVisible).toBe(false);
    expect(options.timeScale.tickMarkFormatter(T0, TickMarkType.DayOfMonth)).toBe(fmtDay(T0));
    expect(options.timeScale.tickMarkFormatter(T0, TickMarkType.Time)).toBe(fmtClock(T0).slice(0, 5));
    expect(options.timeScale.tickMarkFormatter("2026-10-09", TickMarkType.Time)).toBeNull();
    expect(options.localization.timeFormatter(T0)).toBe(fmtDateTime(T0));
  });
});

describe("PnlChartPanel refetch cadence", () => {
  it("fetches on mount, every 30 s unless one is in flight, on a portfolio change, and not after unmount", async () => {
    vi.useFakeTimers();
    const { calls, fetchFn } = historyFetch();
    const { unmount } = render(<PnlChartPanel />);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    calls[0].resolve([]);
    await act(() => vi.advanceTimersByTimeAsync(0));

    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(fetchFn).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(fetchFn).toHaveBeenCalledTimes(2);

    calls[1].resolve([]);
    await act(() => vi.advanceTimersByTimeAsync(0));
    act(() => usePortfolioStore.getState().applyTrade(portfolio(9000)));
    expect(fetchFn).toHaveBeenCalledTimes(3);

    unmount();
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
});

describe("PnlChartPanel title bar", () => {
  async function bar(cash: number | null) {
    await mountWith([snap(T0, 10000), snap(T1, 10000)], cash === null ? null : portfolio(cash));
    return { value: screen.getByTestId("pnl-value"), delta: screen.getByTestId("pnl-delta") };
  }

  it("shows a gain in text-up", async () => {
    const { value, delta } = await bar(10012.4);
    expect(value).toHaveTextContent("$10,012.40");
    expect(delta).toHaveTextContent("+12.40 (+0.12%)");
    expect(delta).toHaveClass("text-up");
  });

  it("shows exactly the start value neutral", async () => {
    const { delta } = await bar(10000);
    expect(delta).toHaveTextContent("0.00 (0.00%)");
    expect(delta).toHaveClass("text-fg");
  });

  it("shows a loss in text-down", async () => {
    const { delta } = await bar(9990);
    expect(delta).toHaveTextContent("-10.00 (-0.10%)");
    expect(delta).toHaveClass("text-down");
  });

  it("shows -- for both numbers without a portfolio", async () => {
    const { value, delta } = await bar(null);
    expect(value).toHaveTextContent("--");
    expect(delta).toHaveTextContent("--");
  });

  it("hides the since start label below 640px", async () => {
    await bar(10000);
    const label = screen.getByText("since start");
    expect(label).toHaveClass("hidden");
    expect(label).toHaveClass("sm:inline");
  });

  it("keeps a billion-dollar total on one line", async () => {
    const { value } = await bar(1_000_000_000);
    expect(value).toHaveTextContent("$1,000,000,000.00");
    expect(value).toHaveClass("whitespace-nowrap");
    expect(value).toHaveClass("tabular-nums");
  });

  it("dims both numbers while disconnected, not while reconnecting", async () => {
    const { value, delta } = await bar(10000);
    setStatus("reconnecting");
    expect(value).not.toHaveClass("opacity-60");
    expect(delta).not.toHaveClass("opacity-60");
    setStatus("disconnected");
    expect(value).toHaveClass("opacity-60");
    expect(delta).toHaveClass("opacity-60");
  });

  it("follows a portfolio change", async () => {
    const { value } = await bar(10000);
    await setPortfolio(portfolio(10100));
    expect(value).toHaveTextContent("$10,100.00");
  });
});
