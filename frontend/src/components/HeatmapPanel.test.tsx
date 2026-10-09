import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tile } from "../lib/heatmap";
import { resetPortfolioStore, usePortfolioStore } from "../lib/portfolioStore";
import { applyFrame, initialMarketState, useMarketStore } from "../lib/store";
import type { Position, PriceFrame } from "../lib/types";
import { FakeResizeObserver } from "../test/fakeResizeObserver";
import HeatmapPanel from "./HeatmapPanel";
import HeatmapTile from "./HeatmapTile";

function tile(over: Partial<Tile> = {}): Tile {
  return {
    ticker: "AAPL",
    value: 1901.2,
    pnl: 12.4,
    pnlPercent: 0.66,
    cost: 1888.8,
    left: 10,
    top: 20,
    width: 120,
    height: 60,
    weight: "62.5",
    dir: "up",
    fill: "rgb(63 185 80 / 0.2)",
    ...over,
  };
}

function position(ticker: string, quantity: number, price: number, cost: number): Position {
  const marketValue = quantity * price;
  return {
    ticker,
    quantity,
    avg_cost: cost / quantity,
    current_price: price,
    market_value: marketValue,
    unrealized_pnl: marketValue - cost,
    pnl_percent: 0,
  };
}

function frame(ticker: string, price: number): PriceFrame {
  return {
    [ticker]: {
      ticker,
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

function show(positions: Position[]) {
  usePortfolioStore.setState({
    portfolio: { cash: 1000, total_value: 2000, unrealized_pnl: 0, positions },
    failed: false,
  });
}

function measure(width: number, height: number) {
  const box = screen.getByRole("list", { name: "Positions by weight and P&L" });
  act(() => FakeResizeObserver.trigger(box, width, height));
  return box;
}

beforeEach(() => {
  resetPortfolioStore();
  useMarketStore.setState(initialMarketState());
});

describe("HeatmapTile", () => {
  it("shows the ticker and the P&L % when it has room", () => {
    render(<HeatmapTile tile={tile()} />);
    const el = screen.getByTestId("heatmap-tile-AAPL");
    expect(within(el).getByText("AAPL")).toBeInTheDocument();
    expect(within(el).getByText("+0.66%")).toBeInTheDocument();
  });

  it("shows only the ticker on a short tile", () => {
    render(<HeatmapTile tile={tile({ width: 48, height: 30 })} />);
    const el = screen.getByTestId("heatmap-tile-AAPL");
    expect(within(el).getByText("AAPL")).toBeInTheDocument();
    expect(el).not.toHaveTextContent("+0.66%");
  });

  it("shows no text on a narrow tile but still carries the label", () => {
    render(<HeatmapTile tile={tile({ width: 40, height: 60 })} />);
    const el = screen.getByTestId("heatmap-tile-AAPL");
    expect(el).toHaveTextContent("");
    expect(el).toHaveAttribute("aria-label", expect.stringContaining("AAPL"));
  });

  it("carries the accessible sentence, data attributes, geometry and classes", () => {
    render(<HeatmapTile tile={tile()} />);
    const el = screen.getByTestId("heatmap-tile-AAPL");
    const sentence = "AAPL: $1,901.20, 62.5% of positions, P&L +12.40 (+0.66%)";
    expect(el).toHaveAttribute("title", sentence);
    expect(el).toHaveAttribute("aria-label", sentence);
    expect(el).toHaveAttribute("data-pnl", "up");
    expect(el).toHaveAttribute("data-weight", "62.5");
    expect(el).toHaveStyle({ left: "10px", top: "20px", width: "120px", height: "60px" });
    for (const cls of ["border", "border-panel", "overflow-hidden", "p-2", "text-fg", "motion-reduce:transition-none"]) {
      expect(el).toHaveClass(cls);
    }
  });
});

describe("HeatmapPanel tiles", () => {
  it("draws no tiles until the box is measured, then one per position", () => {
    show([position("AAPL", 10, 100, 900), position("MSFT", 5, 100, 500)]);
    render(<HeatmapPanel />);
    expect(screen.queryByTestId("heatmap-tiles")).toBeNull();
    const box = measure(400, 200);
    expect(screen.getByTestId("heatmap-tiles")).toBe(box);
    expect(within(box).getAllByRole("listitem")).toHaveLength(2);
  });

  it("recolors a tile when a price frame drops the position below its cost", () => {
    show([position("AAPL", 10, 100, 900), position("MSFT", 5, 100, 500)]);
    render(<HeatmapPanel />);
    measure(400, 200);
    const aapl = screen.getByTestId("heatmap-tile-AAPL");
    expect(aapl).toHaveAttribute("data-pnl", "up");
    const before = aapl.getAttribute("style");
    act(() => useMarketStore.setState((s) => applyFrame(s, frame("AAPL", 80), 2)));
    expect(screen.getByTestId("heatmap-tile-AAPL")).toHaveAttribute("data-pnl", "down");
    expect(screen.getByTestId("heatmap-tile-AAPL").getAttribute("style")).not.toBe(before);
  });
});

describe("HeatmapPanel states", () => {
  it("shows the loading skeleton before the first portfolio", () => {
    render(<HeatmapPanel />);
    const loading = screen.getByTestId("heatmap-loading");
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(loading).toHaveAttribute("aria-label", "Loading heatmap");
    expect(screen.queryByTestId("heatmap-tiles")).toBeNull();
    expect(screen.queryByTestId("heatmap-error")).toBeNull();
  });

  it("shows the fixed error copy when the portfolio never loaded", () => {
    usePortfolioStore.setState({ portfolio: null, failed: true });
    render(<HeatmapPanel />);
    const error = screen.getByTestId("heatmap-error");
    expect(error).toHaveTextContent("Heatmap unavailable");
    expect(error).toHaveTextContent(
      "The server did not return your portfolio. Check that FinAlly is running, then retry.",
    );
    expect(screen.queryByTestId("heatmap-loading")).toBeNull();
  });

  it("retry shows loading while the fetch is pending, then the tiles on success", async () => {
    let finish: (p: unknown) => void = () => {};
    const fetchMock = vi.fn(
      (_url: string) => new Promise((resolve) => (finish = (p) => resolve({ ok: true, status: 200, json: async () => p }))),
    );
    vi.stubGlobal("fetch", fetchMock);
    usePortfolioStore.setState({ portfolio: null, failed: true });
    render(<HeatmapPanel />);
    fireEvent.click(screen.getByTestId("heatmap-retry"));
    expect(fetchMock).toHaveBeenCalledWith("/api/portfolio");
    expect(screen.getByTestId("heatmap-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("heatmap-error")).toBeNull();

    measure(400, 200);
    await act(async () => {
      finish({ cash: 1, total_value: 2, unrealized_pnl: 0, positions: [position("AAPL", 1, 100, 90)] });
    });
    expect(screen.getByTestId("heatmap-tile-AAPL")).toBeInTheDocument();
    expect(screen.queryByTestId("heatmap-loading")).toBeNull();
  });

  it("a retry that fails again shows the error and Retry again", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("down"))));
    usePortfolioStore.setState({ portfolio: null, failed: true });
    render(<HeatmapPanel />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("heatmap-retry"));
    });
    expect(screen.getByTestId("heatmap-error")).toBeInTheDocument();
    expect(screen.getByTestId("heatmap-retry")).toBeInTheDocument();
  });

  it("shows the empty copy with no positions", () => {
    show([]);
    render(<HeatmapPanel />);
    const empty = screen.getByTestId("heatmap-empty");
    expect(empty).toHaveTextContent("No positions to map");
    expect(empty).toHaveTextContent("Buy shares with the trade bar to see your portfolio by weight and P&L.");
  });

  it("shows the empty state when the only position is worth 0 at the live price", () => {
    show([position("AAPL", 1, 100, 90)]);
    useMarketStore.setState((s) => applyFrame(s, frame("AAPL", 0), 1));
    render(<HeatmapPanel />);
    measure(400, 200);
    expect(screen.getByTestId("heatmap-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("heatmap-tiles")).toBeNull();
  });

  it("lets one position fill the whole measured box and shows no overlay", () => {
    show([position("AAPL", 2, 100, 150)]);
    render(<HeatmapPanel />);
    measure(400, 200);
    expect(screen.getByTestId("heatmap-tile-AAPL")).toHaveStyle({ left: "0px", top: "0px", width: "400px", height: "200px" });
    expect(screen.queryByTestId("heatmap-empty")).toBeNull();
    expect(screen.queryByTestId("heatmap-loading")).toBeNull();
  });
});
