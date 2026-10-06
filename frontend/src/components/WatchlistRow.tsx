"use client";
/** One watchlist row: ticker, sparkline, flashing price, day change, remove. */
import { useFlash } from "@/hooks/useFlash";
import { formatPercent, formatPrice, tone } from "@/lib/format";
import type { PricePoint } from "@/lib/types";
import { LineChart } from "./LineChart";

interface Props {
  ticker: string;
  price: number | null;
  dayChange: number | null;
  points: PricePoint[];
  selected: boolean;
  onSelect: (ticker: string) => void;
  onRemove: (ticker: string) => void;
}

export function WatchlistRow({ ticker, price, dayChange, points, selected, onSelect, onRemove }: Props) {
  const flash = useFlash(price);
  const color = (dayChange ?? 0) < 0 ? "#e5484d" : "#2bb673";
  return (
    <li
      data-testid={`watchlist-row-${ticker}`}
      data-selected={selected}
      onClick={() => onSelect(ticker)}
      className={`grid cursor-pointer grid-cols-[56px_minmax(0,1fr)_68px_58px_18px] items-center gap-2 border-b border-line/60 py-1.5 pr-2 pl-3 hover:bg-raised ${
        selected ? "bg-raised shadow-[inset_2px_0_0_var(--color-accent)]" : ""
      }`}
    >
      <span className="font-display text-[15px] font-semibold tracking-wide">{ticker}</span>
      <LineChart data={points} color={color} compact className="h-7" />
      <span
        key={flash?.id ?? 0}
        data-testid={`watchlist-price-${ticker}`}
        data-flash={flash?.dir ?? ""}
        className={`num rounded-sm px-1 text-right ${flash ? `flash-${flash.dir}` : ""}`}
      >
        {formatPrice(price)}
      </span>
      <span className={`num text-right text-xs ${tone(dayChange)}`}>{formatPercent(dayChange)}</span>
      <button
        type="button"
        data-testid={`watchlist-remove-${ticker}`}
        aria-label={`Remove ${ticker} from watchlist`}
        onClick={(e) => {
          e.stopPropagation();
          onRemove(ticker);
        }}
        className="text-base leading-none text-muted hover:text-down"
      >
        &times;
      </button>
    </li>
  );
}
