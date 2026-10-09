import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetChatStore, useChatStore } from "../lib/chatStore";
import { resetPortfolioStore, usePortfolioStore } from "../lib/portfolioStore";
import { resetSelectionStore, useSelectionStore } from "../lib/selectionStore";
import { initialMarketState, useMarketStore } from "../lib/store";
import type { PriceFrame, WatchlistItem } from "../lib/types";
import { resetWatchlistStore, useWatchlistStore } from "../lib/watchlistStore";
import WatchlistPanel from "./WatchlistPanel";

// The canvas chart needs a real browser; sparkline behavior is tested in Sparkline.test.tsx.
vi.mock("lightweight-charts", () => ({
  createChart: () => ({
    addSeries: () => ({ setData: () => {}, update: () => {} }),
    timeScale: () => ({ fitContent: () => {} }),
    remove: () => {},
  }),
  LineSeries: "LineSeries",
  CrosshairMode: { Hidden: 3 },
  ColorType: { Solid: "solid" },
}));

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
  resetSelectionStore();
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
    expect(row.querySelectorAll("td")).toHaveLength(5);
    expect(screen.getByTestId("sparkline-AAPL")).toBeInTheDocument();
  });

  it("labels the change column as change since session start", async () => {
    stubFetch(ok([item("AAPL", 190)]));
    render(<WatchlistPanel />);
    await screen.findByTestId("watchlist-row-AAPL");
    expect(screen.getByText("Chg %")).toHaveAttribute("title", "Change since session start");
  });
});

