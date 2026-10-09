import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetChatStore, useChatStore } from "../lib/chatStore";
import { resetPortfolioStore, usePortfolioStore } from "../lib/portfolioStore";
import type { ChatAction, ChatMessage, ChatReply, Portfolio } from "../lib/types";
import { resetWatchlistStore } from "../lib/watchlistStore";
import ChatPanel from "./ChatPanel";

const after: Portfolio = { cash: 9050, total_value: 10000, unrealized_pnl: 0, positions: [] };
const TRADE_OK: ChatAction = { type: "trade", ticker: "AAPL", side: "buy", quantity: 5, price: 190, ok: true, error: null };
const WATCH_FAIL: ChatAction = {
  type: "watchlist",
  ticker: "PYPL",
  action: "add",
  ok: false,
  error: "Unknown ticker",
};

const reply = (message: string, actions: ChatAction[] = []): ChatReply => ({
  message,
  actions,
  portfolio: after,
  watchlist: [],
});

const stored = (role: "user" | "assistant", content: string, actions: ChatAction[] | null = null): ChatMessage => ({
  id: role + content,
  role,
  content,
  actions,
  created_at: "2026-10-09T10:05:00Z",
});

/** Routes history to a fixed list and chat to a reply the test settles by hand. */
function stubFetch(messages: ChatMessage[] = []) {
  let settle: (value: ChatReply) => void = () => {};
  const fn = vi.fn((url: string, _init?: RequestInit) => {
    if (url === "/api/chat/history") return Promise.resolve({ ok: true, status: 200, json: async () => ({ messages }) });
    return new Promise((resolve) => {
      settle = (value) => resolve({ ok: true, status: 200, json: async () => value });
    });
  });
  vi.stubGlobal("fetch", fn);
  return { fn, settle: (value: ChatReply) => settle(value) };
}

const media = (matches: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({ matches, media: query, addEventListener: () => {}, removeEventListener: () => {} }));

const input = () => screen.getByTestId("chat-input") as HTMLTextAreaElement;
const enter = (shiftKey = false) => fireEvent.keyDown(input(), { key: "Enter", shiftKey });
const type = (value: string) => fireEvent.change(input(), { target: { value } });
const chatCalls = (fn: ReturnType<typeof stubFetch>["fn"]) => fn.mock.calls.filter(([url]) => url === "/api/chat");

async function ready() {
  await waitFor(() => expect(input()).toBeEnabled());
}

function stubScrollHeight(value: number) {
  const original = Object.getOwnPropertyDescriptor(Element.prototype, "scrollHeight");
  Object.defineProperty(Element.prototype, "scrollHeight", { configurable: true, get: () => value });
  return () => {
    if (original) Object.defineProperty(Element.prototype, "scrollHeight", original);
    else delete (Element.prototype as unknown as Record<string, unknown>).scrollHeight;
  };
}

let restoreScroll: (() => void) | null = null;

beforeEach(() => {
  resetChatStore();
  resetPortfolioStore();
  resetWatchlistStore();
});

afterEach(() => {
  restoreScroll?.();
  restoreScroll = null;
});

describe("ChatPanel send flow", () => {
  it("Enter sends, shows the loading row, then the reply with action lines", async () => {
    restoreScroll = stubScrollHeight(480);
    const { fn, settle } = stubFetch();
    render(<ChatPanel />);
    await ready();
    type("buy 5 AAPL and add PYPL");
    enter();

    expect(await screen.findByTestId("chat-message-user")).toHaveTextContent("buy 5 AAPL and add PYPL");
    expect(input()).toHaveValue("");
    expect(screen.getByTestId("chat-loading")).toHaveTextContent("Thinking...");
    expect(screen.getByTestId("chat-send")).toBeDisabled();
    expect(screen.getByTestId("chat-form")).toHaveAttribute("aria-busy", "true");

    await act(async () => settle(reply("Buying 5 AAPL now.", [TRADE_OK, WATCH_FAIL])));

    expect(screen.queryByTestId("chat-loading")).toBeNull();
    expect(screen.getByTestId("chat-message-assistant")).toHaveTextContent("Buying 5 AAPL now.");
    const rows = screen.getAllByTestId("chat-action");
    expect(rows.map((r) => r.getAttribute("data-ok"))).toEqual(["true", "false"]);
    expect(rows[1]).toHaveTextContent("Could not add PYPL: Unknown ticker");
    expect(usePortfolioStore.getState().portfolio).toEqual(after);
    expect(screen.getByTestId("chat-messages").scrollTop).toBe(480);
    expect(chatCalls(fn)).toHaveLength(1);
  });

  it("sends nothing for an empty or whitespace draft, while pending, or on Shift+Enter", async () => {
    const { fn } = stubFetch();
    render(<ChatPanel />);
    await ready();
    expect(screen.getByTestId("chat-send")).toBeDisabled();
    enter();
    type("   ");
    enter();
    expect(screen.getByTestId("chat-send")).toBeDisabled();
    type("hello");
    enter(true);
    expect(chatCalls(fn)).toHaveLength(0);

    enter();
    await screen.findByTestId("chat-loading");
    type("second");
    enter();
    expect(chatCalls(fn)).toHaveLength(1);
    expect(input()).toHaveValue("second");
  });
});

