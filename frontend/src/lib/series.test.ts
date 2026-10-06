import { describe, expect, it } from "vitest";
import { snapshotPoints, toSeries } from "./series";

describe("toSeries", () => {
  it("sorts and keeps the last value per second", () => {
    const out = toSeries([
      { time: 3, value: 30 },
      { time: 1, value: 10 },
      { time: 3, value: 31 },
    ]);
    expect(out).toEqual([
      { time: 1, value: 10 },
      { time: 3, value: 31 },
    ]);
  });
});

describe("snapshotPoints", () => {
  it("converts ISO timestamps to unix seconds", () => {
    const [p] = snapshotPoints([{ total_value: 10000, recorded_at: "2026-01-01T00:00:01.900Z" }]);
    expect(p).toEqual({ time: 1767225601, value: 10000 });
  });
});