describe("WatchlistPanel reconnect", () => {
  it("re-fetches in the error state when the status becomes connected", async () => {
    const fetchFn = stubFetch(Promise.reject(new Error("down")), ok([item("AAPL", 190)]));
    render(<WatchlistPanel />);
    await screen.findByTestId("watchlist-error");
    act(() => useMarketStore.getState().setStatus("connected"));
    await screen.findByTestId("watchlist-row-AAPL");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("does not re-fetch in the ready state", async () => {
    const fetchFn = stubFetch(ok([item("AAPL", 190)]));
    render(<WatchlistPanel />);
    await screen.findByTestId("watchlist-row-AAPL");
    act(() => useMarketStore.getState().setStatus("connected"));
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("dims price and change cells while disconnected", async () => {
    stubFetch(ok([item("AAPL", 190)]));
    render(<WatchlistPanel />);
    await screen.findByTestId("watchlist-row-AAPL");
    expect(screen.getByTestId("price-AAPL")).not.toHaveClass("opacity-60");
    act(() => useMarketStore.getState().setStatus("disconnected"));
    expect(screen.getByTestId("price-AAPL")).toHaveClass("opacity-60");
    expect(screen.getByTestId("change-AAPL")).toHaveClass("opacity-60");
    expect(screen.getByText("AAPL")).not.toHaveClass("opacity-60");
    expect(screen.getByTestId("sparkline-AAPL")).not.toHaveClass("opacity-60");
    act(() => useMarketStore.getState().setStatus("connected"));
    expect(screen.getByTestId("price-AAPL")).not.toHaveClass("opacity-60");
    expect(screen.getByTestId("change-AAPL")).not.toHaveClass("opacity-60");
  });
});

function reply(items: WatchlistItem[]) {
  return Promise.resolve(ok(items));
}

function fail(status: number, error: string) {
  return Promise.resolve({ ok: false, status, json: async () => ({ error }) });
}

async function renderReady(...extra: unknown[]) {
  const fetchFn = stubFetch(reply([item("AAPL", 190), item("GOOGL", 175)]), ...extra);
  render(<WatchlistPanel />);
  await screen.findByTestId("watchlist-row-AAPL");
  return fetchFn;
}

function addTicker(text: string) {
  fireEvent.change(screen.getByTestId("watchlist-add-input"), { target: { value: text } });
  fireEvent.click(screen.getByTestId("watchlist-add-button"));
}

function message() {
  return screen.getByTestId("watchlist-message");
}

describe("WatchlistPanel add block states", () => {
  it("disables the input and Add while loading", () => {
    stubFetch(new Promise(() => {}));
    render(<WatchlistPanel />);
    expect(screen.getByTestId("watchlist-add-input")).toBeDisabled();
    expect(screen.getByTestId("watchlist-add-button")).toBeDisabled();
  });

  it("disables the input and Add in the error state", async () => {
    stubFetch(Promise.reject(new Error("down")));
    render(<WatchlistPanel />);
    await screen.findByTestId("watchlist-error");
    expect(screen.getByTestId("watchlist-add-input")).toBeDisabled();
    expect(screen.getByTestId("watchlist-add-button")).toBeDisabled();
  });

  it("is enabled in the ready state", async () => {
    await renderReady();
    expect(screen.getByTestId("watchlist-add-input")).toBeEnabled();
    expect(screen.getByTestId("watchlist-add-button")).toBeEnabled();
  });
});

describe("WatchlistPanel add", () => {
  it.each(["", "   "])("rejects %j without a request", async (text) => {
    const fetchFn = await renderReady();
    addTicker(text);
    expect(message()).toHaveTextContent("Enter a ticker symbol");
    expect(message()).toHaveAttribute("data-kind", "error");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("locks every control while the add is in flight", async () => {
    await renderReady(new Promise(() => {}));
    addTicker("pypl");
    expect(message()).toHaveTextContent("Adding PYPL...");
    expect(message()).toHaveAttribute("data-kind", "pending");
    expect(screen.getByTestId("watchlist-add-input")).toBeDisabled();
    expect(screen.getByTestId("watchlist-add-button")).toBeDisabled();
    for (const b of screen.getAllByTestId(/^watchlist-remove-/)) expect(b).toBeDisabled();
  });

  it("renders the response list without the skeleton, clears the input and refocuses it", async () => {
    const fetchFn = await renderReady(reply([item("AAPL", 190), item("GOOGL", 175), item("PYPL", 60)]));
    addTicker("  pypl ");
    expect(screen.queryByTestId("watchlist-loading")).not.toBeInTheDocument();
    await screen.findByTestId("watchlist-row-PYPL");
    expect(screen.queryByTestId("watchlist-loading")).not.toBeInTheDocument();
    const input = screen.getByTestId("watchlist-add-input");
    expect(input).toHaveValue("");
    expect(message()).toHaveAttribute("data-kind", "idle");
    expect(message()).toHaveTextContent("");
    await waitFor(() => expect(input).toHaveFocus());
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const [url, init] = fetchFn.mock.calls[1];
    expect(url).toBe("/api/watchlist");
    expect(init).toMatchObject({ method: "POST", body: JSON.stringify({ ticker: "pypl" }) });
  });

  it("treats a re-add of an existing ticker as a silent success", async () => {
    await renderReady(reply([item("AAPL", 190), item("GOOGL", 175)]));
    addTicker("AAPL");
    await waitFor(() => expect(screen.getByTestId("watchlist-add-input")).toHaveValue(""));
    expect(screen.getAllByTestId(/^watchlist-row-/)).toHaveLength(2);
    expect(message()).toHaveAttribute("data-kind", "idle");
    expect(message()).toHaveTextContent("");
  });

  it.each([
    ["Unknown ticker", "ZZZZ"],
    ["Invalid ticker: PYPL$", "PYPL$"],
  ])("shows the server text %j and keeps the input", async (error, typed) => {
    await renderReady(fail(400, error));
    addTicker(typed);
    await waitFor(() => expect(message()).toHaveAttribute("data-kind", "error"));
    expect(message()).toHaveTextContent(error);
    expect(message()).toHaveClass("text-down");
    expect(screen.getByTestId("watchlist-add-input")).toHaveValue(typed);
    expect(screen.getAllByTestId(/^watchlist-row-/)).toHaveLength(2);
  });

  it("puts a long server error in the title and truncates the line", async () => {
    const long = "Invalid ticker: " + "X".repeat(80);
    await renderReady(fail(400, long));
    addTicker("X".repeat(80));
    await waitFor(() => expect(message()).toHaveAttribute("title", long));
    expect(message()).toHaveClass("truncate");
  });

  it("clears the message when the input is edited", async () => {
    await renderReady(fail(400, "Unknown ticker"));
    addTicker("ZZZZ");
    await waitFor(() => expect(message()).toHaveAttribute("data-kind", "error"));
    fireEvent.change(screen.getByTestId("watchlist-add-input"), { target: { value: "ZZZ" } });
    expect(message()).toHaveAttribute("data-kind", "idle");
  });
});

describe("WatchlistPanel remove", () => {
  it("sends DELETE, locks while pending and drops the row on success", async () => {
    let finish: (v: unknown) => void = () => {};
    const pending = new Promise((resolve) => (finish = resolve));
    const fetchFn = await renderReady(pending);
    fireEvent.click(screen.getByTestId("watchlist-remove-AAPL"));
    expect(message()).toHaveTextContent("Removing AAPL...");
    expect(message()).toHaveAttribute("data-kind", "pending");
    expect(screen.getByTestId("watchlist-add-button")).toBeDisabled();
    for (const b of screen.getAllByTestId(/^watchlist-remove-/)) expect(b).toBeDisabled();
    const [url, init] = fetchFn.mock.calls[1];
    expect(url).toBe("/api/watchlist/AAPL");
    expect(init).toMatchObject({ method: "DELETE" });
    await act(async () => finish(ok([item("GOOGL", 175)])));
    await waitFor(() => expect(screen.queryByTestId("watchlist-row-AAPL")).not.toBeInTheDocument());
    expect(screen.getByTestId("watchlist-row-GOOGL")).toBeInTheDocument();
    expect(message()).toHaveAttribute("data-kind", "idle");
    expect(screen.queryByTestId("watchlist-loading")).not.toBeInTheDocument();
  });

  it("shows the server text on a 404 and refreshes the stale list", async () => {
    const fetchFn = await renderReady(fail(404, "Ticker not in watchlist"), reply([item("GOOGL", 175)]));
    fireEvent.click(screen.getByTestId("watchlist-remove-AAPL"));
    await waitFor(() => expect(screen.queryByTestId("watchlist-row-AAPL")).not.toBeInTheDocument());
    expect(fetchFn.mock.calls[2][0]).toBe("/api/watchlist");
    expect(message()).toHaveTextContent("Ticker not in watchlist");
    expect(message()).toHaveAttribute("data-kind", "error");
    expect(screen.getByTestId("watchlist-row-GOOGL")).toBeInTheDocument();
    expect(screen.queryByTestId("watchlist-loading")).not.toBeInTheDocument();
  });

  it("stays locked until the refresh after a failed remove resolves", async () => {
    let finish: (v: unknown) => void = () => {};
    const refresh = new Promise((resolve) => (finish = resolve));
    await renderReady(fail(404, "Ticker not in watchlist"), refresh);
    fireEvent.click(screen.getByTestId("watchlist-remove-AAPL"));
    await waitFor(() => expect(message()).toHaveAttribute("data-kind", "error"));
    expect(screen.getByTestId("watchlist-add-button")).toBeDisabled();
    for (const b of screen.getAllByTestId(/^watchlist-remove-/)) expect(b).toBeDisabled();
    await act(async () => finish(ok([item("GOOGL", 175)])));
    expect(screen.getByTestId("watchlist-add-button")).toBeEnabled();
    expect(screen.queryByTestId("watchlist-row-AAPL")).not.toBeInTheDocument();
  });

  it("shows the empty state with a usable add block after removing the last ticker", async () => {
    stubFetch(reply([item("AAPL", 190)]), reply([]));
    render(<WatchlistPanel />);
    fireEvent.click(await screen.findByTestId("watchlist-remove-AAPL"));
    expect(await screen.findByTestId("watchlist-empty")).toBeInTheDocument();
    expect(screen.getByTestId("watchlist-add-input")).toBeEnabled();
    expect(screen.getByTestId("watchlist-add-button")).toBeEnabled();
  });

  it("gives each row five cells and an accessible remove button", async () => {
    stubFetch(reply([item("AAPL", 190)]));
    render(<WatchlistPanel />);
    const row = await screen.findByTestId("watchlist-row-AAPL");
    expect(row.querySelectorAll("td")).toHaveLength(5);
    const button = screen.getByTestId("watchlist-remove-AAPL");
    expect(button).toHaveAttribute("aria-label", "Remove AAPL");
    expect(button).toHaveAttribute("title", "Remove AAPL");
    expect(button).toHaveAttribute("type", "button");
    expect(button.querySelector("span")).toHaveAttribute("aria-hidden", "true");
    expect(button).toHaveTextContent("×");
    expect(screen.getByText("Remove", { selector: "th span" })).toHaveClass("sr-only");
  });

  it("keeps -- in the price and change cells of an unpriced row that has a remove button", async () => {
    stubFetch(reply([item("ZZZZ")]));
    render(<WatchlistPanel />);
    await screen.findByTestId("watchlist-row-ZZZZ");
    expect(screen.getByTestId("price-ZZZZ")).toHaveTextContent("--");
    expect(screen.getByTestId("change-ZZZZ")).toHaveTextContent("--");
    expect(screen.getByTestId("watchlist-remove-ZZZZ")).toBeInTheDocument();
  });
});

describe("WatchlistPanel selection", () => {
  const selected = () => useSelectionStore.getState().selected;

  it("selects the first ticker once the list loads and marks only its row", async () => {
    stubFetch(ok([item("AAPL", 190), item("GOOGL", 175)]));
    render(<WatchlistPanel />);
    const aapl = await screen.findByTestId("watchlist-row-AAPL");
    await waitFor(() => expect(aapl).toHaveAttribute("data-selected", "true"));
    expect(screen.getByTestId("watchlist-row-GOOGL")).toHaveAttribute("data-selected", "false");
    expect(screen.getByTestId("select-AAPL")).toHaveAttribute("aria-current", "true");
    expect(screen.getByTestId("select-GOOGL")).not.toHaveAttribute("aria-current");
    expect(screen.getByTestId("select-AAPL").closest("td")).toHaveClass("border-primary");
    expect(screen.getByTestId("select-GOOGL").closest("td")).toHaveClass("border-transparent");
  });

  it("selects a row when its cell is clicked", async () => {
    stubFetch(ok([item("AAPL", 190), item("GOOGL", 175)]));
    render(<WatchlistPanel />);
    await screen.findByTestId("watchlist-row-AAPL");
    fireEvent.click(screen.getByTestId("change-GOOGL"));
    expect(selected()).toBe("GOOGL");
    expect(screen.getByTestId("watchlist-row-GOOGL")).toHaveAttribute("data-selected", "true");
  });

  it("selects a ticker through its select button", async () => {
    stubFetch(ok([item("AAPL", 190), item("GOOGL", 175)]));
    render(<WatchlistPanel />);
    await screen.findByTestId("watchlist-row-AAPL");
    expect(screen.getByTestId("select-GOOGL")).toHaveAttribute("aria-label", "Show GOOGL chart");
    fireEvent.click(screen.getByTestId("select-GOOGL"));
    expect(selected()).toBe("GOOGL");
  });

  it("does not select a row whose remove button is clicked", async () => {
    stubFetch(ok([item("AAPL", 190), item("MSFT", 400)]), new Promise(() => {}));
    render(<WatchlistPanel />);
    await screen.findByTestId("watchlist-row-AAPL");
    await waitFor(() => expect(selected()).toBe("AAPL"));
    fireEvent.click(screen.getByTestId("watchlist-remove-MSFT"));
    expect(selected()).toBe("AAPL");
  });

  it("moves the selection to the first remaining ticker when the selected one is removed", async () => {
    stubFetch(ok([item("AAPL", 190), item("GOOGL", 175)]), reply([item("GOOGL", 175)]));
    render(<WatchlistPanel />);
    await screen.findByTestId("watchlist-row-AAPL");
    fireEvent.click(screen.getByTestId("watchlist-remove-AAPL"));
    await waitFor(() => expect(selected()).toBe("GOOGL"));
    expect(screen.getByTestId("watchlist-row-GOOGL")).toHaveAttribute("data-selected", "true");
  });

  it("selects nothing for an empty list", async () => {
    stubFetch(ok([]));
    render(<WatchlistPanel />);
    await screen.findByTestId("watchlist-empty");
    await waitFor(() => expect(useSelectionStore.getState().status).toBe("ready"));
    expect(selected()).toBeNull();
  });
});

const EMPTY_PORTFOLIO = { cash: 9000, total_value: 9000, unrealized_pnl: 0, positions: [] };

/** Routes by URL: the seed list for /api/watchlist, the given chat body for /api/chat. */
function routeFetch(chatBody: unknown) {
  const fn = vi.fn(async (url: string) => {
    if (url === "/api/chat") return { ok: true, status: 200, json: async () => chatBody };
    return ok(SEED.map((t) => item(t, 100)));
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("WatchlistPanel chat push", () => {
  beforeEach(() => {
    resetChatStore();
    resetWatchlistStore();
    resetPortfolioStore();
  });

  it("a chat reply that adds PYPL shows the PYPL row and applies the portfolio", async () => {
    const fetchFn = routeFetch({
      message: "Added PYPL",
      actions: [{ type: "watchlist", ticker: "PYPL", action: "add", ok: true, error: null }],
      portfolio: EMPTY_PORTFOLIO,
      watchlist: [...SEED, "PYPL"].map((t) => item(t, 100)),
    });
    render(<WatchlistPanel />);
    await screen.findByTestId("watchlist-row-AAPL");
    expect(screen.queryByTestId("watchlist-row-PYPL")).not.toBeInTheDocument();
    await act(async () => {
      await useChatStore.getState().send("add PYPL");
    });
    expect(screen.getByTestId("watchlist-row-PYPL")).toBeInTheDocument();
    expect(usePortfolioStore.getState().portfolio).toEqual(EMPTY_PORTFOLIO);
    expect(fetchFn.mock.calls.filter(([url]) => url === "/api/chat")).toHaveLength(1);
    expect(useWatchlistStore.getState().seq).toBe(1);
  });

  const publish = (items: WatchlistItem[]) => act(() => useWatchlistStore.getState().publish(items));

  it("a published list replaces the loading view", async () => {
    stubFetch(new Promise(() => {}));
    render(<WatchlistPanel />);
    expect(screen.getByTestId("watchlist-loading")).toBeInTheDocument();
    publish([item("AAPL", 190)]);
    expect(await screen.findByTestId("watchlist-row-AAPL")).toBeInTheDocument();
    expect(screen.queryByTestId("watchlist-loading")).not.toBeInTheDocument();
  });

  it("a published list replaces the error view", async () => {
    stubFetch(Promise.reject(new Error("down")));
    render(<WatchlistPanel />);
    await screen.findByTestId("watchlist-error");
    publish([item("AAPL", 190)]);
    expect(await screen.findByTestId("watchlist-row-AAPL")).toBeInTheDocument();
    expect(screen.queryByTestId("watchlist-error")).not.toBeInTheDocument();
  });

  it("a published empty list shows the empty state", async () => {
    await renderReady();
    publish([]);
    expect(await screen.findByTestId("watchlist-empty")).toBeInTheDocument();
  });

  it("moves the selection to the first pushed ticker when the selected one is gone", async () => {
    stubFetch(ok(SEED.map((t) => item(t, 100))));
    render(<WatchlistPanel />);
    await screen.findByTestId("watchlist-row-NFLX");
    act(() => useSelectionStore.getState().select("NFLX"));
    publish([item("AAPL", 190), item("GOOGL", 175)]);
    await waitFor(() => expect(useSelectionStore.getState().selected).toBe("AAPL"));
  });

  it("the manual mutation response wins over a list pushed while it was in flight", async () => {
    let finish: (v: unknown) => void = () => {};
    const pending = new Promise((resolve) => (finish = resolve));
    await renderReady(pending);
    addTicker("pypl");
    publish([item("TSLA", 250)]);
    expect(await screen.findByTestId("watchlist-row-TSLA")).toBeInTheDocument();
    await act(async () => finish(ok([item("AAPL", 190), item("PYPL", 60)])));
    expect(await screen.findByTestId("watchlist-row-PYPL")).toBeInTheDocument();
    expect(screen.queryByTestId("watchlist-row-TSLA")).not.toBeInTheDocument();
  });

  it("changes nothing while seq is 0 and nothing was pushed", async () => {
    await renderReady();
    expect(useWatchlistStore.getState().seq).toBe(0);
    expect(screen.getAllByTestId(/^watchlist-row-/)).toHaveLength(2);
  });
});
