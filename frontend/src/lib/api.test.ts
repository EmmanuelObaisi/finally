import { afterEach, describe, expect, it, vi } from "vitest";
import { getPortfolio, getPortfolioHistory, NETWORK_ERROR, postTrade } from "./api";

const reply = (ok: boolean, status: number, body: () => Promise<unknown>) => ({ ok, status, json: body });

afterEach(() => vi.unstubAllGlobals());

describe("postTrade", () => {
  it("posts the trade as JSON and resolves the parsed body", async () => {
    const body = { trade: { id: "t1" }, portfolio: { cash: 1 } };
    const fetchFn = vi.fn(async () => reply(true, 200, async () => body));
    vi.stubGlobal("fetch", fetchFn);
    await expect(postTrade("AAPL", 1.5, "buy")).resolves.toEqual(body);
    expect(fetchFn).toHaveBeenCalledWith("/api/portfolio/trade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker: "AAPL", quantity: 1.5, side: "buy" }),
    });
  });

  it("rejects with the server error text on a 400", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(false, 400, async () => ({ error: "Insufficient cash" }))));
    await expect(postTrade("AAPL", 1, "buy")).rejects.toThrow("Insufficient cash");
  });

  it("rejects with NETWORK_ERROR when the error body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reply(false, 500, async () => {
          throw new SyntaxError("not json");
        }),
      ),
    );
    await expect(postTrade("AAPL", 1, "buy")).rejects.toThrow(NETWORK_ERROR);
  });

  it("rejects with NETWORK_ERROR when fetch itself rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(postTrade("AAPL", 1, "buy")).rejects.toThrow(NETWORK_ERROR);
  });
});

describe("GET helpers", () => {
  it("getPortfolio never echoes the status body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(false, 503, async () => ({ error: "secret detail" }))));
    const error = await getPortfolio().catch((e: Error) => e);
    expect((error as Error).message).not.toContain("secret detail");
  });

  it("getPortfolioHistory resolves the history array of the body", async () => {
    const history = [{ total_value: 10000, recorded_at: "2026-10-09T10:00:00Z" }];
    const fetchFn = vi.fn(async () => reply(true, 200, async () => ({ history })));
    vi.stubGlobal("fetch", fetchFn);
    await expect(getPortfolioHistory()).resolves.toEqual(history);
    expect(fetchFn).toHaveBeenCalledWith("/api/portfolio/history");
  });

  it("getPortfolioHistory never echoes the status body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(false, 503, async () => ({ error: "secret detail" }))));
    const error = await getPortfolioHistory().catch((e: Error) => e);
    expect((error as Error).message).toBe("history 503");
    expect((error as Error).message).not.toContain("secret detail");
  });
});
