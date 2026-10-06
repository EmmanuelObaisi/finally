/** Helpers to turn raw points into Lightweight Charts series data. */
import type { PricePoint, Snapshot } from "./types";

/** Sort by time and keep the last value per second (charts need strictly ascending times). */
export function toSeries(points: PricePoint[]): PricePoint[] {
  const byTime = new Map<number, number>();
  for (const p of [...points].sort((a, b) => a.time - b.time)) byTime.set(p.time, p.value);
  return [...byTime].map(([time, value]) => ({ time, value }));
}

export function snapshotPoints(snapshots: Snapshot[]): PricePoint[] {
  return snapshots.map((s) => ({
    time: Math.floor(Date.parse(s.recorded_at) / 1000),
    value: s.total_value,
  }));
}
