import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetChatStore, useChatStore } from "../lib/chatStore";
import { resetPortfolioStore } from "../lib/portfolioStore";
import type { ChatMessage, ChatReply } from "../lib/types";
import { resetWatchlistStore } from "../lib/watchlistStore";
import ChatPanel from "./ChatPanel";

const reply = (message: string): ChatReply => ({
  message,
  actions: [],
  portfolio: { cash: 10000, total_value: 10000, unrealized_pnl: 0, positions: [] },
  watchlist: [],
});

const stored = (role: "user" | "assistant", content: string, id = role + content): ChatMessage => ({
  id,
  role,
  content,
  actions: null,
  created_at: "2026-10-09T10:05:00Z",
});

type Json = { ok: boolean; status: number; json: () => Promise<unknown> };
const okJson = (value: unknown): Json => ({ ok: true, status: 200, json: async () => value });

/** Routes history through a replaceable handler and chat to a reply the test settles by hand. */
function stubFetch(history: () => Promise<Json>) {
  let settleChat: (value: Json) => void = () => {};
  let historyImpl = history;
  const fn = vi.fn((url: string, _init?: RequestInit) => {
    if (url === "/api/chat/history") return historyImpl();
    return new Promise<Json>((resolve) => {
      settleChat = resolve;
    });
  });
  vi.stubGlobal("fetch", fn);
  return {
    fn,
    setHistory: (impl: () => Promise<Json>) => (historyImpl = impl),
    settleChat: (value: ChatReply) => settleChat(okJson(value)),
    failChat: (status: number, error: string) => settleChat({ ok: false, status, json: async () => ({ error }) }),
  };
}

const historyOf = (messages: ChatMessage[]) => () => Promise.resolve(okJson({ messages }));
const historyFails = () => Promise.reject(new Error("down"));
const historyNever = () => new Promise<Json>(() => {});

const media = (matches: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({ matches, media: query, addEventListener: () => {}, removeEventListener: () => {} }));

const input = () => screen.getByTestId("chat-input") as HTMLTextAreaElement;
const type = (value: string) => fireEvent.change(input(), { target: { value } });
const calls = (fn: ReturnType<typeof stubFetch>["fn"], url: string) => fn.mock.calls.filter(([u]) => u === url);

