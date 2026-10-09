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

const RETRY = "mt-4 h-8 rounded-sm border border-border px-4 text-body hover:bg-raised disabled:opacity-50" + FOCUS;
const EXAMPLE = "h-8 truncate rounded-sm border border-border px-4 text-left text-body hover:bg-raised" + FOCUS;
const MAX_DRAFT = 2000;
const SLOW_AFTER_MS = 8000;
const EXAMPLES = ["How is my portfolio doing?", "Buy 5 shares of NVDA", "Add PYPL to my watchlist"];

/** The AI chat panel: always mounted, hidden when closed, so the draft and transcript survive a close. */
export default function ChatPanel() {
  const open = useChatStore((s) => s.open);
  const messages = useChatStore((s) => s.messages);
  const history = useChatStore((s) => s.history);
  const sending = useChatStore((s) => s.sending);
  const localError = useChatStore((s) => s.localError);
  const focusSeq = useChatStore((s) => s.focusSeq);
  const setOpen = useChatStore((s) => s.setOpen);
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [slow, setSlow] = useState(false);
  const tooLong = draft.length > MAX_DRAFT;

  useEffect(() => {
    useChatStore.getState().setOpen(window.matchMedia("(min-width: 1536px)").matches);
    useChatStore.getState().loadHistory();
  }, []);

  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, sending, history, open, localError]);

  useEffect(() => {
    if (!sending) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [sending]);

  useEffect(() => {
    if (focusSeq === 0) return;
    (textareaRef.current?.disabled ? titleRef.current : textareaRef.current)?.focus();
  }, [focusSeq]);

  function closePanel() {
    setOpen(false);
    document.querySelector<HTMLElement>('[data-testid="chat-toggle"]')?.focus();
  }

  async function submit() {
    const text = draft.trim();
    if (!text || tooLong || sending || history === "loading") return;
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
      onKeyDown={(event) => {
        if (event.key === "Escape" && !window.matchMedia("(min-width: 1536px)").matches) closePanel();
      }}
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-4">
        <h2 ref={titleRef} tabIndex={-1} className="text-heading font-semibold">
          FinAlly AI
        </h2>
        <button
          type="button"
          data-testid="chat-close"
          aria-label="Close AI chat"
          onClick={closePanel}
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
        {history === "loading" && (
          <div
            data-testid="chat-history-loading"
            aria-busy="true"
            aria-label="Loading conversation"
            className="flex flex-col gap-4"
          >
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 rounded-sm bg-raised motion-safe:animate-pulse" />
            ))}
          </div>
        )}
        {history === "error" && (
          <div data-testid="chat-history-error" className="p-6">
            <h3 className="text-heading font-semibold">Conversation unavailable</h3>
            <p className="text-body">The server did not return your chat history. Check that FinAlly is running, then retry.</p>
            <button
              type="button"
              data-testid="chat-retry"
              disabled={sending}
              onClick={() => useChatStore.getState().loadHistory()}
              className={RETRY}
            >
              Retry
            </button>
          </div>
        )}
        {history === "ready" && messages.length === 0 && !sending && (
          <div data-testid="chat-empty" className="p-6">
            <h3 className="text-heading font-semibold">Ask FinAlly anything</h3>
            <p className="text-body">Ask about your portfolio, or tell FinAlly to trade or change your watchlist.</p>
            <p className="mt-4 text-label text-muted">Try</p>
            <div className="mt-2 flex flex-col gap-2">
              {EXAMPLES.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  data-testid="chat-example"
                  onClick={() => {
                    setDraft(prompt);
                    textareaRef.current?.focus();
                  }}
                  className={EXAMPLE}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
        {history !== "loading" &&
          messages.map((message) => <ChatMessageRow key={message.id} message={message} />)}
        {history !== "loading" && sending && (
          <div data-testid="chat-loading" aria-busy="true" className="text-body text-muted motion-safe:animate-pulse">
            {slow ? "Still thinking. This can take up to 30 seconds." : "Thinking..."}
          </div>
        )}
        {history !== "loading" && localError && (
          <div data-testid="chat-error" className="self-stretch text-body text-down">
            {localError.text}
            {localError.network && (
              <p className="text-label text-muted">
                The message may not have been processed. Check your positions before sending it again.
              </p>
            )}
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
          <p
            data-testid="chat-hint"
            aria-live="polite"
            className={"truncate text-label " + (tooLong ? "text-down" : "text-muted")}
          >
            {tooLong ? "Message is too long: 2000 characters maximum" : "Enter sends, Shift+Enter adds a line"}
          </p>
          <button
            type="submit"
            data-testid="chat-send"
            disabled={draft.trim() === "" || tooLong || sending || history === "loading"}
            className={SEND}
          >
            Send
          </button>
        </div>
      </form>
    </aside>
  );
}
