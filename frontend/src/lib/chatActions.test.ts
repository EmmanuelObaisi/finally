import { describe, expect, it } from "vitest";
import { actionText } from "./chatActions";
import type { ChatAction } from "./types";

type Trade = Extract<ChatAction, { type: "trade" }>;
type Watch = Extract<ChatAction, { type: "watchlist" }>;

const trade = (over: Partial<Trade>): ChatAction => ({
  type: "trade",
  ticker: "AAPL",
  side: "buy",
  quantity: 5,
  price: 190.12,
  ok: true,
  error: null,
  ...over,
});

const watch = (over: Partial<Watch>): ChatAction => ({
  type: "watchlist",
  ticker: "PYPL",
  action: "add",
  ok: true,
  error: null,
  ...over,
});

describe("actionText trades", () => {
  it.each([
    [trade({}), "Bought 5 AAPL at $190.12"],
    [trade({ side: "sell" }), "Sold 5 AAPL at $190.12"],
    [trade({ quantity: 1.5 }), "Bought 1.5 AAPL at $190.12"],
    [trade({ quantity: 0.123456 }), "Bought 0.123456 AAPL at $190.12"],
    [trade({ price: null }), "Bought 5 AAPL at --"],
    [trade({ ok: false, error: "Insufficient cash" }), "Could not buy 5 AAPL: Insufficient cash"],
    [
      trade({ ok: false, side: "sell", quantity: 20, price: null, error: "Insufficient shares: you hold 10 AAPL" }),
      "Could not sell 20 AAPL: Insufficient shares: you hold 10 AAPL",
    ],
  ])("%j -> %s", (action, text) => {
    expect(actionText(action)).toBe(text);
  });
});

describe("actionText watchlist", () => {
  it.each([
    [watch({}), "Added PYPL to watchlist"],
    [watch({ action: "remove" }), "Removed PYPL from watchlist"],
    [watch({ ticker: "XYZ", ok: false, error: "Unknown ticker" }), "Could not add XYZ: Unknown ticker"],
    [
      watch({ action: "remove", ok: false, error: "Ticker not in watchlist" }),
      "Could not remove PYPL: Ticker not in watchlist",
    ],
  ])("%j -> %s", (action, text) => {
    expect(actionText(action)).toBe(text);
  });
});

describe("actionText verbatim errors", () => {
  it("prints a 200-character error in full", () => {
    const error = "E".repeat(200);
    expect(actionText(trade({ ok: false, error }))).toBe("Could not buy 5 AAPL: " + error);
  });

  it("returns angle-bracket markup as the same literal string", () => {
    const error = "<img src=x onerror=alert(1)>";
    expect(actionText(watch({ ok: false, error }))).toBe("Could not add PYPL: " + error);
  });
});
