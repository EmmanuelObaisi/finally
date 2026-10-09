"use client";

import { fmtPct, toneClass } from "../lib/format";
import { useMarketStore } from "../lib/store";
import type { WatchlistItem } from "../lib/types";
import PriceCell from "./PriceCell";
import Sparkline from "./Sparkline";

/** One watchlist row; subscribes only to its own ticker's slice of the price map. */
export default function WatchlistRow({
  item,
  busy,
  selected,
  onSelect,
  onRemove,
}: {
  item: WatchlistItem;
  busy: boolean;
  selected: boolean;
  onSelect: (ticker: string) => void;
  onRemove: (ticker: string) => void;
}) {
  const { ticker } = item;
  const live = useMarketStore((s) => s.prices[ticker]);
  const change = fmtPct(live?.change_percent ?? item.change_percent);
  const dim = useMarketStore((s) => s.status === "disconnected");
  const stale = dim ? " opacity-60" : "";

  return (
    <tr
      data-testid={"watchlist-row-" + ticker}
      data-selected={selected ? "true" : "false"}
      onClick={() => onSelect(ticker)}
      className={"h-10 cursor-pointer border-b border-border hover:bg-raised" + (selected ? " bg-raised" : "")}
    >
      <td className={"px-4 border-l-2 " + (selected ? "border-primary" : "border-transparent")}>
        <button
          type="button"
          data-testid={"select-" + ticker}
          aria-label={"Show " + ticker + " chart"}
          aria-current={selected ? "true" : undefined}
          title={ticker}
          className="block w-full truncate text-left font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {ticker}
        </button>
      </td>
      <td className="p-0 text-right tabular-nums">
        <PriceCell ticker={ticker} price={live?.price ?? item.price} dim={dim} />
      </td>
      <td data-testid={"change-" + ticker} className={"px-2 text-right tabular-nums " + toneClass(change) + stale}>
        {change}
      </td>
      <td className="px-2 hidden sm:table-cell">
        <Sparkline ticker={ticker} />
      </td>
      <td className="p-0 text-center">
        <button
          type="button"
          data-testid={"watchlist-remove-" + ticker}
          aria-label={"Remove " + ticker}
          title={"Remove " + ticker}
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(ticker);
          }}
          className="size-8 rounded-sm text-body text-muted hover:text-down disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span aria-hidden="true">×</span>
        </button>
      </td>
    </tr>
  );
}
