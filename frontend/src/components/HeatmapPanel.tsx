"use client";

import { buildTiles } from "../lib/heatmap";
import { usePortfolioStore } from "../lib/portfolioStore";
import { useMarketStore } from "../lib/store";
import { useElementSize } from "../lib/useElementSize";
import HeatmapTile from "./HeatmapTile";

/** Portfolio heatmap: one tile per position, area by live value, tint by P&L %. */
export default function HeatmapPanel() {
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const prices = useMarketStore((s) => s.prices);
  const [box, size] = useElementSize<HTMLDivElement>();
  const tiles = buildTiles(portfolio?.positions ?? [], prices, size.width, size.height);

  return (
    <section data-testid="heatmap-panel" className="flex h-64 min-h-0 flex-col border-b border-border bg-panel lg:h-auto lg:min-h-40 lg:border-r">
      <div className="flex h-10 shrink-0 items-center justify-between gap-4 border-b border-border px-4">
        <h2 className="truncate text-heading font-semibold">Portfolio heatmap</h2>
        <span className="truncate text-label text-muted">Size = value, color = P&amp;L %</span>
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          ref={box}
          role="list"
          aria-label="Positions by weight and P&L"
          className="absolute inset-0"
          data-testid={tiles.length > 0 ? "heatmap-tiles" : undefined}
        >
          {tiles.map((t) => (
            <HeatmapTile key={t.ticker} tile={t} />
          ))}
        </div>
      </div>
    </section>
  );
}
