"use client";

import { fmtPct, toneClass } from "../lib/format";
import { useMarketStore } from "../lib/store";
import type { WatchlistItem } from "../lib/types";
import PriceCell from "./PriceCell";

/** One watchlist row; subscribes only to its own ticker's slice of the price map. */
export default function WatchlistRow({ item }: { item: WatchlistItem }) {
  const { ticker } = item;
  const live = useMarketStore((s) => s.prices[ticker]);
  const change = fmtPct(live?.change_percent ?? item.change_percent);
  const dim = useMarketStore((s) => s.status === "disconnected");
  const stale = dim ? " opacity-60" : "";

  return (
    <tr data-testid={"watchlist-row-" + ticker} className="h-10 border-b border-border hover:bg-raised">
      <td className="px-4 font-semibold truncate" title={ticker}>
        {ticker}
      </td>
      <td className="p-0 text-right tabular-nums">
        <PriceCell ticker={ticker} price={live?.price ?? item.price} dim={dim} />
      </td>
      <td data-testid={"change-" + ticker} className={"px-2 text-right tabular-nums " + toneClass(change) + stale}>
        {change}
      </td>
      <td className="px-2 hidden sm:table-cell">
        <div data-testid={"sparkline-" + ticker} className="h-6" aria-hidden="true" />
      </td>
    </tr>
  );
}
