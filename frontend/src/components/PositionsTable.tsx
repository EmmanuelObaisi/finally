/** Positions with live prices and unrealized P&L. */
import { formatPercent, formatPrice, formatQty, formatSignedUsd, tone } from "@/lib/format";
import type { Position } from "@/lib/types";

interface Props {
  positions: Position[];
  onSelect: (ticker: string) => void;
}

const HEADERS = ["Ticker", "Qty", "Avg cost", "Price", "Unrealized P&L", "Change"];

export function PositionsTable({ positions, onSelect }: Props) {
  return (
    <div className="h-full overflow-auto">
      <table data-testid="positions-table" className="num w-full text-right">
        <thead className="sticky top-0 bg-panel text-xs text-muted">
          <tr>
            {HEADERS.map((h) => (
              <th key={h} className="px-3 py-1.5 font-normal first:text-left">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr
              key={p.ticker}
              data-testid={`position-row-${p.ticker}`}
              onClick={() => onSelect(p.ticker)}
              className="cursor-pointer border-t border-line/60 hover:bg-raised"
            >
              <td className="px-3 py-1.5 text-left font-display text-[15px] font-semibold">{p.ticker}</td>
              <td className="px-3">{formatQty(p.quantity)}</td>
              <td className="px-3">{formatPrice(p.avg_cost)}</td>
              <td className="px-3">{formatPrice(p.current_price)}</td>
              <td className={`px-3 ${tone(p.unrealized_pnl)}`}>{formatSignedUsd(p.unrealized_pnl)}</td>
              <td className={`px-3 ${tone(p.pnl_percent)}`}>{formatPercent(p.pnl_percent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {positions.length === 0 && (
        <p className="px-3 py-4 text-muted">No positions yet. Buy shares with the order form or ask FinAlly.</p>
      )}
    </div>
  );
}
