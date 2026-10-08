"use client";

import { ColorType, createChart, CrosshairMode, LineSeries } from "lightweight-charts";
import type { ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef } from "react";
import { CHART_COLORS } from "../lib/chartTheme";
import { useMarketStore, type SparkPoint } from "../lib/store";

const hidden = { visible: false };

function toData(points: SparkPoint[]) {
  return points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }));
}

/** Non-interactive line of the prices streamed since page load; empty until two points exist. */
export default function Sparkline({ ticker }: { ticker: string }) {
  const box = useRef<HTMLDivElement>(null);
  const series = useRef<ISeriesApi<"Line"> | null>(null);
  const fit = useRef<() => void>(() => {});
  const buffer = useMarketStore((s) => s.spark[ticker]);

  useEffect(() => {
    const chart = createChart(box.current!, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: CHART_COLORS.muted,
        attributionLogo: false,
      },
      grid: { vertLines: hidden, horzLines: hidden },
      crosshair: { mode: CrosshairMode.Hidden },
      handleScroll: false,
      handleScale: false,
      leftPriceScale: hidden,
      rightPriceScale: { visible: false, scaleMargins: { top: 0.15, bottom: 0.15 } },
      timeScale: { visible: false, rightOffset: 0 },
    });
    const line = chart.addSeries(LineSeries, {
      color: CHART_COLORS.primary,
      lineWidth: 1,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });
    fit.current = () => chart.timeScale().fitContent();
    line.setData(toData(useMarketStore.getState().spark[ticker] ?? []));
    fit.current();
    series.current = line;
    return () => {
      series.current = null;
      chart.remove();
    };
  }, [ticker]);

  useEffect(() => {
    if (!buffer || !series.current) return;
    series.current.setData(toData(buffer));
    fit.current();
  }, [buffer]);

  return <div ref={box} data-testid={"sparkline-" + ticker} className="h-6 w-full pointer-events-none" aria-hidden="true" />;
}
