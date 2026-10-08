"use client";

import { fmtMoney, fmtPct, fmtQty, fmtSigned, toneClass } from "../lib/format";
import { livePosition } from "../lib/positions";
import { useMarketStore } from "../lib/store";
import type { Position } from "../lib/types";

/** One position row; subscribes only to its own ticker's price. No flash: the watchlist row flashes. */
export default function PositionRow({ position }: { position: Position }) {
  const { ticker } = position;
  const live = useMarketStore((s) => s.prices[ticker]?.price);
  const dim = useMarketStore((s) => s.status === "disconnected");
  const stale = dim ? " opacity-60" : "";
  const { pnl, pnlPercent } = livePosition(position, live ?? position.current_price);
  const qty = fmtQty(position.quantity);
  const pnlText = fmtSigned(pnl);
  const pctText = fmtPct(pnlPercent);

  return (
    <tr data-testid={"position-row-" + ticker} className="h-10 border-b border-border hover:bg-raised">
      <td className="px-4 font-semibold truncate" title={ticker}>
        {ticker}
      </td>
      <td data-testid={"position-qty-" + ticker} className="px-2 text-right tabular-nums truncate" title={qty}>
        {qty}
      </td>
      <td data-testid={"position-avg-" + ticker} className="px-2 text-right tabular-nums">
        {fmtMoney(position.avg_cost)}
      </td>
      <td data-testid={"position-price-" + ticker} className={"px-2 text-right tabular-nums" + stale}>
        {fmtMoney(live ?? position.current_price)}
      </td>
      <td data-testid={"position-pnl-" + ticker} className={"px-2 text-right tabular-nums " + toneClass(pnlText) + stale}>
        {pnlText}
      </td>
      <td
        data-testid={"position-pnl-pct-" + ticker}
        className={"px-2 text-right tabular-nums " + toneClass(pctText) + stale}
      >
        {pctText}
      </td>
    </tr>
  );
}
