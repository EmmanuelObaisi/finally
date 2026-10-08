import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NETWORK_ERROR } from "../lib/api";
import { resetPortfolioStore, usePortfolioStore } from "../lib/portfolioStore";
import type { Portfolio } from "../lib/types";
import TradeBar from "./TradeBar";

const after: Portfolio = { cash: 500, total_value: 1000, unrealized_pnl: 0, positions: [] };
const BAD_QTY = "Enter a quantity greater than 0, for example 10 or 1.5";

const ok = (side: "buy" | "sell", quantity: number) => ({
  ok: true,
  status: 200,
  json: async () => ({
    trade: { id: "t1", ticker: "AAPL", side, quantity, price: 190.12, executed_at: "2026-10-08T00:00:00Z" },
    portfolio: after,
  }),
});
const failure = (error: string) => ({ ok: false, status: 400, json: async () => ({ error }) });

function stubFetch(response: unknown) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

const ticker = () => screen.getByTestId("trade-ticker") as HTMLInputElement;
const quantity = () => screen.getByTestId("trade-quantity") as HTMLInputElement;
const message = () => screen.getByTestId("trade-message");
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const click = (id: "trade-buy" | "trade-sell") => fireEvent.click(screen.getByTestId(id));
const sentBody = (fn: ReturnType<typeof stubFetch>) => JSON.parse(fn.mock.calls[0][1]?.body as string);

function fill(t: string, q: string) {
  type(ticker(), t);
  type(quantity(), q);
}

beforeEach(() => resetPortfolioStore());

describe("TradeBar initial state and layout", () => {
  it("starts empty with enabled buttons and an idle reserved message", () => {
    render(<TradeBar />);
    expect(ticker()).toHaveValue("");
    expect(quantity()).toHaveValue("");
    expect(screen.getByTestId("trade-buy")).toBeEnabled();
    expect(screen.getByTestId("trade-sell")).toBeEnabled();
    expect(message()).toHaveAttribute("data-kind", "idle");
    expect(message()).toHaveTextContent("");
    expect(message()).toHaveClass("h-6", "truncate");
  });

  it("uses the fixed UI-SPEC sizes", () => {
    render(<TradeBar />);
    expect(screen.getByTestId("trade-bar")).toHaveClass("h-18");
    expect(ticker()).toHaveClass("w-32");
    expect(quantity()).toHaveClass("w-32");
    expect(screen.getByTestId("trade-buy")).toHaveClass("w-20");
    expect(screen.getByTestId("trade-sell")).toHaveClass("w-20");
  });
});

