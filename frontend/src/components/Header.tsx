/** Top bar: brand, live portfolio value, cash, P&L, connection status, chat toggle. */
import type { ReactNode } from "react";
import { formatSignedUsd, formatUsd, tone } from "@/lib/format";
import type { ConnectionStatus } from "@/lib/types";

interface Props {
  totalValue: number | null;
  cash: number | null;
  pnl: number | null;
  status: ConnectionStatus;
  chatOpen: boolean;
  onToggleChat: () => void;
}

const STATUS = {
  connected: { color: "bg-up", label: "Live" },
  reconnecting: { color: "bg-accent pulse", label: "Reconnecting" },
  disconnected: { color: "bg-down", label: "Offline" },
} as const;

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[11px] text-muted">{label}</span>
      {children}
    </div>
  );
}

export function Header({ totalValue, cash, pnl, status, chatOpen, onToggleChat }: Props) {
  const s = STATUS[status];
  return (
    <header className="flex h-14 shrink-0 items-center gap-8 border-b border-line bg-panel px-4">
      <div className="font-display text-2xl font-semibold tracking-tight">
        Fin<span className="text-accent">Ally</span>
      </div>
      <Stat label="Portfolio value">
        <span data-testid="total-value" className="num font-display text-2xl font-semibold text-accent">
          {totalValue == null ? "--" : formatUsd(totalValue)}
        </span>
      </Stat>
      <Stat label="Cash">
        <span data-testid="cash-balance" className="num text-base font-medium">
          {cash == null ? "--" : formatUsd(cash)}
        </span>
      </Stat>
      <Stat label="Unrealized P&L">
        <span className={`num text-base font-medium ${tone(pnl)}`}>
          {pnl == null ? "--" : formatSignedUsd(pnl)}
        </span>
      </Stat>
      <div className="ml-auto flex items-center gap-4">
        <div
          data-testid="connection-status"
          data-status={status}
          className="flex items-center gap-2 text-muted"
          title={`Price stream: ${status}`}
        >
          <span className={`h-2 w-2 rounded-full ${s.color}`} />
          <span>{s.label}</span>
        </div>
        <button
          type="button"
          onClick={onToggleChat}
          aria-pressed={chatOpen}
          className="rounded border border-line px-3 py-1 text-text hover:border-blue"
        >
          {chatOpen ? "Hide assistant" : "Ask FinAlly"}
        </button>
      </div>
    </header>
  );
}
