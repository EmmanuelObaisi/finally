import { actionText } from "../lib/chatActions";
import type { ChatAction } from "../lib/types";

/** One executed or failed action: the Done or Failed tag and the sentence from the server's record. */
export default function ChatActionLine({ action }: { action: ChatAction }) {
  const tone = action.ok ? " text-up" : " text-down";
  return (
    <div data-testid="chat-action" data-ok={String(action.ok)} data-kind={action.type} className="flex gap-2 text-body">
      <span className={"w-12 shrink-0 text-label font-semibold" + tone}>{action.ok ? "Done" : "Failed"}</span>
      <span className="min-w-0 break-words text-fg">{actionText(action)}</span>
    </div>
  );
}
