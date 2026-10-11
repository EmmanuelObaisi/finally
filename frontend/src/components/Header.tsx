import { ConnectionDot } from '@/src/components/ConnectionDot';
import { MarketSourceToggle } from '@/src/components/MarketSourceToggle';
import { ThemeToggle } from '@/src/context/ThemeContext';
import { money } from '@/src/lib/format';
import { ConnectionState } from '@/src/types/trading';

interface HeaderProps {
  totalValue: number;
  cash: number;
  connectionState: ConnectionState;
  onSourceSwitch?: () => void;
}

export const Header = ({ totalValue, cash, connectionState, onSourceSwitch }: HeaderProps) => (
  <header className="flex flex-wrap items-center justify-between gap-3 border-b border-terminal-border bg-terminal-panelAlt/70 px-4 py-3">
    <div>
      <h1 className="text-lg font-semibold tracking-wide text-terminal-text">FinAlly Terminal</h1>
      <p className="text-xs text-terminal-dim">AI Trading Workstation</p>
    </div>
    <div className="flex items-center gap-5 text-sm">
      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-terminal-dim">Portfolio</p>
        <p className="font-semibold text-terminal-text">{money(totalValue)}</p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-terminal-dim">Cash</p>
        <p className="font-semibold text-terminal-accent">{money(cash)}</p>
      </div>
      <MarketSourceToggle onSwitch={onSourceSwitch} />
      <ThemeToggle />
      <ConnectionDot state={connectionState} />
      <button type="button" className="text-xs text-terminal-dim hover:text-terminal-text" onClick={async () => {
        const response = await fetch('/api/auth/logout', { method: 'POST' });
        if (response.ok) window.location.reload();
      }}>Sign out</button>
    </div>
  </header>
);
