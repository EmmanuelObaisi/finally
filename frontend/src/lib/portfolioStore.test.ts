import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialPortfolioState, resetPortfolioStore, usePortfolioStore } from "./portfolioStore";
import type { Portfolio } from "./types";

const portfolio = (cash: number): Portfolio => ({ cash, total_value: cash, unrealized_pnl: 0, positions: [] });

/** A fetch whose responses are settled by hand, in the order the calls were made. */
function manualFetch() {
  const pending: { resolve: (p: Portfolio) => void; reject: () => void }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise((resolve, reject) => {
          pending.push({
            resolve: (p) => resolve({ ok: true, status: 200, json: async () => p }),
            reject: () => reject(new Error("down")),
          });
        }),
    ),
  );
  return pending;
}

const settle = () => new Promise((r) => setTimeout(r, 0));
const state = () => usePortfolioStore.getState();

beforeEach(() => resetPortfolioStore());

describe("portfolio store", () => {
  it("load applies the fetched portfolio and clears failed", async () => {
    const calls = manualFetch();
    state().load();
    calls[0].resolve(portfolio(10000));
    await settle();
    expect(state().portfolio?.cash).toBe(10000);
    expect(state().failed).toBe(false);
  });

  it("a rejected load with no portfolio yet sets failed", async () => {
    const calls = manualFetch();
    state().load();
    calls[0].reject();
    await settle();
    expect(state().failed).toBe(true);
    expect(state().portfolio).toBeNull();
  });

  it("a rejected load keeps an existing portfolio", async () => {
    const calls = manualFetch();
    state().applyTrade(portfolio(500));
    state().load();
    calls[0].reject();
    await settle();
    expect(state().portfolio?.cash).toBe(500);
  });

  it("applyTrade replaces the portfolio at once and clears failed", () => {
    usePortfolioStore.setState({ failed: true });
    state().applyTrade(portfolio(900));
    expect(state().portfolio?.cash).toBe(900);
    expect(state().failed).toBe(false);
  });

  it("a load started before applyTrade is ignored when it resolves afterwards", async () => {
    const calls = manualFetch();
    state().load();
    state().applyTrade(portfolio(900));
    calls[0].resolve(portfolio(10000));
    await settle();
    expect(state().portfolio?.cash).toBe(900);
  });

  it("the later-started of two overlapping loads wins even when it resolves first", async () => {
    const calls = manualFetch();
    state().load();
    state().load();
    calls[1].resolve(portfolio(2));
    await settle();
    calls[0].resolve(portfolio(1));
    await settle();
    expect(state().portfolio?.cash).toBe(2);
  });

  it("reset restores the initial state and the ticket counters", async () => {
    const calls = manualFetch();
    state().applyTrade(portfolio(900));
    resetPortfolioStore();
    expect(state().portfolio).toBeNull();
    expect(state().failed).toBe(false);
    state().load();
    calls[0].resolve(portfolio(10000));
    await settle();
    expect(state().portfolio?.cash).toBe(10000);
    expect(initialPortfolioState()).toEqual({ portfolio: null, failed: false });
  });
});

describe("portfolio store load start", () => {
  it("load clears failed when it starts", () => {
    manualFetch();
    usePortfolioStore.setState({ failed: true });
    state().load();
    expect(state().failed).toBe(false);
  });
});
