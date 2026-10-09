"use client";

import { AreaSeries, createChart, TickMarkType } from "lightweight-charts";
import type { ISeriesApi, Time } from "lightweight-charts";
import { useEffect, useMemo, useRef } from "react";
import { baseChartOptions, CHART_COLORS, toData } from "../lib/chartTheme";
import { fmtClock, fmtDateTime, fmtDay, fmtMoney } from "../lib/format";
import { useHistoryStore } from "../lib/historyStore";
import { buildPnlSeries } from "../lib/pnlSeries";
import { usePortfolioStore } from "../lib/portfolioStore";
import { useMarketStore } from "../lib/store";
import { liveTotals } from "../lib/totals";

/** Portfolio value over time: server snapshots plus a display-only live point equal to the header total. */
export default function PnlChartPanel() {
  const history = useHistoryStore((s) => s.history);
  const load = useHistoryStore((s) => s.load);
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const prices = useMarketStore((s) => s.prices);
  const box = useRef<HTMLDivElement>(null);
  const series = useRef<ISeriesApi<"Area"> | null>(null);
  const fit = useRef<() => void>(() => {});

  // Mount fetch, and a refetch whenever a trade or reload replaces the portfolio.
  useEffect(load, [portfolio, load]);

  const liveTotal = portfolio ? liveTotals(portfolio, prices).total : null;
  const now = Math.floor(Date.now() / 1000);
  const points = useMemo(() => buildPnlSeries(history ?? [], now, liveTotal), [history, now, liveTotal]);

  useEffect(() => {
    const base = baseChartOptions();
    const chart = createChart(box.current!, {
      ...base,
      layout: { ...base.layout, attributionLogo: false },
      timeScale: {
        ...base.timeScale,
        secondsVisible: false,
        tickMarkFormatter: (t: Time, type: TickMarkType) => {
          if (typeof t !== "number") return null;
          const date = type === TickMarkType.Year || type === TickMarkType.Month || type === TickMarkType.DayOfMonth;
          return date ? fmtDay(t) : fmtClock(t).slice(0, 5);
        },
      },
      localization: { timeFormatter: (t: Time) => (typeof t === "number" ? fmtDateTime(t) : String(t)) },
    });
    series.current = chart.addSeries(AreaSeries, {
      lineColor: CHART_COLORS.primary,
      topColor: "rgb(32 157 215 / 0.28)",
      bottomColor: "rgb(32 157 215 / 0)",
      lineWidth: 2,
      priceLineVisible: false,
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
    series.current?.setData(toData(points));
    fit.current();
  }, [points]);

  return (
    <section data-testid="pnl-panel" className="flex h-64 min-h-0 flex-col border-b border-border bg-panel lg:h-auto lg:min-h-40">
      <div className="flex h-10 shrink-0 items-center justify-between gap-4 border-b border-border px-4">
        <h2 className="truncate text-heading font-semibold">Portfolio value</h2>
        <span data-testid="pnl-value" className="text-body font-semibold tabular-nums whitespace-nowrap">
          {fmtMoney(liveTotal)}
        </span>
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          ref={box}
          role="img"
          data-testid={points.length >= 2 ? "pnl-chart" : undefined}
          data-points={points.length}
          aria-label={"Portfolio value over time, now " + fmtMoney(liveTotal)}
          className="absolute inset-0"
        />
      </div>
    </section>
  );
}
