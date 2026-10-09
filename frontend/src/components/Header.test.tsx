import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetChatStore, useChatStore } from "../lib/chatStore";
import { resetPortfolioStore, usePortfolioStore } from "../lib/portfolioStore";
import { initialMarketState, useMarketStore } from "../lib/store";
import type { Portfolio, PriceFrame } from "../lib/types";
import Footer from "./Footer";
import Header from "./Header";

const fresh: Portfolio = { cash: 10000, total_value: 10000, unrealized_pnl: 0, positions: [] };

function stubFetch(portfolio: Portfolio = fresh) {
  const fn = vi.fn(async (_url: string) => ({ ok: true, status: 200, json: async () => portfolio }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

function setStatus(status: "connected" | "reconnecting" | "disconnected") {
  act(() => useMarketStore.getState().setStatus(status));
}

beforeEach(() => {
  useMarketStore.setState(initialMarketState());
  resetPortfolioStore();
});

describe("Header connection behavior", () => {
  it("re-fetches the portfolio on each transition to connected", async () => {
    const fetchFn = stubFetch();
    render(<Header />);
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    setStatus("connected");
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    setStatus("reconnecting");
    setStatus("connected");
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(3));
    for (const call of fetchFn.mock.calls) expect(call[0]).toBe("/api/portfolio");
  });

  it("does not re-fetch on other transitions", async () => {
    const fetchFn = stubFetch();
    render(<Header />);
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    setStatus("disconnected");
    setStatus("reconnecting");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("dims total and cash while disconnected, not while reconnecting", async () => {
    stubFetch();
    render(<Header />);
    await screen.findByText("$10,000.00", { selector: '[data-testid="header-cash"]' });
    setStatus("reconnecting");
    expect(screen.getByTestId("header-total-value")).not.toHaveClass("opacity-60");
    expect(screen.getByTestId("header-cash")).not.toHaveClass("opacity-60");
    setStatus("disconnected");
    expect(screen.getByTestId("header-total-value")).toHaveClass("opacity-60");
    expect(screen.getByTestId("header-cash")).toHaveClass("opacity-60");
    setStatus("connected");
    expect(screen.getByTestId("header-total-value")).not.toHaveClass("opacity-60");
  });
});

const held: Portfolio = {
  cash: 1000,
  total_value: 1270,
  unrealized_pnl: 0,
  positions: [
    { ticker: "AAPL", quantity: 1.5, avg_cost: 180, current_price: 180, market_value: 270, unrealized_pnl: 0, pnl_percent: 0 },
  ],
};

const aaplFrame: PriceFrame = {
  AAPL: {
    ticker: "AAPL",
    price: 190,
    previous_price: 189,
    timestamp: 1,
    change: 1,
    change_percent: 0.5,
    direction: "up",
    session_start_price: 189,
  },
};

describe("Header totals states", () => {
  it("shows muted -- while the fetch is pending", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<Header />);
    for (const id of ["header-total-value", "header-cash"]) {
      expect(screen.getByTestId(id)).toHaveTextContent("--");
      expect(screen.getByTestId(id)).toHaveClass("text-muted");
    }
  });

  it("keeps -- and shows no error text when the fetch rejects", async () => {
    const fetchFn = vi.fn(() => Promise.reject(new Error("boom")));
    vi.stubGlobal("fetch", fetchFn);
    render(<Header />);
    await waitFor(() => expect(fetchFn).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.getByTestId("header-total-value")).toHaveTextContent("--");
    expect(screen.getByTestId("header-cash")).toHaveTextContent("--");
    expect(screen.getByTestId("header")).not.toHaveTextContent("boom");
  });

  it("shows $10,000.00 for both values once the portfolio resolves", async () => {
    stubFetch();
    render(<Header />);
    await waitFor(() => expect(screen.getByTestId("header-total-value")).toHaveTextContent("$10,000.00"));
    expect(screen.getByTestId("header-cash")).toHaveTextContent("$10,000.00");
  });

  it("follows live prices", async () => {
    stubFetch(held);
    render(<Header />);
    await waitFor(() => expect(screen.getByTestId("header-total-value")).toHaveTextContent("$1,270.00"));
    act(() => useMarketStore.getState().receiveFrame(aaplFrame));
    expect(screen.getByTestId("header-total-value")).toHaveTextContent("$1,285.00");
    expect(screen.getByTestId("header-cash")).toHaveTextContent("$1,000.00");
  });

  it("values a position at the server's current price before the first frame, not at cost", async () => {
    const gained = { ...held.positions[0], avg_cost: 100, unrealized_pnl: 120, pnl_percent: 80 };
    stubFetch({ ...held, positions: [gained] });
    render(<Header />);
    await waitFor(() => expect(screen.getByTestId("header-total-value")).toHaveTextContent("$1,270.00"));
  });

  it("shows the same total whether prices arrive before or after the portfolio", async () => {
    useMarketStore.getState().receiveFrame(aaplFrame);
    stubFetch(held);
    const { unmount } = render(<Header />);
    await waitFor(() => expect(screen.getByTestId("header-total-value")).toHaveTextContent("$1,285.00"));
    unmount();

    useMarketStore.setState(initialMarketState());
    resetPortfolioStore();
    stubFetch(held);
    render(<Header />);
    await waitFor(() => expect(screen.getByTestId("header-total-value")).toHaveTextContent("$1,270.00"));
    act(() => useMarketStore.getState().receiveFrame(aaplFrame));
    expect(screen.getByTestId("header-total-value")).toHaveTextContent("$1,285.00");
  });

  it("renders a billion dollars without wrapping", async () => {
    stubFetch({ ...fresh, cash: 1_000_000_000, total_value: 1_000_000_000 });
    render(<Header />);
    await waitFor(() => expect(screen.getByTestId("header-cash")).toHaveTextContent("$1,000,000,000.00"));
    expect(screen.getByTestId("header-cash")).toHaveClass("whitespace-nowrap");
    expect(screen.getByTestId("header-total-value")).toHaveClass("whitespace-nowrap");
  });
});

describe("Header shared portfolio", () => {
  it("keeps a newer applied portfolio when the older mount fetch resolves afterwards", async () => {
    let resolveOld: (value: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise((resolve) => (resolveOld = resolve))),
    );
    render(<Header />);
    act(() => usePortfolioStore.getState().applyTrade({ ...fresh, cash: 900, total_value: 900 }));
    expect(screen.getByTestId("header-cash")).toHaveTextContent("$900.00");
    await act(async () => resolveOld({ ok: true, status: 200, json: async () => fresh }));
    expect(screen.getByTestId("header-cash")).toHaveTextContent("$900.00");
  });
});

describe("ConnectionDot", () => {
  const table = [
    ["connected", "Live", "Connected: streaming live prices"],
    ["reconnecting", "Reconnecting", "Reconnecting: price stream interrupted, retrying"],
    ["disconnected", "Offline", "Disconnected: no price stream for 5 seconds or more, retrying"],
  ] as const;

  it.each(table)("%s shows label %s with the UI-SPEC sentence", (status, label, sentence) => {
    stubFetch();
    render(<Header />);
    setStatus(status);
    const dot = screen.getByTestId("connection-dot");
    expect(dot).toHaveAttribute("role", "status");
    expect(dot).toHaveAttribute("data-status", status);
    expect(dot).toHaveAttribute("aria-label", sentence);
    expect(dot).toHaveAttribute("title", sentence);
    expect(screen.getByTestId("connection-label")).toHaveTextContent(label);
  });
});

describe("Footer", () => {
  it("carries the lightweight-charts attribution and a safe TradingView link", () => {
    render(<Footer />);
    expect(screen.getByTestId("footer-attribution")).toHaveTextContent(
      "TradingView Lightweight Charts(TM) Copyright (c) 2025 TradingView, Inc. https://www.tradingview.com/",
    );
    const link = screen.getByTestId("tradingview-link");
    expect(link).toHaveTextContent("TradingView");
    expect(link).toHaveAttribute("href", "https://www.tradingview.com/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});

describe("Header chat toggle", () => {
  const toggle = () => screen.getByTestId("chat-toggle");

  it("starts closed, labelled Chat and wired to the panel, after the connection dot", () => {
    stubFetch();
    render(<Header />);
    expect(toggle()).toHaveTextContent("Chat");
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(toggle()).toHaveAttribute("aria-controls", "chat-panel");
    expect(toggle()).toHaveAttribute("title", "Show AI chat");
    const dot = screen.getByTestId("connection-dot");
    expect(dot.compareDocumentPosition(toggle()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("opens with a focus request and closes without one", () => {
    stubFetch();
    render(<Header />);
    fireEvent.click(toggle());
    expect(useChatStore.getState().open).toBe(true);
    expect(useChatStore.getState().focusSeq).toBe(1);
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(toggle()).toHaveAttribute("title", "Hide AI chat");
    expect(toggle()).toHaveClass("bg-raised");
    fireEvent.click(toggle());
    expect(useChatStore.getState().open).toBe(false);
    expect(useChatStore.getState().focusSeq).toBe(1);
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("is an outline button, not a purple or accent fill", () => {
    stubFetch();
    render(<Header />);
    expect(toggle()).toHaveClass("h-8", "self-center", "rounded-sm", "border-border", "px-4");
    expect(toggle()).not.toHaveClass("bg-secondary", "bg-accent");
  });
});
