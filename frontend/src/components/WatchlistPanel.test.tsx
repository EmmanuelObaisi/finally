import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialMarketState, useMarketStore } from "../lib/store";
import type { PriceFrame, WatchlistItem } from "../lib/types";
import WatchlistPanel from "./WatchlistPanel";

function item(ticker: string, price: number | null = null): WatchlistItem {
  return {
    ticker,
    price,
    previous_price: price,
    timestamp: price === null ? null : 1,
    change: price === null ? null : 0,
    change_percent: price === null ? null : 0.63,
    direction: price === null ? null : "up",
    session_start_price: price,
  };
}

function ok(items: WatchlistItem[]) {
  return { ok: true, status: 200, json: async () => ({ watchlist: items }) };
}

function stubFetch(...responses: unknown[]) {
  const fn = vi.fn();
  for (const r of responses) fn.mockImplementationOnce(() => r);
  vi.stubGlobal("fetch", fn);
  return fn;
}

const SEED = ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA", "NVDA", "META", "JPM", "V", "NFLX"];

beforeEach(() => {
  useMarketStore.setState(initialMarketState());
});

describe("WatchlistPanel states", () => {
  it("shows ten skeleton rows and no text while the fetch is pending", () => {
    stubFetch(new Promise(() => {}));
    render(<WatchlistPanel />);
    const loading = screen.getByTestId("watchlist-loading");
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(loading).toHaveAttribute("aria-label", "Loading watchlist");
    expect(loading.children).toHaveLength(10);
    expect(loading).toHaveTextContent("");
  });

  it("shows the fixed error copy when the fetch rejects", async () => {
    stubFetch(Promise.reject(new Error("boom")));
    render(<WatchlistPanel />);
    const error = await screen.findByTestId("watchlist-error");
    expect(error).toHaveTextContent("Watchlist unavailable");
    expect(error).toHaveTextContent(
      "The server did not return your watchlist. Check that FinAlly is running, then retry.",
    );
    expect(error).not.toHaveTextContent("boom");
  });

  it("shows the error state on a non-2xx response without echoing the status", async () => {
    stubFetch({ ok: false, status: 503, json: async () => ({ error: "secret detail" }) });
    render(<WatchlistPanel />);
    const error = await screen.findByTestId("watchlist-error");
    expect(error).not.toHaveTextContent("503");
    expect(error).not.toHaveTextContent("secret detail");
  });

  it("Retry fetches again and renders the rows", async () => {
    const fetchFn = stubFetch(Promise.reject(new Error("down")), ok([item("AAPL", 190)]));
    render(<WatchlistPanel />);
    fireEvent.click(await screen.findByTestId("watchlist-retry"));
    expect(await screen.findByTestId("watchlist-row-AAPL")).toBeInTheDocument();
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("watchlist-error")).not.toBeInTheDocument();
  });

  it("shows the empty state for an empty watchlist", async () => {
    stubFetch(ok([]));
    render(<WatchlistPanel />);
    const empty = await screen.findByTestId("watchlist-empty");
    expect(empty).toHaveTextContent("Watchlist is empty");
    expect(empty).toHaveTextContent("Add a ticker to start watching live prices.");
  });
});

describe("WatchlistPanel rows", () => {
  it("renders rows in response order even when frame keys arrive reversed", async () => {
    const frame: PriceFrame = {};
    for (const t of [...SEED].reverse()) {
      frame[t] = { ...item(t, 100) } as unknown as PriceFrame[string];
    }
    useMarketStore.getState().receiveFrame(frame);
    stubFetch(ok(SEED.map((t) => item(t))));
    render(<WatchlistPanel />);
    await screen.findByTestId("watchlist-row-AAPL");
    const ids = screen.getAllByTestId(/^watchlist-row-/).map((r) => r.getAttribute("data-testid"));
    expect(ids).toEqual(SEED.map((t) => "watchlist-row-" + t));
  });

  it("shows muted -- for an unpriced item while a priced item renders normally", async () => {
    stubFetch(ok([item("AAPL", 190), item("ZZZZ")]));
    render(<WatchlistPanel />);
    expect(await screen.findByTestId("price-AAPL")).toHaveTextContent("$190.00");
    for (const id of ["price-ZZZZ", "change-ZZZZ"]) {
      expect(screen.getByTestId(id)).toHaveTextContent("--");
      expect(screen.getByTestId(id)).toHaveClass("text-muted");
    }
  });

  it("prefers the live store price over the REST price", async () => {
    stubFetch(ok([item("AAPL", 190)]));
    render(<WatchlistPanel />);
    await screen.findByTestId("price-AAPL");
    useMarketStore.getState().receiveFrame({
      AAPL: { ...item("AAPL", 191.5), direction: "up" } as unknown as PriceFrame[string],
    });
    await waitFor(() => expect(screen.getByTestId("price-AAPL")).toHaveTextContent("$191.50"));
  });

  it("truncates a long ticker in its cell and keeps the full symbol in the title", async () => {
    stubFetch(ok([item("ABCDEFGHIJ", 10)]));
    render(<WatchlistPanel />);
    const row = await screen.findByTestId("watchlist-row-ABCDEFGHIJ");
    const cell = within(row).getByText("ABCDEFGHIJ");
    expect(cell).toHaveClass("truncate");
    expect(cell).toHaveAttribute("title", "ABCDEFGHIJ");
  });

  it("renders exactly one row with the same cells for a single item", async () => {
    stubFetch(ok([item("AAPL", 190)]));
    render(<WatchlistPanel />);
    const row = await screen.findByTestId("watchlist-row-AAPL");
    expect(screen.getAllByTestId(/^watchlist-row-/)).toHaveLength(1);
    expect(row.querySelectorAll("td")).toHaveLength(4);
    expect(screen.getByTestId("sparkline-AAPL")).toBeInTheDocument();
  });

  it("labels the change column as change since session start", async () => {
    stubFetch(ok([item("AAPL", 190)]));
    render(<WatchlistPanel />);
    await screen.findByTestId("watchlist-row-AAPL");
    expect(screen.getByText("Chg %")).toHaveAttribute("title", "Change since session start");
  });
});
