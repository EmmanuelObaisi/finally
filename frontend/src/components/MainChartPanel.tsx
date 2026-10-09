"use client";

import { createChart, LineSeries } from "lightweight-charts";
import type { ISeriesApi, Time } from "lightweight-charts";
import { useEffect, useRef } from "react";
import { baseChartOptions, CHART_COLORS, toData } from "../lib/chartTheme";
import { fmtClock, fmtMoney, fmtPct, toneClass } from "../lib/format";
import { useSelectionStore, type SelectionStatus } from "../lib/selectionStore";
import { useMarketStore } from "../lib/store";
import ChartOverlay from "./ChartOverlay";

/** Price chart of the selected watchlist ticker, fed by the same per-second buffer as its sparkline. */
export default function MainChartPanel() {
  const status = useSelectionStore((s) => s.status);
  const selected = useSelectionStore((s) => s.selected);
  const buffer = useMarketStore((s) => s.spark[selected ?? ""]);
  const live = useMarketStore((s) => s.prices[selected ?? ""]);
  const dim = useMarketStore((s) => s.status === "disconnected") ? " opacity-60" : "";
  const box = useRef<HTMLDivElement>(null);
  const series = useRef<ISeriesApi<"Line"> | null>(null);
  const fit = useRef<() => void>(() => {});

  const points = buffer?.length ?? 0;
  const ready = status === "ready" && selected !== null && points >= 2;
  const price = fmtMoney(live?.price);
  const change = fmtPct(live?.change_percent);
  const title = selected ?? "Price chart";
  const loading = status === "loading";

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
          {loading ? (
            <div className="h-2 w-16 rounded-sm bg-raised motion-safe:animate-pulse" />
          ) : (
            <>
              <h2 data-testid="main-chart-title" className="truncate text-heading font-semibold" title={title}>
                {title}
              </h2>
              <span
                data-testid="main-chart-price"
                className={"text-body font-semibold tabular-nums whitespace-nowrap" + dim}
              >
                {price}
              </span>
              <span
                data-testid="main-chart-change"
                title="Change since session start"
                className={"text-body tabular-nums whitespace-nowrap " + toneClass(change) + dim}
              >
                {change}
              </span>
            </>
          )}
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
        {overlay(status, selected, points)}
      </div>
    </section>
  );
}

/** Exactly one overlay per state; the chart box underneath stays mounted. */
function overlay(status: SelectionStatus, selected: string | null, points: number) {
  if (status === "loading") return <ChartOverlay testId="main-chart-loading" busyLabel="Loading chart" />;
  if (status === "error") {
    return (
      <ChartOverlay
        testId="main-chart-error"
        heading="Chart unavailable"
        body="The watchlist did not load, so there is no ticker to chart. Use Retry in the watchlist panel."
      />
    );
  }
  if (selected === null) {
    return (
      <ChartOverlay
        testId="main-chart-empty"
        heading="No ticker selected"
        body="Add a ticker to the watchlist to chart its price."
      />
    );
  }
  if (points < 2) {
    return (
      <ChartOverlay
        testId="main-chart-waiting"
        heading={"Collecting prices for " + selected}
        body="The chart fills in as live prices stream."
      />
    );
  }
  return null;
}
