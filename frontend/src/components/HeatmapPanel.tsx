"use client";

import { buildTiles, heatmapLeaves } from "../lib/heatmap";
import { usePortfolioStore } from "../lib/portfolioStore";
import { useMarketStore } from "../lib/store";
import { useElementSize } from "../lib/useElementSize";
import ChartOverlay from "./ChartOverlay";
import HeatmapTile from "./HeatmapTile";

/** Portfolio heatmap: one tile per position, area by live value, tint by P&L %. */
export default function HeatmapPanel() {
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const failed = usePortfolioStore((s) => s.failed);
  const load = usePortfolioStore((s) => s.load);
  const prices = useMarketStore((s) => s.prices);
  const [box, size] = useElementSize<HTMLDivElement>();
  const positions = portfolio?.positions ?? [];
  const tiles = buildTiles(positions, prices, size.width, size.height);
  const overlay = portfolio === null ? (failed ? "error" : "loading") : heatmapLeaves(positions, prices).length === 0 ? "empty" : null;

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
        {overlayFor(overlay, load)}
      </div>
    </section>
  );
}

/** Exactly one overlay per state; the measured tiles box underneath stays mounted. */
function overlayFor(state: "loading" | "error" | "empty" | null, retry: () => void) {
  if (state === "loading") return <ChartOverlay testId="heatmap-loading" busyLabel="Loading heatmap" />;
  if (state === "error") {
    return (
      <ChartOverlay
        testId="heatmap-error"
        heading="Heatmap unavailable"
        body="The server did not return your portfolio. Check that FinAlly is running, then retry."
        onRetry={retry}
        retryTestId="heatmap-retry"
      />
    );
  }
  if (state === "empty") {
    return (
      <ChartOverlay
        testId="heatmap-empty"
        heading="No positions to map"
        body="Buy shares with the trade bar to see your portfolio by weight and P&L."
      />
    );
  }
  return null;
}
