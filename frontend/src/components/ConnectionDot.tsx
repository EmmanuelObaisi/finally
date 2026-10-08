"use client";

import { useMarketStore } from "../lib/store";
import type { ConnectionStatus } from "../lib/types";

const VIEW: Record<ConnectionStatus, { color: string; label: string; sentence: string }> = {
  connected: { color: "bg-up", label: "Live", sentence: "Connected: streaming live prices" },
  reconnecting: {
    color: "bg-warn",
    label: "Reconnecting",
    sentence: "Reconnecting: price stream interrupted, retrying",
  },
  disconnected: {
    color: "bg-down",
    label: "Offline",
    sentence: "Disconnected: no price stream for 5 seconds or more, retrying",
  },
};

export default function ConnectionDot() {
  const status = useMarketStore((s) => s.status);
  const { color, label, sentence } = VIEW[status];
  return (
    <div className="flex items-center gap-1">
      <span
        data-testid="connection-dot"
        role="status"
        data-status={status}
        aria-label={sentence}
        title={sentence}
        className={"size-2 rounded-full " + color}
      />
      <span data-testid="connection-label" className="text-label text-muted">
        {label}
      </span>
    </div>
  );
}
