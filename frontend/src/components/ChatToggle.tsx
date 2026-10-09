"use client";

import { useChatStore } from "../lib/chatStore";

const FOCUS = " focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** Header button that opens and closes the chat panel. */
export default function ChatToggle() {
  const open = useChatStore((s) => s.open);
  const toggle = useChatStore((s) => s.toggle);
  return (
    <button
      type="button"
      data-testid="chat-toggle"
      aria-expanded={open}
      aria-controls="chat-panel"
      title={open ? "Hide AI chat" : "Show AI chat"}
      onClick={toggle}
      className={"h-8 self-center rounded-sm border border-border px-4 text-body hover:bg-raised" + (open ? " bg-raised" : "") + FOCUS}
    >
      Chat
    </button>
  );
}
