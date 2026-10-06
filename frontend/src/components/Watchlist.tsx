"use client";
/** Watchlist panel with add form. */
import { useState, type FormEvent } from "react";
import type { PriceHistory } from "@/hooks/usePriceStream";
import type { PriceMap, WatchItem } from "@/lib/types";
import { Panel } from "./Panel";
import { WatchlistRow } from "./WatchlistRow";

interface Props {
  items: WatchItem[];
  prices: PriceMap;
  history: PriceHistory;
  selected: string | null;
  onSelect: (ticker: string) => void;
  onAdd: (ticker: string) => Promise<void>;
  onRemove: (ticker: string) => Promise<void>;
  className?: string;
}

export function Watchlist({ items, prices, history, selected, onSelect, onAdd, onRemove, className }: Props) {
  const [ticker, setTicker] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const symbol = ticker.trim().toUpperCase();
    if (!symbol) return;
    await run(async () => {
      await onAdd(symbol);
      setTicker("");
    });
  }

  return (
    <Panel title="Watchlist" className={className} aside={<span className="text-xs text-muted">{items.length} tickers</span>}>
      <div className="flex h-full flex-col">
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {items.map((item) => {
            const live = prices[item.ticker];
            return (
              <WatchlistRow
                key={item.ticker}
                ticker={item.ticker}
                price={live?.price ?? item.price}
                dayChange={live?.day_change_percent ?? item.day_change_percent}
                points={history[item.ticker] ?? []}
                selected={item.ticker === selected}
                onSelect={onSelect}
                onRemove={(t) => run(() => onRemove(t))}
              />
            );
          })}
        </ul>
        <form onSubmit={submit} className="flex shrink-0 gap-2 border-t border-line p-2">
          <input
            data-testid="watchlist-add-input"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder="Add a ticker, e.g. PYPL"
            aria-label="Ticker to add"
            className="min-w-0 flex-1 rounded border border-line bg-bg px-2 py-1 uppercase placeholder:normal-case placeholder:text-muted focus:border-blue focus:outline-none"
          />
          <button
            data-testid="watchlist-add-button"
            type="submit"
            className="rounded bg-purple px-3 py-1 font-medium text-white hover:brightness-125"
          >
            Add
          </button>
        </form>
        {error && <p className="shrink-0 px-3 pb-2 text-xs text-down">{error}</p>}
      </div>
    </Panel>
  );
}
