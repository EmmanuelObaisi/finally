import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialMarketState, useMarketStore } from "../lib/store";
import type { Portfolio } from "../lib/types";
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
