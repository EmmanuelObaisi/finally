"use client";

import { createChart, LineSeries } from "lightweight-charts";
import type { ISeriesApi, Time } from "lightweight-charts";
import { useEffect, useRef } from "react";
import { baseChartOptions, CHART_COLORS, toData } from "../lib/chartTheme";
import { fmtClock, fmtMoney, fmtPct, toneClass } from "../lib/format";
import { useSelectionStore } from "../lib/selectionStore";
import { useMarketStore } from "../lib/store";

/** Price chart of the selected watchlist ticker, fed by the same per-second buffer as its sparkline. */
export default function MainChartPanel() {
  const selected = useSelectionStore((s) => s.selected);
  const buffer = useMarketStore((s) => s.spark[selected ?? ""]);
  const live = useMarketStore((s) => s.prices[selected ?? ""]);
  const box = useRef<HTMLDivElement>(null);
  const series = useRef<ISeriesApi<"Line"> | null>(null);
  const fit = useRef<() => void>(() => {});

  const points = buffer?.length ?? 0;
  const ready = selected !== null && points >= 2;
  const price = fmtMoney(live?.price);
  const change = fmtPct(live?.change_percent);
  const title = selected ?? "Price chart";

  // The chart is created once; it survives ticker changes and is removed with the panel.
  useEffect(() => {
    const base = baseChartOptions();
    const chart = createChart(box.current!, {
      ...base,
      timeScale: {
        ...base.timeScale,
        secondsVisible: true,
        tickMarkFormatter: (t: Time) => (typeof t === "number" ? fmtClock(t) : null),
      },
      localization: { timeFormatter: (t: Time) => (typeof t === "number" ? fmtClock(t) : String(t)) },
    });
    series.current = chart.addSeries(LineSeries, {
      color: CHART_COLORS.primary,
      lineWidth: 2,
      priceLineVisible: true,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });
    fit.current = () => chart.timeScale().fitContent();
    return () => {
      series.current = null;
      chart.remove();
    };
  }, []);

  useEffect(() => {
    series.current?.setData(toData(buffer ?? []));
    fit.current();
  }, [selected, buffer]);

  return (
    <section
      data-testid="main-chart-panel"
      className="flex h-80 min-h-0 flex-col border-b border-border bg-panel lg:h-auto lg:min-h-40"
    >
      <div className="flex h-10 shrink-0 items-center justify-between gap-4 border-b border-border px-4">
        <div className="flex min-w-0 items-center gap-4">
          <h2 data-testid="main-chart-title" className="truncate text-heading font-semibold" title={title}>
            {title}
          </h2>
          <span data-testid="main-chart-price" className="text-body font-semibold tabular-nums whitespace-nowrap">
            {price}
          </span>
          <span
            data-testid="main-chart-change"
            title="Change since session start"
            className={"text-body tabular-nums whitespace-nowrap " + toneClass(change)}
          >
            {change}
          </span>
        </div>
        <span className="truncate text-label text-muted">Since page load</span>
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          ref={box}
          role="img"
          data-testid={ready ? "main-chart" : undefined}
          data-ticker={selected ?? undefined}
          data-points={points}
          aria-label={selected ? selected + " price since page load, now " + price : "Price chart"}
          className="absolute inset-0"
        />
      </div>
    </section>
  );
}
