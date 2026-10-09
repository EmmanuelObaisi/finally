import { ColorType, CrosshairMode, LineStyle } from "lightweight-charts";
import type { ChartOptions, DeepPartial, UTCTimestamp } from "lightweight-charts";

/** Literal colors for canvas charts; they mirror the globals.css theme tokens (Phase 4 charts reuse this). */
export const CHART_COLORS = { primary: "#209dd7", muted: "#8b949e", border: "#30363d", raised: "#1c2128" };

/** The --font-sans stack from globals.css. */
export const CHART_FONT =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Maps buffered one-per-second points to the typed series data. */
export function toData(points: { time: number; value: number }[]) {
  return points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }));
}

/** Shared options of the interactive charts (main price chart, portfolio value chart). */
export function baseChartOptions(): DeepPartial<ChartOptions> {
  const cross = { color: CHART_COLORS.muted, style: LineStyle.Dashed, labelBackgroundColor: CHART_COLORS.raised };
  return {
    autoSize: true,
    layout: {
      background: { type: ColorType.Solid, color: "transparent" },
      textColor: CHART_COLORS.muted,
      fontFamily: CHART_FONT,
      fontSize: 12,
    },
    grid: { vertLines: { visible: false }, horzLines: { color: CHART_COLORS.border } },
    crosshair: { mode: CrosshairMode.Normal, vertLine: cross, horzLine: cross },
    handleScroll: false,
    handleScale: false,
    rightPriceScale: { visible: true, borderColor: CHART_COLORS.border, scaleMargins: { top: 0.1, bottom: 0.1 } },
    timeScale: { visible: true, timeVisible: true, rightOffset: 0, borderColor: CHART_COLORS.border },
  };
}