beforeEach(() => {
  resetChatStore();
  resetPortfolioStore();
  resetWatchlistStore();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("history loading", () => {
  it("shows a three-block busy skeleton and disables the composer", async () => {
    stubFetch(historyNever);
    render(<ChatPanel />);
    const loading = await screen.findByTestId("chat-history-loading");
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(loading).toHaveAttribute("aria-label", "Loading conversation");
    expect(loading.children).toHaveLength(3);
    expect(loading.textContent).toBe("");
    expect(input()).toBeDisabled();
    expect(screen.getByTestId("chat-send")).toBeDisabled();
    expect(screen.queryByTestId("chat-empty")).toBeNull();
    expect(screen.queryAllByTestId(/^chat-message-/)).toHaveLength(0);
  });
});

describe("history error and Retry", () => {
  it("shows the unavailable block without a status code and keeps sending possible", async () => {
    const { settleChat } = stubFetch(historyFails);
    render(<ChatPanel />);
    const block = await screen.findByTestId("chat-history-error");
    expect(block).toHaveTextContent("Conversation unavailable");
    expect(block).toHaveTextContent("The server did not return your chat history. Check that FinAlly is running, then retry.");
    expect(block.textContent).not.toMatch(/\d{3}/);
    expect(screen.getByTestId("chat-retry")).toHaveTextContent("Retry");
    expect(input()).toBeEnabled();

    type("hello");
    fireEvent.keyDown(input(), { key: "Enter" });
    await screen.findByTestId("chat-loading");
    await act(async () => settleChat(reply("Hi there")));

    const user = screen.getByTestId("chat-message-user");
    const assistant = screen.getByTestId("chat-message-assistant");
    expect(block.compareDocumentPosition(user) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(user.compareDocumentPosition(assistant) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("Retry shows the skeleton, then replaces local rows with the server list", async () => {
    const { setHistory, failChat } = stubFetch(historyFails);
    render(<ChatPanel />);
    await screen.findByTestId("chat-history-error");
    type("hello");
    fireEvent.keyDown(input(), { key: "Enter" });
    await screen.findByTestId("chat-loading");
    await act(async () => failChat(400, "Message must not be empty"));
    expect(screen.getByTestId("chat-message-user")).toBeInTheDocument();

    let resolve: (value: Json) => void = () => {};
    setHistory(() => new Promise<Json>((r) => (resolve = r)));
    fireEvent.click(screen.getByTestId("chat-retry"));
    expect(await screen.findByTestId("chat-history-loading")).toBeInTheDocument();

    await act(async () => resolve(okJson({ messages: [stored("assistant", "Stored while down")] })));
    expect(screen.queryByTestId("chat-history-error")).toBeNull();
    expect(screen.queryByTestId("chat-history-loading")).toBeNull();
    expect(screen.queryByTestId("chat-message-user")).toBeNull();
    expect(screen.queryByTestId("chat-error")).toBeNull();
    expect(screen.getByTestId("chat-message-assistant")).toHaveTextContent("Stored while down");
  });

  it("a second failure renders the error block and Retry again", async () => {
    stubFetch(historyFails);
    render(<ChatPanel />);
    fireEvent.click(await screen.findByTestId("chat-retry"));
    expect(await screen.findByTestId("chat-history-error")).toBeInTheDocument();
    expect(screen.getByTestId("chat-retry")).toBeEnabled();
  });

  it("Retry is disabled while a reply is pending and issues no history request", async () => {
    const { fn } = stubFetch(historyFails);
    render(<ChatPanel />);
    await screen.findByTestId("chat-history-error");
    type("hello");
    fireEvent.keyDown(input(), { key: "Enter" });
    await screen.findByTestId("chat-loading");

    const retry = screen.getByTestId("chat-retry");
    expect(retry).toBeDisabled();
    fireEvent.click(retry);
    expect(calls(fn, "/api/chat/history")).toHaveLength(1);
  });
});

describe("empty block and example prompts", () => {
  it("shows the heading, body, caption and three example buttons", async () => {
    stubFetch(historyOf([]));
    render(<ChatPanel />);
    const empty = await screen.findByTestId("chat-empty");
    expect(empty).toHaveTextContent("Ask FinAlly anything");
    expect(empty).toHaveTextContent("Ask about your portfolio, or tell FinAlly to trade or change your watchlist.");
    expect(empty).toHaveTextContent("Try");
    const examples = screen.getAllByTestId("chat-example");
    expect(examples.map((b) => b.textContent)).toEqual([
      "How is my portfolio doing?",
      "Buy 5 shares of NVDA",
      "Add PYPL to my watchlist",
    ]);
    for (const button of examples) {
      expect(button).toHaveAttribute("type", "button");
      expect(button).toHaveClass("h-8", "truncate");
    }
  });

  it("clicking an example fills and focuses the textarea and sends nothing", async () => {
    const { fn } = stubFetch(historyOf([]));
    render(<ChatPanel />);
    await screen.findByTestId("chat-empty");
    await waitFor(() => expect(input()).toBeEnabled());
    fireEvent.click(screen.getAllByTestId("chat-example")[1]);
    expect(input()).toHaveValue("Buy 5 shares of NVDA");
    expect(document.activeElement).toBe(input());
    expect(screen.getByTestId("chat-send")).toBeEnabled();
    expect(calls(fn, "/api/chat")).toHaveLength(0);
  });
});

describe("zero, one, many", () => {
  it("one stored message renders one row and no empty block", async () => {
    stubFetch(historyOf([stored("user", "hi")]));
    render(<ChatPanel />);
    expect(await screen.findAllByTestId("chat-message-user")).toHaveLength(1);
    expect(screen.queryByTestId("chat-empty")).toBeNull();
  });

  it("100 stored messages render 100 rows inside a scrolling box", async () => {
    const many = Array.from({ length: 100 }, (_, i) => stored(i % 2 ? "assistant" : "user", "m" + i, "id" + i));
    stubFetch(historyOf(many));
    render(<ChatPanel />);
    await screen.findAllByTestId("chat-message-user");
    expect(screen.getAllByTestId(/^chat-message-(user|assistant)$/)).toHaveLength(100);
    expect(screen.getByTestId("chat-messages").className).toContain("overflow-y-auto");
  });

  it("a first send with zero messages replaces the empty block with the user row and loading row", async () => {
    stubFetch(historyOf([]));
    render(<ChatPanel />);
    await screen.findByTestId("chat-empty");
    await waitFor(() => expect(input()).toBeEnabled());
    type("hello");
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(await screen.findByTestId("chat-loading")).toBeInTheDocument();
    expect(screen.getByTestId("chat-message-user")).toHaveTextContent("hello");
    expect(screen.queryByTestId("chat-empty")).toBeNull();
  });
});

describe("panel closed", () => {
  it("keeps a reply that arrives while closed and re-pins the transcript on open", async () => {
    media(false);
    const { settleChat } = stubFetch(historyOf([]));
    render(<ChatPanel />);
    await waitFor(() => expect(input()).toBeEnabled());
    expect(screen.getByTestId("chat-panel")).toHaveAttribute("data-open", "false");

    let pending: Promise<boolean> = Promise.resolve(true);
    act(() => {
      pending = useChatStore.getState().send("hello");
    });
    await act(async () => settleChat(reply("Done while closed")));
    await pending;
    expect(screen.getByTestId("chat-message-assistant")).toHaveTextContent("Done while closed");

    const original = Object.getOwnPropertyDescriptor(Element.prototype, "scrollHeight");
    Object.defineProperty(Element.prototype, "scrollHeight", { configurable: true, get: () => 640 });
    try {
      const box = screen.getByTestId("chat-messages");
      box.scrollTop = 0;
      act(() => useChatStore.getState().setOpen(true));
      expect(screen.getByTestId("chat-panel")).toHaveAttribute("data-open", "true");
      expect(box.scrollTop).toBe(640);
    } finally {
      if (original) Object.defineProperty(Element.prototype, "scrollHeight", original);
      else delete (Element.prototype as unknown as Record<string, unknown>).scrollHeight;
    }
  });
});
