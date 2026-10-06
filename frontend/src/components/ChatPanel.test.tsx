import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ChatResponse } from "@/lib/types";
import { ChatPanel } from "./ChatPanel";

const response: ChatResponse = {
  message: "Mock: buying 1 AAPL.",
  actions: {
    trades: [
      { ticker: "AAPL", side: "buy", quantity: 1, status: "ok", price: 190.5 },
      { ticker: "TSLA", side: "sell", quantity: 3, status: "error", error: "Insufficient shares" },
    ],
    watchlist_changes: [{ ticker: "PYPL", action: "add", status: "ok" }],
  },
  portfolio: { cash_balance: 0, total_value: 0, positions_value: 0, unrealized_pnl: 0, positions: [] },
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function send(text: string) {
  await userEvent.type(screen.getByTestId("chat-input"), text);
  await userEvent.click(screen.getByTestId("chat-send"));
}

describe("ChatPanel", () => {
  it("shows the user message and a loading indicator while waiting", async () => {
    const pending = deferred<ChatResponse>();
    render(<ChatPanel onSend={() => pending.promise} />);
    await send("buy one apple");
    const [user] = screen.getAllByTestId("chat-message");
    expect(user).toHaveAttribute("data-role", "user");
    expect(user).toHaveTextContent("buy one apple");
    expect(screen.getByTestId("chat-loading")).toBeInTheDocument();
    expect(screen.getByTestId("chat-send")).toBeDisabled();

    pending.resolve(response);
    expect(await screen.findByText("Mock: buying 1 AAPL.")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-loading")).not.toBeInTheDocument();
  });

  it("renders the assistant reply with inline action confirmations", async () => {
    render(<ChatPanel onSend={vi.fn().mockResolvedValue(response)} />);
    await send("buy");
    const messages = await screen.findAllByTestId("chat-message");
    expect(messages[1]).toHaveAttribute("data-role", "assistant");
    const actions = screen.getAllByTestId("chat-action");
    expect(actions.map((a) => a.textContent)).toEqual([
      "Bought 1 AAPL at 190.50",
      "Sell 3 TSLA failed: Insufficient shares",
      "Added PYPL to watchlist",
    ]);
    expect(actions[1]).toHaveAttribute("data-status", "error");
  });

  it("shows an error when the assistant request fails", async () => {
    render(<ChatPanel onSend={vi.fn().mockRejectedValue(new Error("LLM unavailable"))} />);
    await send("hello");
    expect(await screen.findByTestId("chat-error")).toHaveTextContent("LLM unavailable");
    expect(screen.queryByTestId("chat-loading")).not.toBeInTheDocument();
  });
});
