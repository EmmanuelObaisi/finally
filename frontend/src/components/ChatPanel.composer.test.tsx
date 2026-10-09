import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NETWORK_ERROR } from "../lib/api";
import { resetChatStore, useChatStore } from "../lib/chatStore";
import { resetPortfolioStore } from "../lib/portfolioStore";
import { initialMarketState, useMarketStore } from "../lib/store";
import type { ChatMessage, ChatReply } from "../lib/types";
import { resetWatchlistStore } from "../lib/watchlistStore";
import ChatPanel from "./ChatPanel";
import ChatToggle from "./ChatToggle";

const LLM_FAILURE = "The assistant could not complete that request. Please try again.";
const SLOW = "Still thinking. This can take up to 30 seconds.";

const reply = (message: string): ChatReply => ({
  message,
  actions: [],
  portfolio: { cash: 10000, total_value: 10000, unrealized_pnl: 0, positions: [] },
  watchlist: [],
});

const stored = (role: "user" | "assistant", content: string): ChatMessage => ({
  id: role + content,
  role,
  content,
  actions: null,
  created_at: "2026-10-09T10:05:00Z",
});

type Json = { ok: boolean; status: number; json: () => Promise<unknown> };

/** Routes history to a fixed list (or never) and chat to a response the test settles by hand. */
function stubFetch(messages: ChatMessage[] = [], historyPending = false) {
  let settle: (value: Json) => void = () => {};
  let reject: (reason: Error) => void = () => {};
  const fn = vi.fn((url: string, _init?: RequestInit) => {
    if (url === "/api/chat/history") {
      if (historyPending) return new Promise<Json>(() => {});
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ messages }) });
    }
    return new Promise<Json>((resolve, rej) => {
      settle = resolve;
      reject = rej;
    });
  });
  vi.stubGlobal("fetch", fn);
  return {
    fn,
    ok: (value: ChatReply) => settle({ ok: true, status: 200, json: async () => value }),
    status: (code: number, error: string) => settle({ ok: false, status: code, json: async () => ({ error }) }),
    network: () => reject(new TypeError("Failed to fetch")),
  };
}

const media = (matches: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({ matches, media: query, addEventListener: () => {}, removeEventListener: () => {} }));

const input = () => screen.getByTestId("chat-input") as HTMLTextAreaElement;
const send = () => screen.getByTestId("chat-send");
const type = (value: string) => fireEvent.change(input(), { target: { value } });
const enter = (init: KeyboardEventInit = {}) => fireEvent.keyDown(input(), { key: "Enter", ...init });
const chatCalls = (fn: ReturnType<typeof stubFetch>["fn"]) => fn.mock.calls.filter(([url]) => url === "/api/chat");
const ready = () => waitFor(() => expect(input()).toBeEnabled());

