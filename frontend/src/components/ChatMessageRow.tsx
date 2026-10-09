import { fmtClock } from "../lib/format";
import type { ChatMessage } from "../lib/types";
import ChatActionLine from "./ChatActionLine";

const USER_BUBBLE =
  "self-end max-w-72 rounded-sm border border-border bg-raised p-2 text-body text-fg whitespace-pre-wrap break-words";
const ASSISTANT_BUBBLE =
  "self-stretch rounded-sm border border-border p-2 text-body text-fg whitespace-pre-wrap break-words";

/** One transcript message: role and time line, bubble, and for the assistant the action block. */
export default function ChatMessageRow({ message }: { message: ChatMessage }) {
  const user = message.role === "user";
  const time = fmtClock(Date.parse(message.created_at) / 1000).slice(0, 5);
  const actions = message.actions ?? [];
  return (
    <div data-testid={"chat-message-" + message.role} data-role={message.role} className="flex flex-col gap-1">
      <div className={"flex gap-2 text-label text-muted" + (user ? " self-end" : "")}>
        <span>{user ? "You" : "FinAlly"}</span>
        <span className="tabular-nums">{time}</span>
      </div>
      <div className={user ? USER_BUBBLE : ASSISTANT_BUBBLE}>
        {message.content !== "" && <p>{message.content}</p>}
        {!user && actions.length > 0 && (
          <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
            {actions.map((action, i) => (
              <ChatActionLine key={i} action={action} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