describe("TradeBar client validation", () => {
  it.each(["", "   "])("rejects the empty ticker %j without a request", (t) => {
    const fetchFn = stubFetch(ok("buy", 1));
    render(<TradeBar />);
    fill(t, "1");
    click("trade-buy");
    expect(message()).toHaveTextContent("Enter a ticker symbol");
    expect(message()).toHaveAttribute("data-kind", "error");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each(["", "0", "-1", "+1", "1e3", "10,5", "1 0", "abc"])("rejects the quantity %j without a request", (q) => {
    const fetchFn = stubFetch(ok("buy", 1));
    render(<TradeBar />);
    fill("AAPL", q);
    click("trade-buy");
    expect(message()).toHaveTextContent(BAD_QTY);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rejects more than 6 decimals", () => {
    const fetchFn = stubFetch(ok("buy", 1));
    render(<TradeBar />);
    fill("AAPL", "1.1234567");
    click("trade-sell");
    expect(message()).toHaveTextContent("Quantity supports up to 6 decimal places");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    [".5", 0.5],
    ["10", 10],
    ["1.123456", 1.123456],
  ])("sends the quantity %j as the number %d", async (q, expected) => {
    const fetchFn = stubFetch(ok("buy", expected));
    render(<TradeBar />);
    fill("AAPL", q);
    click("trade-buy");
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    expect(sentBody(fetchFn).quantity).toBe(expected);
  });

  it("sends the ticker trimmed and uncut, with the chosen side", async () => {
    const fetchFn = stubFetch(ok("sell", 1));
    render(<TradeBar />);
    fill("  abcdefghijklmnop  ", "1");
    click("trade-sell");
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    expect(sentBody(fetchFn)).toEqual({ ticker: "abcdefghijklmnop", quantity: 1, side: "sell" });
  });
});

describe("TradeBar request lifecycle", () => {
  it("locks both buttons while pending and sends only one request", () => {
    const fetchFn = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchFn);
    render(<TradeBar />);
    fill("AAPL", "1");
    click("trade-buy");
    expect(screen.getByTestId("trade-buy")).toBeDisabled();
    expect(screen.getByTestId("trade-sell")).toBeDisabled();
    expect(message()).toHaveTextContent("Placing order...");
    expect(message()).toHaveAttribute("data-kind", "pending");
    expect(screen.getByTestId("trade-bar")).toHaveAttribute("aria-busy", "true");
    click("trade-buy");
    click("trade-sell");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("shows a server error verbatim, keeps inputs and leaves the portfolio alone", async () => {
    stubFetch(failure("Insufficient cash"));
    render(<TradeBar />);
    fill("AAPL", "5");
    click("trade-buy");
    await waitFor(() => expect(message()).toHaveAttribute("data-kind", "error"));
    expect(message()).toHaveTextContent("Insufficient cash");
    expect(message()).toHaveClass("text-down");
    expect(ticker()).toHaveValue("AAPL");
    expect(quantity()).toHaveValue("5");
    expect(usePortfolioStore.getState().portfolio).toBeNull();
  });

  it("shows the long server text truncated with the full text in the title", async () => {
    const long = "Invalid ticker: " + "X".repeat(200);
    stubFetch(failure(long));
    render(<TradeBar />);
    fill("AAPL", "1");
    click("trade-buy");
    await waitFor(() => expect(message()).toHaveAttribute("data-kind", "error"));
    expect(message()).toHaveAttribute("title", long);
    expect(message()).toHaveClass("truncate");
  });

  it("shows the network copy when fetch rejects, and re-enables the buttons", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    render(<TradeBar />);
    fill("AAPL", "1");
    click("trade-buy");
    await waitFor(() => expect(message()).toHaveTextContent(NETWORK_ERROR));
    expect(screen.getByTestId("trade-buy")).toBeEnabled();
    expect(screen.getByTestId("trade-sell")).toBeEnabled();
  });

  it("shows the network copy for a 500 whose body is not JSON", async () => {
    stubFetch({
      ok: false,
      status: 500,
      json: async () => {
        throw new SyntaxError("not json");
      },
    });
    render(<TradeBar />);
    fill("AAPL", "1");
    click("trade-sell");
    await waitFor(() => expect(message()).toHaveTextContent(NETWORK_ERROR));
    expect(screen.getByTestId("trade-sell")).toBeEnabled();
  });

  it("confirms a buy, clears the quantity, applies the portfolio and focuses the quantity", async () => {
    stubFetch(ok("buy", 1.5));
    render(<TradeBar />);
    fill("AAPL", "1.5");
    click("trade-buy");
    await waitFor(() => expect(message()).toHaveAttribute("data-kind", "success"));
    expect(message()).toHaveTextContent("Bought 1.5 AAPL at $190.12");
    expect(message()).toHaveClass("text-fg");
    expect(quantity()).toHaveValue("");
    expect(ticker()).toHaveValue("AAPL");
    expect(usePortfolioStore.getState().portfolio).toEqual(after);
    expect(document.activeElement).toBe(quantity());
  });

  it("confirms a sell", async () => {
    stubFetch(ok("sell", 2));
    render(<TradeBar />);
    fill("AAPL", "2");
    click("trade-sell");
    await waitFor(() => expect(message()).toHaveTextContent("Sold 2 AAPL at $190.12"));
  });
});

describe("TradeBar interaction", () => {
  it("never submits from Enter or a form submit", () => {
    const fetchFn = stubFetch(ok("buy", 1));
    render(<TradeBar />);
    fill("AAPL", "1");
    fireEvent.keyDown(quantity(), { key: "Enter" });
    fireEvent.submit(screen.getByTestId("trade-bar"));
    expect(fetchFn).not.toHaveBeenCalled();
    expect(message()).toHaveAttribute("data-kind", "idle");
    expect(screen.getByTestId("trade-buy")).toHaveAttribute("type", "button");
    expect(screen.getByTestId("trade-sell")).toHaveAttribute("type", "button");
  });

  it.each(["ticker", "quantity"])("clears an error message when the %s is edited", (field) => {
    stubFetch(ok("buy", 1));
    render(<TradeBar />);
    fill("", "");
    click("trade-buy");
    expect(message()).toHaveAttribute("data-kind", "error");
    act(() => type(field === "ticker" ? ticker() : quantity(), "x"));
    expect(message()).toHaveAttribute("data-kind", "idle");
    expect(message()).toHaveTextContent("");
  });
});
