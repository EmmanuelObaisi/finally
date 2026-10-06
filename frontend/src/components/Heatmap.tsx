"use client";
/** Treemap of positions: area = market value weight, color = P&L %. */
import { useElementSize } from "@/hooks/useElementSize";
import { formatPercent } from "@/lib/format";
import { squarify } from "@/lib/treemap";
import type { Position } from "@/lib/types";

/** Blend from neutral toward green/red; full intensity at +-5%. */
export function heatColor(pct: number): string {
  const t = Math.min(Math.abs(pct) / 5, 1);
  const [r, g, b] = pct >= 0 ? [43, 182, 115] : [229, 72, 77];
  const base = [36, 46, 59];
  const mix = (from: number, to: number) => Math.round(from + (to - from) * (0.25 + 0.6 * t));
  return `rgb(${mix(base[0], r)} ${mix(base[1], g)} ${mix(base[2], b)})`;
}

export function Heatmap({ positions }: { positions: Position[] }) {
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const rects = squarify(
    positions.map((p) => ({ key: p.ticker, value: p.market_value })),
    width,
    height,
  );
  const byTicker = new Map(positions.map((p) => [p.ticker, p]));

  return (
    <div ref={ref} data-testid="heatmap" className="relative h-full overflow-hidden">
      {rects.map((r) => {
        const p = byTicker.get(r.key)!;
        return (
          <div
            key={r.key}
            data-testid={`heatmap-cell-${r.key}`}
            data-pnl={p.pnl_percent >= 0 ? "up" : "down"}
            title={`${r.key} ${formatPercent(p.pnl_percent)}`}
            className="absolute flex flex-col items-center justify-center overflow-hidden border border-panel text-white"
            style={{ left: r.x, top: r.y, width: r.w, height: r.h, background: heatColor(p.pnl_percent) }}
          >
            <span className={r.w > 48 && r.h > 34 ? "contents" : "sr-only"}>
              <span className="font-display text-base font-semibold">{r.key}</span>
              <span className="num text-xs opacity-90">{formatPercent(p.pnl_percent)}</span>
            </span>
          </div>
        );
      })}
      {positions.length === 0 && (
        <p className="absolute inset-0 grid place-items-center text-muted">Positions appear here once you trade</p>
      )}
    </div>
  );
}
