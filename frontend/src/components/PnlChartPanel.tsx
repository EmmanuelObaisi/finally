"use client";

import { AreaSeries, createChart, TickMarkType } from "lightweight-charts";
import type { ISeriesApi, Time } from "lightweight-charts";
import { useEffect, useMemo, useRef } from "react";
import { baseChartOptions, CHART_COLORS, toData } from "../lib/chartTheme";
import { fmtClock, fmtDateTime, fmtDay, fmtMoney, fmtPct, fmtSigned, MISSING, toneClass } from "../lib/format";
import { isHistoryInFlight, useHistoryStore } from "../lib/historyStore";
import { buildPnlSeries } from "../lib/pnlSeries";
import { usePortfolioStore } from "../lib/portfolioStore";
import { useMarketStore } from "../lib/store";
import { liveTotals, STARTING_CASH } from "../lib/totals";
import ChartOverlay from "./ChartOverlay";

/** Portfolio value over time: server snapshots plus a display-only live point equal to the header total. */
export default function PnlChartPanel() {
  const history = useHistoryStore((s) => s.history);
  const failed = useHistoryStore((s) => s.failed);
  const load = useHistoryStore((s) => s.load);
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const prices = useMarketStore((s) => s.prices);
  const dim = useMarketStore((s) => s.status === "disconnected") ? " opacity-60" : "";
  const box = useRef<HTMLDivElement>(null);
  const series = useRef<ISeriesApi<"Area"> | null>(null);
  const fit = useRef<() => void>(() => {});

  // Mount fetch, and a refetch whenever a trade or reload replaces the portfolio.
  useEffect(load, [portfolio, load]);

  // Poll while mounted; a tick is skipped while a fetch is still pending.
  useEffect(() => {
    const id = setInterval(() => {
      if (!isHistoryInFlight()) load();
    }, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const liveTotal = portfolio ? liveTotals(portfolio, prices).total : null;
  const now = Math.floor(Date.now() / 1000);
  const points = useMemo(() => buildPnlSeries(history ?? [], now, liveTotal), [history, now, liveTotal]);
  const delta = liveTotal === null ? null : liveTotal - STARTING_CASH;
  const deltaText = delta === null ? MISSING : fmtSigned(delta) + " (" + fmtPct((delta / STARTING_CASH) * 100) + ")";
  const neverTraded = (portfolio?.positions.length ?? 0) === 0 && (history?.length ?? 0) <= 1;
  const empty = neverTraded || points.length < 2;
  const overlay = history === null ? (failed ? "error" : "loading") : empty ? "empty" : null;

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
        <div className="flex min-w-0 items-baseline gap-2">
          <span data-testid="pnl-value" className={"text-body font-semibold tabular-nums whitespace-nowrap" + dim}>
            {fmtMoney(liveTotal)}
          </span>
          <span
            data-testid="pnl-delta"
            className={"text-body tabular-nums whitespace-nowrap " + toneClass(deltaText) + dim}
          >
            {deltaText}
          </span>
          <span className="hidden text-label text-muted sm:inline">since start</span>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          ref={box}
          role="img"
          data-testid={overlay === null ? "pnl-chart" : undefined}
          data-points={points.length}
          aria-label={"Portfolio value over time, now " + fmtMoney(liveTotal)}
          className="absolute inset-0"
        />
        {overlayFor(overlay, load)}
      </div>
    </section>
  );
}

/** Exactly one overlay per state; the chart box underneath stays mounted. */
function overlayFor(state: "loading" | "error" | "empty" | null, retry: () => void) {
  if (state === "loading") return <ChartOverlay testId="pnl-loading" busyLabel="Loading portfolio value" />;
  if (state === "error") {
    return (
      <ChartOverlay
        testId="pnl-error"
        heading="Portfolio value unavailable"
        body="The server did not return your portfolio history. Check that FinAlly is running, then retry."
        onRetry={retry}
        retryTestId="pnl-retry"
      />
    );
  }
  if (state === "empty") {
    return (
      <ChartOverlay
        testId="pnl-empty"
        heading="No portfolio history yet"
        body="Your portfolio value is charted after your first trade."
      />
    );
  }
  return null;
}
