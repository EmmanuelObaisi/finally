import { fmtMoney, fmtPct, fmtSigned } from "../lib/format";
import type { Tile } from "../lib/heatmap";

/** One positioned tile; direction is never color alone (title, aria-label and, with room, the P&L %). */
export default function HeatmapTile({ tile }: { tile: Tile }) {
  const label =
    tile.ticker +
    ": " +
    fmtMoney(tile.value) +
    ", " +
    tile.weight +
    "% of positions, P&L " +
    fmtSigned(tile.pnl) +
    " (" +
    fmtPct(tile.pnlPercent) +
    ")";
  const showTicker = tile.width >= 48 && tile.height >= 24;
  const showPct = showTicker && tile.height >= 48;
  return (
    <div
      role="listitem"
      data-testid={"heatmap-tile-" + tile.ticker}
      data-pnl={tile.dir}
      data-weight={tile.weight}
      title={label}
      aria-label={label}
      style={{ left: tile.left, top: tile.top, width: tile.width, height: tile.height, backgroundColor: tile.fill }}
      className="absolute overflow-hidden border border-panel p-2 text-fg transition-[left,top,width,height,background-color] duration-300 ease-out motion-reduce:transition-none"
    >
      {showTicker && <div className="truncate text-body font-semibold">{tile.ticker}</div>}
      {showPct && <div className="truncate text-label">{fmtPct(tile.pnlPercent)}</div>}
    </div>
  );
}
