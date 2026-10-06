"use client";
/** AI assistant: conversation, loading indicator, inline action confirmations. */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatPrice, formatQty } from "@/lib/format";
import type { ChatActions, ChatResponse } from "@/lib/types";

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  actions?: ChatActions;
}

interface Props {
  onSend: (message: string) => Promise<ChatResponse>;
}

function actionLines(actions: ChatActions) {
  const trades = actions.trades.map((t) => ({
    ok: t.status === "ok",
    text:
      t.status === "ok"
        ? `${t.side === "buy" ? "Bought" : "Sold"} ${formatQty(t.quantity)} ${t.ticker} at ${formatPrice(t.price)}`
        : `${t.side === "buy" ? "Buy" : "Sell"} ${formatQty(t.quantity)} ${t.ticker} failed: ${t.error}`,
  }));
  const watch = actions.watchlist_changes.map((w) => ({
    ok: w.status === "ok",
    text:
      w.status === "ok"
        ? `${w.action === "add" ? "Added" : "Removed"} ${w.ticker} ${w.action === "add" ? "to" : "from"} watchlist`
        : `Watchlist ${w.action} ${w.ticker} failed: ${w.error}`,
  }));
  return [...trades, ...watch];
}

function Message({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <li data-testid="chat-message" data-role={message.role} className={`flex flex-col gap-1 ${isUser ? "items-end" : ""}`}>
      <p
        className={`max-w-[90%] whitespace-pre-wrap rounded px-3 py-2 leading-relaxed ${
          isUser ? "bg-blue/15 text-text" : "border-l-2 border-accent bg-raised"
        }`}
      >
        {message.content}
      </p>
      {message.actions &&
        actionLines(message.actions).map((a, i) => (
          <p
            key={i}
            data-testid="chat-action"
            data-status={a.ok ? "ok" : "error"}
            className={`num text-xs ${a.ok ? "text-up" : "text-down"}`}
          >
            {a.text}
          </p>
        ))}
    </li>
  );
}

export function ChatPanel({ onSend }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(1);
  const end = useRef<HTMLLIElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end" });
  }, [messages, loading]);

  const push = (m: Omit<ChatMessage, "id">) => setMessages((list) => [...list, { ...m, id: nextId.current++ }]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || loading) return;
    setDraft("");
    setError(null);
    push({ role: "user", content: text });
    setLoading(true);
    try {
      const res = await onSend(text);
      push({ role: "assistant", content: res.message, actions: res.actions });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ol className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <li className="text-muted">
            Ask about your portfolio, or tell FinAlly to trade, for example &quot;buy 5 NVDA&quot;.
          </li>
        )}
        {messages.map((m) => (
          <Message key={m.id} message={m} />
        ))}
        {loading && (
          <li data-testid="chat-loading" className="flex items-center gap-2 text-muted">
            <span className="pulse h-2 w-2 rounded-full bg-accent" />
            FinAlly is thinking
          </li>
        )}
        {error && (
          <li data-testid="chat-error" className="text-down">
            {error}
          </li>
        )}
        <li ref={end} aria-hidden />
      </ol>
      <form onSubmit={submit} className="flex shrink-0 gap-2 border-t border-line p-2">
        <input
          data-testid="chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message FinAlly"
          aria-label="Message FinAlly"
          className="min-w-0 flex-1 rounded border border-line bg-bg px-2 py-1.5 placeholder:text-muted focus:border-blue focus:outline-none"
        />
        <button
          data-testid="chat-send"
          type="submit"
          disabled={loading}
          className="rounded bg-purple px-3 py-1.5 font-medium text-white hover:brightness-125 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
