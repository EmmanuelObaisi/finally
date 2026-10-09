"use client";

import { useEffect, useRef, useState } from "react";
import { useChatStore } from "../lib/chatStore";
import ChatMessageRow from "./ChatMessageRow";

const FOCUS = " focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const OPEN =
  "fixed top-12 right-0 bottom-8 z-20 flex w-full flex-col border-l border-border bg-panel sm:w-90 2xl:static 2xl:z-auto 2xl:h-full 2xl:min-h-0 2xl:w-auto";
const CLOSE = "h-8 rounded-sm border border-border px-4 text-body hover:bg-raised" + FOCUS;
const INPUT =
  "h-16 w-full resize-none rounded-sm border border-border bg-surface p-2 text-body text-fg placeholder:text-muted" + FOCUS;
const SEND =
  "h-8 w-20 rounded-sm bg-secondary px-4 text-body font-semibold text-fg hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50" +
  FOCUS;

/** The AI chat panel: always mounted, hidden when closed, so the draft and transcript survive a close. */
export default function ChatPanel() {
  const open = useChatStore((s) => s.open);
  const messages = useChatStore((s) => s.messages);
  const history = useChatStore((s) => s.history);
  const sending = useChatStore((s) => s.sending);
  const setOpen = useChatStore((s) => s.setOpen);
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    useChatStore.getState().setOpen(window.matchMedia("(min-width: 1536px)").matches);
    useChatStore.getState().loadHistory();
  }, []);

  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, sending, history, open]);

  async function submit() {
    const text = draft.trim();
    if (!text || sending || history === "loading") return;
    setDraft("");
    textareaRef.current?.focus();
    const ok = await useChatStore.getState().send(text);
    if (!ok) setDraft((d) => (d === "" ? text : d));
  }

  return (
    <aside
      id="chat-panel"
      data-testid="chat-panel"
      data-open={open ? "true" : "false"}
      aria-label="FinAlly AI chat"
      className={open ? OPEN : "hidden"}
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-4">
        <h2 className="text-heading font-semibold">FinAlly AI</h2>
        <button
          type="button"
          data-testid="chat-close"
          aria-label="Close AI chat"
          onClick={() => setOpen(false)}
          className={CLOSE}
        >
          Close
        </button>
      </div>
      <div
        data-testid="chat-messages"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        ref={transcriptRef}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4"
      >
        {messages.map((message) => (
          <ChatMessageRow key={message.id} message={message} />
        ))}
        {sending && (
          <div data-testid="chat-loading" aria-busy="true" className="text-body text-muted motion-safe:animate-pulse">
            Thinking...
          </div>
        )}
      </div>
      <form
        data-testid="chat-form"
        aria-label="Send a message to FinAlly"
        aria-busy={sending ? "true" : undefined}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="flex shrink-0 flex-col gap-2 border-t border-border p-4"
      >
        <textarea
          data-testid="chat-input"
          ref={textareaRef}
          rows={2}
          aria-label="Message to FinAlly"
          autoComplete="off"
          placeholder="Ask about your portfolio or tell FinAlly to trade"
          value={draft}
          disabled={history === "loading"}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          className={INPUT}
        />
        <div className="flex h-8 items-center justify-between gap-2">
          <p data-testid="chat-hint" aria-live="polite" className="truncate text-label text-muted">
            Enter sends, Shift+Enter adds a line
          </p>
          <button
            type="submit"
            data-testid="chat-send"
            disabled={draft.trim() === "" || sending || history === "loading"}
            className={SEND}
          >
            Send
          </button>
        </div>
      </form>
    </aside>
  );
}
