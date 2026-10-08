"use client";

import { useEffect } from "react";
import { useMarketStore } from "./store";
import type { PriceFrame } from "./types";

export const RED_AFTER_MS = 5000;
export const BACKOFF_MS = [1000, 2000, 4000, 10000];

/**
 * Keeps the page's single EventSource on /api/stream/prices open and feeds the store.
 * The 5 s timer turns the dot red when the server dies (Chromium then stays CONNECTING);
 * a CLOSED source is replaced after a capped backoff.
 */
export function useMarketStream(): void {
  useEffect(() => {
    const { receiveFrame, setStatus } = useMarketStore.getState();
    let source: EventSource | null = null;
    let redTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    function armRed() {
      if (redTimer === undefined) redTimer = setTimeout(() => setStatus("disconnected"), RED_AFTER_MS);
    }

    function clearRed() {
      clearTimeout(redTimer);
      redTimer = undefined;
    }

    function connect() {
      const es = new EventSource("/api/stream/prices");
      source = es;
      es.onopen = () => {
        clearRed();
        attempt = 0;
        setStatus("connected");
      };
      es.onmessage = (event) => receiveFrame(JSON.parse(event.data) as PriceFrame);
      es.onerror = () => {
        if (es.readyState === EventSource.CLOSED) {
          clearRed();
          setStatus("disconnected");
          es.close();
          retryTimer = setTimeout(connect, BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]);
          attempt += 1;
        } else {
          if (useMarketStore.getState().status !== "disconnected") setStatus("reconnecting");
          armRed();
        }
      };
    }

    connect();
    armRed();
    return () => {
      clearRed();
      clearTimeout(retryTimer);
      source?.close();
    };
  }, []);
}
