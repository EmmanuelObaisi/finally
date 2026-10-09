import { beforeEach, describe, expect, it, vi } from "vitest";
import { NETWORK_ERROR } from "./api";
import { initialChatState, resetChatStore, useChatStore } from "./chatStore";
import { resetPortfolioStore, usePortfolioStore } from "./portfolioStore";
import { resetSelectionStore } from "./selectionStore";
import { initialMarketState, useMarketStore } from "./store";
import type { ChatMessage, ChatReply, Portfolio, WatchlistItem } from "./types";
import { resetWatchlistStore, useWatchlistStore } from "./watchlistStore";

const portfolio = (cash: number): Portfolio => ({ cash, total_value: cash, unrealized_pnl: 0, positions: [] });

const REPLY: ChatReply = {
  message: "Bought 5 AAPL",
  actions: [{ type: "trade", ticker: "AAPL", side: "buy", quantity: 5, price: 190, ok: true, error: null }],
  portfolio: portfolio(9050),
  watchlist: [],
};

/** A fetch whose responses are settled by hand, in the order the calls were made. */
function manualFetch() {
  const pending: { respond: (status: number, body: unknown) => void; reject: () => void }[] = [];
  const fn = vi.fn(
    () =>
      new Promise((resolve, reject) => {
        pending.push({
          respond: (status, body) => resolve({ ok: status < 300, status, json: async () => body }),
          reject: () => reject(new TypeError("Failed to fetch")),
        });
      }),
  );
  vi.stubGlobal("fetch", fn);
  return { fn, pending };
}

const state = () => useChatStore.getState();
const history = (...contents: string[]): ChatMessage[] =>
  contents.map((content, i) => ({
    id: String(i),
    role: i % 2 === 0 ? "user" : "assistant",
    content,
    actions: null,
    created_at: "2026-10-09T10:00:00Z",
  }));

beforeEach(() => {
  vi.unstubAllGlobals();
  resetChatStore();
  resetWatchlistStore();
  resetPortfolioStore();
  resetSelectionStore();
  useMarketStore.setState(initialMarketState());
});

describe("chat store panel state", () => {
  it("starts closed with no messages and history loading", () => {
    expect(state()).toMatchObject(initialChatState());
    expect(initialChatState()).toEqual({
      open: false,
      focusSeq: 0,
      messages: [],
      history: "loading",
      sending: false,
      localError: null,
    });
  });

  it("toggle increments focusSeq only when it opens", () => {
    state().toggle();
    expect(state()).toMatchObject({ open: true, focusSeq: 1 });
    state().toggle();
    expect(state()).toMatchObject({ open: false, focusSeq: 1 });
  });

  it("setOpen never changes focusSeq", () => {
    state().setOpen(true);
    state().setOpen(false);
    expect(state()).toMatchObject({ open: false, focusSeq: 0 });
  });

  it("reset restores the initial state and the local id counter", async () => {
    const first = manualFetch();
    const sent = state().send("one");
    expect(state().messages[0].id).toBe("local-1");
    first.pending[0].reject();
    await sent;
    resetChatStore();
    expect(state()).toMatchObject(initialChatState());
    const second = manualFetch();
    const again = state().send("two");
    expect(state().messages[0].id).toBe("local-1");
    second.pending[0].reject();
    await again;
  });
});

describe("chat store history", () => {
  it("loadHistory keeps the server order and marks history ready", async () => {
    const { pending } = manualFetch();
    const loading = state().loadHistory();
    expect(state().history).toBe("loading");
    pending[0].respond(200, { messages: history("a", "b", "c") });
    await loading;
    expect(state().messages.map((m) => m.content)).toEqual(["a", "b", "c"]);
    expect(state().history).toBe("ready");
    expect(state().localError).toBeNull();
  });

  it("a failed loadHistory sets error and keeps the held messages", async () => {
    useChatStore.setState({ messages: history("kept") });
    const { pending } = manualFetch();
    const loading = state().loadHistory();
    pending[0].respond(503, { error: "x" });
    await loading;
    expect(state().history).toBe("error");
    expect(state().messages.map((m) => m.content)).toEqual(["kept"]);
  });

  it("loadHistory is ignored while a reply is pending", async () => {
    const { fn, pending } = manualFetch();
    const sent = state().send("hi");
    await state().loadHistory();
    expect(fn).toHaveBeenCalledTimes(1);
    pending[0].respond(200, REPLY);
    await sent;
  });

  it("a successful retry replaces optimistic messages and clears localError", async () => {
    const { pending } = manualFetch();
    const sent = state().send("lost");
    pending[0].reject();
    await sent;
    expect(state().localError).not.toBeNull();
    const loading = state().loadHistory();
    pending[1].respond(200, { messages: history("server") });
    await loading;
    expect(state().messages.map((m) => m.content)).toEqual(["server"]);
    expect(state().localError).toBeNull();
  });
});

