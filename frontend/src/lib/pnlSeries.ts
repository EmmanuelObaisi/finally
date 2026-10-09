import type { HistoryPoint } from "./types";

export type PnlPoint = { time: number; value: number };

/**
 * Strictly ascending chart points from the server history, plus a display-only
 * "now" point. Points sharing a UTC second collapse to the last one; the live
 * point is added only when its second is newer than the last history second.
 */
export function buildPnlSeries(history: HistoryPoint[], nowSeconds: number, liveTotal: number | null): PnlPoint[] {
  const points: PnlPoint[] = [];
  for (const h of history) {
    const time = Math.floor(Date.parse(h.recorded_at) / 1000);
    const point = { time, value: h.total_value };
    if (points.length > 0 && points[points.length - 1].time === time) points[points.length - 1] = point;
    else points.push(point);
  }
  const now = Math.floor(nowSeconds);
  if (liveTotal !== null && (points.length === 0 || now > points[points.length - 1].time)) {
    points.push({ time: now, value: liveTotal });
  }
  return points;
}
