import { describe, expect, it } from "vitest";
import { buildPnlSeries } from "./pnlSeries";
import type { HistoryPoint } from "./types";

const at = (iso: string, value: number): HistoryPoint => ({ total_value: value, recorded_at: iso });
const T0 = Math.floor(Date.parse("2026-10-09T10:00:00Z") / 1000);

describe("buildPnlSeries", () => {
  it("is empty with no history and no live total", () => {
    expect(buildPnlSeries([], 100, null)).toEqual([]);
  });

  it("is just the live point with no history", () => {
    expect(buildPnlSeries([], 100, 10000)).toEqual([{ time: 100, value: 10000 }]);
  });

  it("keeps a single history point when there is no live total", () => {
    const series = buildPnlSeries([at("2026-10-09T10:00:00Z", 10000)], T0 + 50, null);
    expect(series).toEqual([{ time: T0, value: 10000 }]);
  });

  it("collapses points sharing a second to the last one and stays ascending", () => {
    const history = [
      at("2026-10-09T10:00:00Z", 1),
      at("2026-10-09T10:00:00Z", 2),
      at("2026-10-09T10:00:07Z", 3),
    ];
    const series = buildPnlSeries(history, T0, null);
    expect(series).toEqual([
      { time: T0, value: 2 },
      { time: T0 + 7, value: 3 },
    ]);
  });

  it("appends the live point only when its second is newer than the last", () => {
    const history = [at("2026-10-09T10:00:00Z", 10000)];
    expect(buildPnlSeries(history, T0 + 1, 10001)).toHaveLength(2);
    expect(buildPnlSeries(history, T0, 10001)).toEqual([{ time: T0, value: 10000 }]);
    expect(buildPnlSeries(history, T0 - 5, 10001)).toEqual([{ time: T0, value: 10000 }]);
  });

  it("floors fractional now seconds", () => {
    expect(buildPnlSeries([], 105.9, 1)).toEqual([{ time: 105, value: 1 }]);
  });

  it("handles 2000 history points plus a later live point strictly ascending", () => {
    const history = Array.from({ length: 2000 }, (_, i) => ({
      total_value: 10000 + i,
      recorded_at: new Date((T0 + i * 30) * 1000).toISOString(),
    }));
    const series = buildPnlSeries(history, T0 + 2000 * 30, 99);
    expect(series).toHaveLength(2001);
    for (let i = 1; i < series.length; i++) expect(series[i].time).toBeGreaterThan(series[i - 1].time);
  });
});