describe("ChatPanel transcript presentation", () => {
  it("renders stored history oldest first with role words and HH:mm times", async () => {
    stubFetch([stored("user", "How am I doing?"), stored("assistant", "Up 2 percent.")]);
    render(<ChatPanel />);
    const user = await screen.findByTestId("chat-message-user");
    const assistant = screen.getByTestId("chat-message-assistant");
    expect(user.compareDocumentPosition(assistant) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(user).toHaveTextContent("You");
    expect(assistant).toHaveTextContent("FinAlly");
    for (const row of [user, assistant]) {
      const time = row.querySelector(".tabular-nums");
      expect(time?.textContent).toMatch(/^\d{2}:\d{2}$/);
    }
    const userBubble = within(user).getByText("How am I doing?").parentElement!;
    expect(userBubble).toHaveClass("self-end", "max-w-72", "bg-raised", "whitespace-pre-wrap", "break-words");
    const assistantBubble = within(assistant).getByText("Up 2 percent.").parentElement!;
    expect(assistantBubble).toHaveClass("self-stretch");
    expect(assistantBubble).not.toHaveClass("bg-raised");
  });

  it("shows only action lines for an assistant message with empty text, and none for a user message", async () => {
    stubFetch([stored("user", "go", [TRADE_OK]), stored("assistant", "", [TRADE_OK, WATCH_FAIL])]);
    render(<ChatPanel />);
    const assistant = await screen.findByTestId("chat-message-assistant");
    expect(assistant.querySelector("p")).toBeNull();
    expect(within(assistant).getAllByTestId("chat-action")).toHaveLength(2);
    expect(within(screen.getByTestId("chat-message-user")).queryByTestId("chat-action")).toBeNull();
  });

  it("tags ok rows Done in text-up and failed rows Failed in text-down, errors verbatim", async () => {
    const failedBuy: ChatAction = { ...TRADE_OK, ok: false, price: null, error: "Insufficient cash" };
    const nullPrice: ChatAction = { ...TRADE_OK, price: null };
    stubFetch([stored("assistant", "ok", [nullPrice, failedBuy, WATCH_FAIL])]);
    render(<ChatPanel />);
    const [done, failed, watch] = await screen.findAllByTestId("chat-action");
    const tag = (row: HTMLElement) => row.firstElementChild!;
    expect(tag(done)).toHaveTextContent("Done");
    expect(tag(done)).toHaveClass("text-up", "w-12");
    expect(done).toHaveTextContent("Bought 5 AAPL at --");
    expect(tag(failed)).toHaveTextContent("Failed");
    expect(tag(failed)).toHaveClass("text-down", "w-12");
    expect(tag(failed)).not.toHaveTextContent("Done");
    expect(failed).toHaveTextContent("Could not buy 5 AAPL: Insufficient cash");
    expect(failed).toHaveAttribute("data-kind", "trade");
    expect(watch).toHaveAttribute("data-kind", "watchlist");
    expect(watch).toHaveTextContent("Could not add PYPL: Unknown ticker");
  });

  it("renders 20 actions in order inside one divided block and no block for zero actions", async () => {
    const many: ChatAction[] = [
      ...Array.from({ length: 10 }, (_, i) => ({ ...TRADE_OK, ticker: "T" + i })),
      ...Array.from({ length: 10 }, (_, i) => ({ ...WATCH_FAIL, ticker: "W" + i })),
    ];
    stubFetch([stored("assistant", "many", many), stored("assistant", "none", null), stored("assistant", "empty", [])]);
    render(<ChatPanel />);
    const rows = await screen.findAllByTestId("chat-action");
    expect(rows).toHaveLength(20);
    expect(rows[0]).toHaveTextContent("T0");
    expect(rows[19]).toHaveTextContent("W9");
    const block = rows[0].parentElement!;
    expect(block).toHaveClass("mt-2", "border-t", "pt-2");
    expect(rows.every((r) => r.parentElement === block)).toBe(true);
    const [, none, empty] = screen.getAllByTestId("chat-message-assistant");
    for (const message of [none, empty]) {
      expect(within(message).queryByTestId("chat-action")).toBeNull();
      expect(message.querySelector(".border-t")).toBeNull();
    }
  });

  it("renders markup in a message and an action ticker literally", async () => {
    const markup = "<img src=x onerror=alert(1)> <b>bold</b>";
    const hostile: ChatAction = { ...WATCH_FAIL, ticker: "<b>X</b>" };
    stubFetch([stored("assistant", markup, [hostile])]);
    render(<ChatPanel />);
    const message = await screen.findByTestId("chat-message-assistant");
    expect(message.querySelector("img, b")).toBeNull();
    expect(within(message).getByText(markup)).toBeInTheDocument();
    expect(screen.getByTestId("chat-action")).toHaveTextContent("Could not add <b>X</b>: Unknown ticker");
  });
});

describe("ChatPanel open state", () => {
  it("opens by default when the 1536px query matches and loads history once", async () => {
    media(true);
    const { fn } = stubFetch();
    render(<ChatPanel />);
    const panel = screen.getByTestId("chat-panel");
    await waitFor(() => expect(panel).toHaveAttribute("data-open", "true"));
    expect(panel).toHaveClass("fixed", "top-12", "bottom-8", "z-20", "sm:w-90", "2xl:static", "bg-panel");
    expect(panel).toHaveAttribute("id", "chat-panel");
    expect(panel).toHaveAttribute("aria-label", "FinAlly AI chat");
    await ready();
    expect(fn.mock.calls.filter(([url]) => url === "/api/chat/history")).toHaveLength(1);
  });

  it("starts closed but mounted when the query does not match", async () => {
    media(false);
    const { fn } = stubFetch();
    render(<ChatPanel />);
    const panel = screen.getByTestId("chat-panel");
    expect(panel).toHaveAttribute("data-open", "false");
    expect(panel).toHaveClass("hidden");
    expect(panel).toBeInTheDocument();
    await ready();
    expect(fn.mock.calls.filter(([url]) => url === "/api/chat/history")).toHaveLength(1);
  });

  it("Close hides without unmounting and a draft survives reopening", async () => {
    media(true);
    stubFetch();
    render(<ChatPanel />);
    await waitFor(() => expect(screen.getByTestId("chat-panel")).toHaveAttribute("data-open", "true"));
    await ready();
    type("half typed");
    fireEvent.click(screen.getByTestId("chat-close"));
    expect(screen.getByTestId("chat-panel")).toHaveAttribute("data-open", "false");
    expect(screen.getByTestId("chat-close")).toHaveAttribute("aria-label", "Close AI chat");
    act(() => useChatStore.getState().setOpen(true));
    expect(screen.getByTestId("chat-panel")).toHaveAttribute("data-open", "true");
    expect(input()).toHaveValue("half typed");
  });
});

describe("ChatPanel auto-scroll", () => {
  it("pins the transcript to the bottom after history loads, on a new message and on the loading row", async () => {
    restoreScroll = stubScrollHeight(480);
    const { settle } = stubFetch([stored("user", "hi")]);
    render(<ChatPanel />);
    await screen.findByTestId("chat-message-user");
    const transcript = screen.getByTestId("chat-messages");
    expect(transcript.scrollTop).toBe(480);

    transcript.scrollTop = 0;
    await ready();
    type("more");
    enter();
    await screen.findByTestId("chat-loading");
    expect(transcript.scrollTop).toBe(480);

    transcript.scrollTop = 0;
    await act(async () => settle(reply("done")));
    expect(transcript.scrollTop).toBe(480);
  });
});
