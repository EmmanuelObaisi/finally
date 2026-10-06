"use client";
/** Subscribe to /api/stream/prices; keep latest prices and per-ticker history since load. */
import { useEffect, useState } from "react";
import type { ConnectionStatus, PriceMap, PricePoint } from "@/lib/types";

const MAX_POINTS = 600;

export type PriceHistory = Record<string, PricePoint[]>;

export function appendHistory(history: PriceHistory, prices: PriceMap): PriceHistory {
  const next: PriceHistory = { ...history };
  for (const [ticker, u] of Object.entries(prices)) {
    const points = history[ticker] ?? [];
    const last = points[points.length - 1];
    const time = Math.floor(u.timestamp);
    if (last && last.time === time && last.value === u.price) continue;
    const kept = last && last.time === time ? points.slice(0, -1) : points;
    next[ticker] = [...kept, { time, value: u.price }].slice(-MAX_POINTS);
  }
  return next;
}

export function usePriceStream(url = "/api/stream/prices") {
  const [prices, setPrices] = useState<PriceMap>({});
  const [history, setHistory] = useState<PriceHistory>({});
  const [status, setStatus] = useState<ConnectionStatus>("reconnecting");

  useEffect(() => {
    const source = new EventSource(url);
    source.onopen = () => setStatus("connected");
    source.onerror = () =>
      setStatus(source.readyState === EventSource.CLOSED ? "disconnected" : "reconnecting");
    source.onmessage = (event) => {
      const update = JSON.parse(event.data) as PriceMap;
      setStatus("connected");
      setPrices((prev) => ({ ...prev, ...update }));
      setHistory((prev) => appendHistory(prev, update));
    };
    return () => source.close();
  }, [url]);

  return { prices, history, status };
}
