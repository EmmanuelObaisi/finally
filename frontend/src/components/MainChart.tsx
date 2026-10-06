"use client";
/** Large price chart for the selected ticker, built from the SSE history. */
import { formatPercent, formatPrice, tone } from "@/lib/format";
import type { PricePoint, PriceUpdate } from "@/lib/types";
import { LineChart } from "./LineChart";
import { Panel } from "./Panel";

interface Props {
  ticker: string | null;
  quote: PriceUpdate | undefined;
  points: PricePoint[];
  className?: string;
}

export function MainChart({ ticker, quote, points, className }: Props) {
  const dayChange = quote?.day_change_percent ?? null;
  return (
    <Panel
      className={className}
      title={ticker ?? "Select a ticker"}
      aside={
        quote && (
          <span className="num flex items-baseline gap-3">
            <span className="font-display text-lg font-semibold">{formatPrice(quote.price)}</span>
            <span className={tone(dayChange)}>{formatPercent(dayChange)}</span>
          </span>
        )
      }
    >
      <div data-testid="main-chart" data-ticker={ticker ?? ""} className="relative h-full">
        <LineChart
          data={points}
          color={(dayChange ?? 0) < 0 ? "#e5484d" : "#209dd7"}
          logo
          className="absolute inset-0"
        />
        {points.length < 2 && (
          <p className="pointer-events-none absolute inset-0 grid place-items-center text-muted">
            {ticker ? "Collecting prices since page load" : "Click a ticker in the watchlist"}
          </p>
        )}
      </div>
    </Panel>
  );
}
