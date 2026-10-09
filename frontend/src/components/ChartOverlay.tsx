/** Shared state block laid over a chart box: a skeleton, or a heading and body with an optional Retry. */
export default function ChartOverlay({
  testId,
  heading,
  body,
  busyLabel,
  onRetry,
  retryTestId,
}: {
  testId: string;
  heading?: string;
  body?: string;
  busyLabel?: string;
  onRetry?: () => void;
  retryTestId?: string;
}) {
  if (busyLabel) {
    return (
      <div data-testid={testId} aria-busy="true" aria-label={busyLabel} className="absolute inset-0 bg-panel p-6">
        <div className="h-full rounded-sm bg-raised motion-safe:animate-pulse" />
      </div>
    );
  }
  return (
    <div data-testid={testId} className="absolute inset-0 bg-panel p-6">
      <div className="flex flex-col gap-1">
        <h3 className="text-heading font-semibold">{heading}</h3>
        <p className="text-body text-muted">{body}</p>
        {onRetry && (
          <button
            type="button"
            data-testid={retryTestId}
            onClick={onRetry}
            className="mt-4 h-8 self-start rounded-sm border border-border px-4 text-body hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
