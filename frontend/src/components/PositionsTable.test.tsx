import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetPortfolioStore, usePortfolioStore } from "../lib/portfolioStore";
import { initialMarketState, useMarketStore } from "../lib/store";
import type { Portfolio, Position, PriceFrame } from "../lib/types";
import PositionsTable from "./PositionsTable";

function position(ticker: string, over: Partial<Position> = {}): Position {
  return {
    ticker,
    quantity: 1.5,
    avg_cost: 180,
    current_price: 180,
    market_value: 270,
    unrealized_pnl: 0,
    pnl_percent: 0,
    ...over,
  };
}

function portfolio(positions: Position[]): Portfolio {
  return { cash: 1000, total_value: 1270, unrealized_pnl: 0, positions };
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
  usePortfolioStore.setState({ portfolio: portfolio(positions), failed: false });
}

beforeEach(() => {
  resetPortfolioStore();
  useMarketStore.setState(initialMarketState());
  vi.unstubAllGlobals();
});

describe("PositionsTable states", () => {
  it("shows three skeleton rows and no text before the first portfolio", () => {
    render(<PositionsTable />);
    const loading = screen.getByTestId("positions-loading");
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(loading).toHaveAttribute("aria-label", "Loading positions");
    expect(loading.children).toHaveLength(3);
    expect(loading).toHaveTextContent("");
  });

  it("shows the fixed error copy when the portfolio never loaded", () => {
    usePortfolioStore.setState({ portfolio: null, failed: true });
    render(<PositionsTable />);
    const error = screen.getByTestId("positions-error");
    expect(error).toHaveTextContent("Positions unavailable");
    expect(error).toHaveTextContent(
      "The server did not return your portfolio. Check that FinAlly is running, then retry.",
    );
    expect(screen.queryByTestId("positions-loading")).toBeNull();
  });

  it("retry fetches the portfolio and renders the table", async () => {
    const fetchMock = vi.fn(async (_url: string) => ({
      ok: true,
      status: 200,
      json: async () => portfolio([position("AAPL")]),
    }));
    vi.stubGlobal("fetch", fetchMock);
    usePortfolioStore.setState({ portfolio: null, failed: true });
    render(<PositionsTable />);
    fireEvent.click(screen.getByTestId("positions-retry"));
    expect(fetchMock).toHaveBeenCalledWith("/api/portfolio");
    expect(await screen.findByTestId("position-row-AAPL")).toBeInTheDocument();
  });

  it("keeps stale rows when a later refetch failed", () => {
    usePortfolioStore.setState({ portfolio: portfolio([position("AAPL")]), failed: true });
    render(<PositionsTable />);
    expect(screen.getByTestId("positions-table")).toBeInTheDocument();
    expect(screen.queryByTestId("positions-error")).toBeNull();
  });

  it("shows the empty state with no table header", () => {
    show([]);
    render(<PositionsTable />);
    const empty = screen.getByTestId("positions-empty");
    expect(empty).toHaveTextContent("No open positions");
    expect(empty).toHaveTextContent("Buy shares with the trade bar to open a position.");
    expect(screen.queryByTestId("positions-table")).toBeNull();
    expect(screen.queryAllByRole("columnheader")).toHaveLength(0);
  });

  it("returns to the empty state after the last position is sold", () => {
    show([position("AAPL")]);
    render(<PositionsTable />);
    expect(screen.getByTestId("position-row-AAPL")).toBeInTheDocument();
    act(() => show([]));
    expect(screen.getByTestId("positions-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("position-row-AAPL")).toBeNull();
  });
});

describe("PositionsTable rows", () => {
  it("renders rows in response order with formatted cells", () => {
    show([position("MSFT"), position("AAPL")]);
    render(<PositionsTable />);
    const ids = screen
      .getAllByTestId(/^position-row-/)
      .map((row) => row.getAttribute("data-testid"));
    expect(ids).toEqual(["position-row-MSFT", "position-row-AAPL"]);
    expect(screen.getByTestId("position-qty-AAPL")).toHaveTextContent("1.5");
    expect(screen.getByTestId("position-avg-AAPL")).toHaveTextContent("$180.00");
    expect(screen.getByTestId("position-price-AAPL")).toHaveTextContent("$180.00");
    expect(screen.getByTestId("position-pnl-AAPL")).toHaveTextContent("0.00");
    expect(screen.getByTestId("position-pnl-AAPL")).toHaveClass("text-fg");
    expect(screen.getByTestId("position-pnl-pct-AAPL")).toHaveTextContent("0.00%");
  });

  it("follows the stream: price, P&L and P&L % move with a frame", () => {
    show([position("AAPL")]);
    render(<PositionsTable />);
    act(() => useMarketStore.getState().receiveFrame(frame("AAPL", 190)));
    expect(screen.getByTestId("position-price-AAPL")).toHaveTextContent("$190.00");
    const pnl = screen.getByTestId("position-pnl-AAPL");
    expect(pnl).toHaveTextContent("+15.00");
    expect(pnl).toHaveClass("text-up");
    expect(screen.getByTestId("position-pnl-pct-AAPL")).toHaveTextContent("+5.56%");
  });

  it("renders a rounded-zero loss in the neutral color", () => {
    show([position("AAPL", { quantity: 1, avg_cost: 100, market_value: 100, unrealized_pnl: 0 })]);
    render(<PositionsTable />);
    act(() => useMarketStore.getState().receiveFrame(frame("AAPL", 99.996)));
    const pnl = screen.getByTestId("position-pnl-AAPL");
    expect(pnl).toHaveTextContent("0.00");
    expect(pnl).not.toHaveTextContent("-");
    expect(pnl).toHaveClass("text-fg");
  });

  it("falls back to the server price when the stream has no entry", () => {
    show([position("IBM", { current_price: 150, market_value: 225, unrealized_pnl: -45 })]);
    render(<PositionsTable />);
    const row = screen.getByTestId("position-row-IBM");
    expect(within(row).getByTestId("position-price-IBM")).toHaveTextContent("$150.00");
    expect(row).not.toHaveTextContent("NaN");
  });

  it("dims price, P&L and P&L % while disconnected, not qty or avg cost", () => {
    show([position("AAPL")]);
    render(<PositionsTable />);
    const live = ["position-price-AAPL", "position-pnl-AAPL", "position-pnl-pct-AAPL"];
    const fixed = ["position-qty-AAPL", "position-avg-AAPL"];
    act(() => useMarketStore.getState().setStatus("disconnected"));
    for (const id of live) expect(screen.getByTestId(id)).toHaveClass("opacity-60");
    for (const id of fixed) expect(screen.getByTestId(id)).not.toHaveClass("opacity-60");
    act(() => useMarketStore.getState().setStatus("connected"));
    for (const id of live) expect(screen.getByTestId(id)).not.toHaveClass("opacity-60");
  });

  it("truncates a long ticker and quantity with the full text in the title", () => {
    show([position("ABCDEFGHIJ", { quantity: 0.1234567 })]);
    render(<PositionsTable />);
    const ticker = screen.getByText("ABCDEFGHIJ");
    expect(ticker).toHaveClass("truncate");
    expect(ticker).toHaveAttribute("title", "ABCDEFGHIJ");
    const qty = screen.getByTestId("position-qty-ABCDEFGHIJ");
    expect(qty).toHaveTextContent("0.123457");
    expect(qty).toHaveAttribute("title", "0.123457");
    expect(qty).toHaveClass("truncate");
  });

  it("never reuses the watchlist price testid", () => {
    show([position("AAPL")]);
    render(<PositionsTable />);
    const panel = screen.getByTestId("positions-panel");
    const bad = panel.querySelectorAll('[data-testid^="price-"]');
    expect(bad).toHaveLength(0);
  });
});
