"use client";
/** Canvas line/area chart on Lightweight Charts; `compact` strips axes for sparklines. */
import { useEffect, useRef } from "react";
import {
  AreaSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { toSeries } from "@/lib/series";
import type { PricePoint } from "@/lib/types";

interface Props {
  data: PricePoint[];
  color: string;
  compact?: boolean;
  /** Show the TradingView attribution logo (once per page is enough). */
  logo?: boolean;
  className?: string;
}

const hex = (color: string, alpha: string) => `${color}${alpha}`;

export function LineChart({ data, color, compact = false, logo = false, className }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Area"> | null>(null);

  useEffect(() => {
    const c = createChart(container.current!, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#7b8796",
        fontFamily: "IBM Plex Sans Variable, sans-serif",
        fontSize: 11,
        attributionLogo: logo,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: "#1c2430", visible: !compact },
      },
      rightPriceScale: { visible: !compact, borderVisible: false },
      timeScale: { visible: !compact, borderVisible: false, timeVisible: true, secondsVisible: true },
      crosshair: compact
        ? { vertLine: { visible: false }, horzLine: { visible: false } }
        : { vertLine: { color: "#3a4656" }, horzLine: { color: "#3a4656" } },
      handleScroll: !compact,
      handleScale: !compact,
    });
    series.current = c.addSeries(AreaSeries, {
      lineWidth: compact ? 1 : 2,
      priceLineVisible: false,
      lastValueVisible: !compact,
      crosshairMarkerVisible: !compact,
    });
    chart.current = c;
    return () => c.remove();
  }, [compact, logo]);

  useEffect(() => {
    series.current?.applyOptions({
      lineColor: color,
      topColor: hex(color, compact ? "33" : "55"),
      bottomColor: hex(color, "00"),
    });
  }, [color, compact]);

  useEffect(() => {
    series.current?.setData(
      toSeries(data).map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
    );
    chart.current?.timeScale().fitContent();
  }, [data]);

  return <div ref={container} className={`overflow-hidden ${className ?? ""}`} />;
}
