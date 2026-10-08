export type MessageKind = "idle" | "pending" | "success" | "error";

const TONE: Record<MessageKind, string> = {
  idle: "text-fg",
  pending: "text-muted",
  success: "text-fg",
  error: "text-down",
};

/** Reserved 24px message line: empty text still occupies its box, so messages never shift layout. */
export default function FormMessage({ kind, text, testId }: { kind: MessageKind; text: string; testId: string }) {
  return (
    <p
      data-testid={testId}
      data-kind={kind}
      aria-live="polite"
      title={text}
      className={"h-6 truncate px-4 text-body " + TONE[kind]}
    >
      {text}
    </p>
  );
}