beforeEach(() => {
  resetChatStore();
  resetPortfolioStore();
  resetWatchlistStore();
  useMarketStore.setState(initialMarketState());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("composer empty and pending", () => {
  it("keeps Send disabled and sends nothing for empty, space and newline drafts", async () => {
    const { fn } = stubFetch();
    render(<ChatPanel />);
    await ready();
    for (const draft of ["", "   ", "\n\t "]) {
      type(draft);
      expect(send()).toBeDisabled();
      enter();
    }
    expect(chatCalls(fn)).toHaveLength(0);
    expect(input()).toBeEnabled();
    expect(input()).not.toHaveAttribute("readonly");
  });

  it("Enter sends the trimmed text once; Shift+Enter and IME composition send nothing", async () => {
    const { fn } = stubFetch();
    render(<ChatPanel />);
    await ready();
    type("  hello  ");
    expect(fireEvent.keyDown(input(), { key: "Enter", shiftKey: true })).toBe(true);
    enter({ isComposing: true });
    expect(chatCalls(fn)).toHaveLength(0);

    enter();
    await screen.findByTestId("chat-loading");
    expect(chatCalls(fn)).toHaveLength(1);
    expect(JSON.parse(chatCalls(fn)[0][1]?.body as string)).toEqual({ message: "hello" });
  });

  it("while pending Send is disabled, the form is busy, Enter is ignored and the textarea stays editable", async () => {
    const { fn } = stubFetch();
    render(<ChatPanel />);
    await ready();
    type("one");
    enter();
    await screen.findByTestId("chat-loading");
    expect(send()).toBeDisabled();
    expect(screen.getByTestId("chat-form")).toHaveAttribute("aria-busy", "true");

    type("two");
    enter();
    expect(chatCalls(fn)).toHaveLength(1);
    expect(input()).toBeEnabled();
    expect(input()).toHaveValue("two");
  });
});

describe("composer length", () => {
  async function renderReady() {
    const stub = stubFetch();
    render(<ChatPanel />);
    await ready();
    return stub;
  }

  it("accepts 2000 characters with the normal hint", async () => {
    await renderReady();
    type("a".repeat(2000));
    expect(screen.getByTestId("chat-hint")).toHaveTextContent("Enter sends, Shift+Enter adds a line");
    expect(send()).toBeEnabled();
  });

  it("blocks 2001 characters: too-long hint in text-down, Send disabled, Enter sends nothing", async () => {
    const { fn } = await renderReady();
    type("a".repeat(2001));
    const hint = screen.getByTestId("chat-hint");
    expect(hint).toHaveTextContent("Message is too long: 2000 characters maximum");
    expect(hint).toHaveClass("text-down");
    expect(send()).toBeDisabled();
    enter();
    expect(chatCalls(fn)).toHaveLength(0);
  });

  it("counts UTF-16 units: 1000 emoji pass, 1001 emoji are blocked", async () => {
    await renderReady();
    type("😀".repeat(1000));
    expect(send()).toBeEnabled();
    type("😀".repeat(1001));
    expect(send()).toBeDisabled();
    expect(screen.getByTestId("chat-hint")).toHaveTextContent("too long");
  });

  it("textarea is two rows, fixed height, no resize, labelled, autocomplete off", async () => {
    await renderReady();
    expect(input()).toHaveAttribute("rows", "2");
    expect(input()).toHaveClass("h-16", "resize-none");
    expect(input()).toHaveAttribute("aria-label", "Message to FinAlly");
    expect(input()).toHaveAttribute("autocomplete", "off");
  });
});

describe("slow reply", () => {
  it("switches to the slow text after 8 seconds and restarts on the next send", async () => {
    const { ok } = stubFetch();
    render(<ChatPanel />);
    await ready();
    vi.useFakeTimers();

    type("one");
    enter();
    expect(screen.getByTestId("chat-loading")).toHaveTextContent("Thinking...");
    await act(async () => vi.advanceTimersByTime(7999));
    expect(screen.getByTestId("chat-loading")).toHaveTextContent("Thinking...");
    await act(async () => vi.advanceTimersByTime(1));
    expect(screen.getByTestId("chat-loading")).toHaveTextContent(SLOW);

    await act(async () => ok(reply("done")));
    expect(screen.queryByTestId("chat-loading")).toBeNull();

    type("two");
    enter();
    expect(screen.getByTestId("chat-loading")).toHaveTextContent("Thinking...");
  });
});

describe("request failure", () => {
  it("shows a 400 verbatim with no sub-line, restores the text and offers no resend", async () => {
    const { status } = stubFetch();
    render(<ChatPanel />);
    await ready();
    type("hello");
    enter();
    await screen.findByTestId("chat-loading");
    await act(async () => status(400, "Message must not be empty"));

    const row = screen.getByTestId("chat-error");
    expect(row).toHaveTextContent("Message must not be empty");
    expect(row).not.toHaveTextContent("may not have been processed");
    const user = screen.getByTestId("chat-message-user");
    expect(user.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(input()).toHaveValue("hello");
    expect(screen.queryByText(/resend/i)).toBeNull();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Close", "Send"]);
  });

  it("a network failure shows NETWORK_ERROR with the may-not-have-been-processed sub-line", async () => {
    const { network } = stubFetch();
    render(<ChatPanel />);
    await ready();
    type("buy 5 AAPL");
    enter();
    await screen.findByTestId("chat-loading");
    await act(async () => network());

    const row = screen.getByTestId("chat-error");
    expect(row).toHaveTextContent(NETWORK_ERROR);
    expect(row).toHaveTextContent("The message may not have been processed. Check your positions before sending it again.");
    expect(input()).toHaveValue("buy 5 AAPL");
  });

  it("never overwrites text the user typed while the request was pending", async () => {
    const { status } = stubFetch();
    render(<ChatPanel />);
    await ready();
    type("first");
    enter();
    await screen.findByTestId("chat-loading");
    type("typed meanwhile");
    await act(async () => status(400, "Message must not be empty"));
    expect(input()).toHaveValue("typed meanwhile");
  });

  it("the error row is gone after a reload", async () => {
    const { status } = stubFetch();
    render(<ChatPanel />);
    await ready();
    type("hello");
    enter();
    await screen.findByTestId("chat-loading");
    await act(async () => status(400, "Message must not be empty"));
    expect(screen.getByTestId("chat-error")).toBeInTheDocument();

    cleanup();
    resetChatStore();
    stubFetch([]);
    render(<ChatPanel />);
    await screen.findByTestId("chat-empty");
    expect(screen.queryByTestId("chat-error")).toBeNull();
  });

  it("an LLM-failure reply is an ordinary assistant message with no action or error row", async () => {
    const { ok } = stubFetch();
    render(<ChatPanel />);
    await ready();
    type("hello");
    enter();
    await screen.findByTestId("chat-loading");
    await act(async () => ok(reply(LLM_FAILURE)));
    expect(screen.getByTestId("chat-message-assistant")).toHaveTextContent(LLM_FAILURE);
    expect(screen.queryByTestId("chat-action")).toBeNull();
    expect(screen.queryByTestId("chat-error")).toBeNull();
  });
});

describe("price-stream status", () => {
  it("a disconnected stream neither dims nor disables the chat", async () => {
    useMarketStore.getState().setStatus("disconnected");
    const { ok } = stubFetch();
    render(<ChatPanel />);
    await ready();
    expect(screen.getByTestId("chat-panel").className).not.toContain("opacity-60");
    type("hello");
    enter();
    await screen.findByTestId("chat-loading");
    await act(async () => ok(reply("Hi")));
    expect(screen.getByTestId("chat-message-assistant")).toHaveTextContent("Hi");
  });
});

describe("focus and Escape", () => {
  const toggle = () => screen.getByTestId("chat-toggle");
  const panel = () => screen.getByTestId("chat-panel");

  it("opening through the toggle focuses the textarea", async () => {
    stubFetch([stored("user", "hi")]);
    render(<><ChatToggle /><ChatPanel /></>);
    await ready();
    fireEvent.click(toggle());
    expect(document.activeElement).toBe(input());
  });

  it("opening while the textarea is disabled focuses the panel title", () => {
    stubFetch([], true);
    render(<><ChatToggle /><ChatPanel /></>);
    fireEvent.click(toggle());
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "FinAlly AI" }));
  });

  it("the default open at mount does not take focus", async () => {
    media(true);
    stubFetch();
    render(<><ChatToggle /><ChatPanel /></>);
    await ready();
    expect(panel()).toHaveAttribute("data-open", "true");
    expect(document.activeElement).toBe(document.body);
  });

  it("Close hides the panel and returns focus to the toggle", async () => {
    media(true);
    stubFetch();
    render(<><ChatToggle /><ChatPanel /></>);
    await ready();
    fireEvent.click(screen.getByTestId("chat-close"));
    expect(panel()).toHaveAttribute("data-open", "false");
    expect(document.activeElement).toBe(toggle());
  });

  it("Escape closes the overlay and returns focus to the toggle", async () => {
    media(false);
    stubFetch();
    render(<><ChatToggle /><ChatPanel /></>);
    await ready();
    act(() => useChatStore.getState().setOpen(true));
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(panel()).toHaveAttribute("data-open", "false");
    expect(document.activeElement).toBe(toggle());
  });

  it("Escape does nothing while the panel is docked", async () => {
    media(true);
    stubFetch();
    render(<><ChatToggle /><ChatPanel /></>);
    await ready();
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(panel()).toHaveAttribute("data-open", "true");
  });
});
