"use client";

import { usePortfolioStore } from "../lib/portfolioStore";
import PositionRow from "./PositionRow";

const NUM = "px-2 text-right font-normal";

/** Positions come from the shared portfolio store; each row streams its own price. */
export default function PositionsTable() {
  const portfolio = usePortfolioStore((s) => s.portfolio);

  return (
    <section data-testid="positions-panel" className="flex min-h-0 flex-1 flex-col bg-panel">
      <div className="flex h-10 shrink-0 items-center border-b border-border px-4">
        <h2 className="text-heading font-semibold">Positions</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {portfolio && portfolio.positions.length > 0 && (
          <table data-testid="positions-table" className="w-full min-w-144 table-fixed">
            <thead className="sticky top-0 bg-panel">
              <tr className="h-8 border-b border-border text-label text-muted">
                <th className="w-24 px-4 text-left font-normal">Ticker</th>
                <th className={NUM}>Qty</th>
                <th className={NUM}>Avg cost</th>
                <th className={NUM}>Price</th>
                <th className={NUM} title="Unrealized P&L in dollars">
                  P&L
                </th>
                <th className={NUM} title="Unrealized P&L as a percent of average cost">
                  P&L %
                </th>
              </tr>
            </thead>
            <tbody>
              {portfolio.positions.map((p) => (
                <PositionRow key={p.ticker} position={p} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
