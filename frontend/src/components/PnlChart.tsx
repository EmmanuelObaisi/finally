"use client";
/** Total portfolio value over time: stored snapshots plus the live value. */
import { useMemo } from "react";
import { snapshotPoints } from "@/lib/series";
import type { Snapshot } from "@/lib/types";
import { LineChart } from "./LineChart";

interface Props {
  snapshots: Snapshot[];
  liveValue: number | null;
  /** Unix seconds of the latest streamed price. */
  liveAt: number;
}

export function PnlChart({ snapshots, liveValue, liveAt }: Props) {
  const points = useMemo(() => {
    const stored = snapshotPoints(snapshots);
    if (liveValue == null || !liveAt) return stored;
    return [...stored, { time: Math.floor(liveAt), value: liveValue }];
  }, [snapshots, liveValue, liveAt]);
  const first = points[0]?.value ?? 0;
  const last = points[points.length - 1]?.value ?? 0;

  return (
    <div data-testid="pnl-chart" data-points={snapshots.length} className="relative h-full">
      <LineChart data={points} color={last < first ? "#e5484d" : "#ecad0a"} className="absolute inset-0" />
    </div>
  );
}