describe("chat store send", () => {
  it("appends an optimistic user message and sets sending while pending", async () => {
    const { pending } = manualFetch();
    const sent = state().send("buy 5 AAPL");
    expect(state().sending).toBe(true);
    expect(state().messages).toHaveLength(1);
    expect(state().messages[0]).toMatchObject({ role: "user", content: "buy 5 AAPL", actions: null });
    expect(state().messages[0].id).toMatch(/^local-/);
    pending[0].respond(200, REPLY);
    await sent;
  });

  it("on success appends the assistant message and pushes to the other stores", async () => {
    const { fn, pending } = manualFetch();
    const watchlist = [{ ticker: "PYPL" }] as WatchlistItem[];
    const sent = state().send("buy 5 AAPL");
    pending[0].respond(200, { ...REPLY, watchlist });
    await expect(sent).resolves.toBe(true);
    const last = state().messages[state().messages.length - 1];
    expect(last).toMatchObject({ role: "assistant", content: "Bought 5 AAPL", actions: REPLY.actions });
    expect(state().sending).toBe(false);
    expect(fn).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ message: "buy 5 AAPL" }) }),
    );
    expect(usePortfolioStore.getState().portfolio).toEqual(REPLY.portfolio);
    expect(useWatchlistStore.getState().pushed).toEqual(watchlist);
    expect(useWatchlistStore.getState().seq).toBe(1);
  });

  it("a second send while one is pending returns false and issues no request", async () => {
    const { fn, pending } = manualFetch();
    const first = state().send("one");
    await expect(state().send("two")).resolves.toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(state().messages).toHaveLength(1);
    pending[0].respond(200, REPLY);
    await expect(first).resolves.toBe(true);
  });

  it("an LLM-failure reply is an ordinary assistant message", async () => {
    const { pending } = manualFetch();
    const text =
      "The AI assistant could not complete that request. No trades or watchlist changes were made. Try again in a moment.";
    const sent = state().send("hi");
    pending[0].respond(200, { ...REPLY, message: text, actions: [] });
    await expect(sent).resolves.toBe(true);
    expect(state().messages[1]).toMatchObject({ role: "assistant", content: text, actions: [] });
    expect(state().localError).toBeNull();
    expect(usePortfolioStore.getState().portfolio).toEqual(REPLY.portfolio);
    expect(useWatchlistStore.getState().seq).toBe(1);
  });

  it("a 400 sets localError with the server text and touches nothing else", async () => {
    const { pending } = manualFetch();
    const sent = state().send("x".repeat(3000));
    pending[0].respond(400, { error: "Message is too long" });
    await expect(sent).resolves.toBe(false);
    expect(state().localError).toEqual({ text: "Message is too long", network: false });
    expect(state().messages).toHaveLength(1);
    expect(state().messages[0].role).toBe("user");
    expect(state().sending).toBe(false);
    expect(usePortfolioStore.getState().portfolio).toBeNull();
    expect(useWatchlistStore.getState().seq).toBe(0);
  });

  it("a network failure sets the network error and is never retried", async () => {
    const { fn, pending } = manualFetch();
    const sent = state().send("hi");
    pending[0].reject();
    await expect(sent).resolves.toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(state().localError).toEqual({ text: NETWORK_ERROR, network: true });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("stores a reply that arrives while the panel is closed", async () => {
    const { pending } = manualFetch();
    expect(state().open).toBe(false);
    const sent = state().send("hi");
    pending[0].respond(200, REPLY);
    await sent;
    expect(state().messages).toHaveLength(2);
    expect(state().open).toBe(false);
  });

  it("sends while the price stream is disconnected", async () => {
    useMarketStore.getState().setStatus("disconnected");
    const { pending } = manualFetch();
    const sent = state().send("hi");
    pending[0].respond(200, REPLY);
    await expect(sent).resolves.toBe(true);
  });

  it("a new send clears the previous localError", async () => {
    const { pending } = manualFetch();
    const first = state().send("one");
    pending[0].reject();
    await first;
    expect(state().localError).not.toBeNull();
    const second = state().send("two");
    expect(state().localError).toBeNull();
    pending[1].respond(200, REPLY);
    await second;
  });
});
