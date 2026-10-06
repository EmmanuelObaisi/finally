import { describe, expect, it } from "vitest";
import { squarify } from "./treemap";

describe("squarify", () => {
  it("covers the box with areas proportional to value", () => {
    const rects = squarify(
      [
        { key: "A", value: 6 },
        { key: "B", value: 3 },
        { key: "C", value: 1 },
      ],
      100,
      50,
    );
    const area = (k: string) => {
      const r = rects.find((x) => x.key === k)!;
      return r.w * r.h;
    };
    expect(rects).toHaveLength(3);
    expect(area("A")).toBeCloseTo(3000);
    expect(area("B")).toBeCloseTo(1500);
    expect(area("C")).toBeCloseTo(500);
    for (const r of rects) {
      expect(r.x + r.w).toBeLessThanOrEqual(100.0001);
      expect(r.y + r.h).toBeLessThanOrEqual(50.0001);
    }
  });

  it("skips non-positive values and empty boxes", () => {
    expect(squarify([{ key: "A", value: 0 }], 10, 10)).toEqual([]);
    expect(squarify([{ key: "A", value: 1 }], 0, 10)).toEqual([]);
  });
});
