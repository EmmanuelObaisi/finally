// Heatmap layout and color. The rgb triplets mirror the `up` and `down` theme tokens;
// together with chartTheme.ts this is the only place literal colors are allowed.
import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import { livePosition } from "./positions";
import type { PriceFrame, Position } from "./types";

export type HeatLeaf = { ticker: string; value: number; pnl: number; pnlPercent: number; cost: number };

export type Tile = HeatLeaf & {
  left: number;
  top: number;
  width: number;
  height: number;
  weight: string;
  dir: "up" | "down" | "flat";
  fill: string;
};

/** Direction of a P&L percent; anything that rounds to 0.00 is flat. */
export function pnlDir(pnlPercent: number): "up" | "down" | "flat" {
  if (Math.round(pnlPercent * 100) === 0) return "flat";
  return pnlPercent > 0 ? "up" : "down";
}

/** Tile fill: tint strength grows with |P&L %| and saturates at 10%. */
export function tileFill(pnlPercent: number): string {
  const dir = pnlDir(pnlPercent);
  if (dir === "flat") return "var(--color-raised)";
  const alpha = 0.15 + 0.35 * Math.min(Math.abs(pnlPercent) / 10, 1);
  const rgb = dir === "up" ? "63 185 80" : "248 81 73";
  return `rgb(${rgb} / ${alpha})`;
}

/** Live leaves ordered by cost basis (stable under price ticks); positions worth 0 or less are dropped. */
export function heatmapLeaves(positions: Position[], prices: PriceFrame): HeatLeaf[] {
  return positions
    .map((p) => {
      const live = livePosition(p, prices[p.ticker]?.price ?? p.current_price);
      return { ticker: p.ticker, value: live.value, pnl: live.pnl, pnlPercent: live.pnlPercent, cost: p.market_value - p.unrealized_pnl };
    })
    .filter((leaf) => leaf.value > 0)
    .sort((a, b) => b.cost - a.cost || a.ticker.localeCompare(b.ticker));
}

/** Squarified treemap tiles for the held positions inside a width x height box. */
export function buildTiles(positions: Position[], prices: PriceFrame, width: number, height: number): Tile[] {
  const leaves = heatmapLeaves(positions, prices);
  if (leaves.length === 0 || width <= 0 || height <= 0) return [];
  const total = leaves.reduce((sum, leaf) => sum + leaf.value, 0);
  // d3's default children accessor reads `children`, which HeatLeaf does not declare.
  const top = { ticker: "", value: 0, cost: 0, pnl: 0, pnlPercent: 0, children: leaves };
  const root = hierarchy<HeatLeaf>(top).sum((d) => d.value);
  const laidOut = treemap<HeatLeaf>().tile(treemapSquarify).size([width, height]).paddingInner(0).round(true)(root);
  return laidOut.leaves().map((node) => ({
    ...node.data,
    left: node.x0,
    top: node.y0,
    width: node.x1 - node.x0,
    height: node.y1 - node.y0,
    weight: ((node.data.value / total) * 100).toFixed(1),
    dir: pnlDir(node.data.pnlPercent),
    fill: tileFill(node.data.pnlPercent),
  }));
}
