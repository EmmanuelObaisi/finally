"use client";

import { useEffect } from "react";
import { useMarketStore } from "./store";
import type { PriceFrame } from "./types";

/** Opens the page's single EventSource on /api/stream/prices and feeds the store. */
export function useMarketStream(): void {
  useEffect(() => {
    const { receiveFrame, setStatus } = useMarketStore.getState();
    const es = new EventSource("/api/stream/prices");
    es.onopen = () => setStatus("connected");
    es.onmessage = (event) => receiveFrame(JSON.parse(event.data) as PriceFrame);
    es.onerror = () =>
      setStatus(es.readyState === EventSource.CLOSED ? "disconnected" : "reconnecting");
    return () => es.close();
  }, []);
}
