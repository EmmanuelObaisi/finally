import { describe, expect, it } from "vitest";
import { buildTiles, heatmapLeaves, pnlDir, tileFill } from "./heatmap";
import type { Position, PriceFrame } from "./types";

/** A position held at `cost` (total) that the server last valued at quantity x price. */
function pos(ticker: string, price: number, quantity = 1, cost = price * quantity): Position {
  const marketValue = price * quantity;
  return {
    ticker,
    quantity,
    avg_cost: cost / quantity,
    current_price: price,
    market_value: marketValue,
    unrealized_pnl: marketValue - cost,
    pnl_percent: 0,
  };
}

function live(ticker: string, price: number): PriceFrame {
  return {
    [ticker]: {
      ticker,
      price,
      previous_price: price,
      timestamp: 1,
      change: 0,
      change_percent: 0,
      direction: "flat",
      session_start_price: price,
    },
  };
}

function alphaOf(fill: string): number {
  return Number(fill.match(/\/ ([\d.]+)\)$/)![1]);
}

describe("tileFill and pnlDir", () => {
  it("uses the neutral fill when the percent rounds to 0.00", () => {
    for (const p of [0, 0.004, -0.004]) {
      expect(tileFill(p)).toBe("var(--color-raised)");
      expect(pnlDir(p)).toBe("flat");
    }
  });

  it("tints profit with up and loss with down", () => {
    expect(tileFill(10)).toMatch(/^rgb\(63 185 80 \/ /);
    expect(tileFill(-10)).toMatch(/^rgb\(248 81 73 \/ /);
    expect(pnlDir(3)).toBe("up");
    expect(pnlDir(-3)).toBe("down");
  });

  it("grows the alpha with |P&L %| and saturates at 10%", () => {
    expect(alphaOf(tileFill(10))).toBeCloseTo(0.5, 5);
    expect(alphaOf(tileFill(-10))).toBeCloseTo(0.5, 5);
    expect(alphaOf(tileFill(25))).toBeCloseTo(0.5, 5);
    expect(alphaOf(tileFill(5))).toBeCloseTo(0.325, 5);
    expect(alphaOf(tileFill(0.01))).toBeCloseTo(0.15, 2);
  });
});

describe("heatmapLeaves", () => {
  it("uses the live price when present and current_price when not", () => {
    const leaves = heatmapLeaves([pos("AAPL", 100, 2, 200), pos("MSFT", 50, 2, 100)], live("AAPL", 110));
    const aapl = leaves.find((l) => l.ticker === "AAPL")!;
    const msft = leaves.find((l) => l.ticker === "MSFT")!;
    expect(aapl.value).toBeCloseTo(220);
    expect(aapl.pnl).toBeCloseTo(20);
    expect(aapl.pnlPercent).toBeCloseTo(10);
    expect(msft.value).toBeCloseTo(100);
  });

  it("drops a position worth 0 or less", () => {
    const leaves = heatmapLeaves([pos("AAPL", 100), pos("ZERO", 0, 1, 50)], {});
    expect(leaves.map((l) => l.ticker)).toEqual(["AAPL"]);
    expect(heatmapLeaves([pos("AAPL", 100)], live("AAPL", 0))).toEqual([]);
  });

  it("orders by cost basis descending, ties by ticker", () => {
    const leaves = heatmapLeaves(
      [pos("MSFT", 10, 1, 10), pos("AAPL", 10, 1, 10), pos("TSLA", 5, 1, 300), pos("NVDA", 900, 1, 20)],
      {},
    );
    expect(leaves.map((l) => l.ticker)).toEqual(["TSLA", "NVDA", "AAPL", "MSFT"]);
  });
});

describe("buildTiles", () => {
  it("returns no tiles for no positions or an unmeasured box", () => {
    expect(buildTiles([], {}, 400, 200)).toEqual([]);
    expect(buildTiles([pos("AAPL", 100)], {}, 0, 200)).toEqual([]);
    expect(buildTiles([pos("AAPL", 100)], {}, 400, 0)).toEqual([]);
  });

  it("fills the whole box with a single position", () => {
    const [tile] = buildTiles([pos("AAPL", 100)], {}, 400, 200);
    expect([tile.left, tile.top, tile.width, tile.height]).toEqual([0, 0, 400, 200]);
    expect(tile.weight).toBe("100.0");
  });

  it("squarifies three positions in cost order with weights by value", () => {
    const tiles = buildTiles([pos("C", 25), pos("A", 100), pos("B", 50)], {}, 400, 200);
    expect(tiles.map((t) => t.ticker)).toEqual(["A", "B", "C"]);
    expect(tiles.map((t) => [t.left, t.top, t.width, t.height])).toEqual([
      [0, 0, 229, 200],
      [229, 0, 171, 133],
      [229, 133, 171, 67],
    ]);
    expect(tiles.map((t) => t.weight)).toEqual(["57.1", "28.6", "14.3"]);
  });

  it("never overlaps tiles and covers the whole box", () => {
    const tiles = buildTiles([pos("A", 100), pos("B", 50), pos("C", 25), pos("D", 13), pos("E", 7)], {}, 400, 200);
    expect(tiles.reduce((sum, t) => sum + t.width * t.height, 0)).toBe(400 * 200);
    for (const a of tiles) {
      for (const b of tiles) {
        if (a === b) continue;
        const apart =
          a.left + a.width <= b.left || b.left + b.width <= a.left || a.top + a.height <= b.top || b.top + b.height <= a.top;
        expect(apart).toBe(true);
      }
    }
  });

  it("keeps a tiny position even when it rounds to zero width", () => {
    const tiles = buildTiles([pos("BIG", 10000), pos("TINY", 1)], {}, 400, 200);
    expect(tiles).toHaveLength(2);
  });

  it("carries direction and fill from the live P&L", () => {
    const [up, down] = buildTiles([pos("UP", 110, 1, 100), pos("DOWN", 90, 1, 99)], {}, 400, 200);
    expect(up.dir).toBe("up");
    expect(up.fill).toBe(tileFill(10));
    expect(down.dir).toBe("down");
  });
});
