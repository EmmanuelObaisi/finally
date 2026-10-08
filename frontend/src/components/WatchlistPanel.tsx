"use client";

import { useEffect, useState } from "react";
import { getWatchlist } from "../lib/api";
import type { WatchlistItem } from "../lib/types";
import WatchlistRow from "./WatchlistRow";

type View = { kind: "loading" } | { kind: "error" } | { kind: "ready"; items: WatchlistItem[] };

/** Watchlist membership and order come from GET /api/watchlist, never from SSE keys. */
export default function WatchlistPanel() {
  const [view, setView] = useState<View>({ kind: "loading" });

  function load() {
    setView({ kind: "loading" });
    getWatchlist()
      .then((items) => setView({ kind: "ready", items }))
      .catch(() => setView({ kind: "error" }));
  }

  useEffect(load, []);

  return (
    <section data-testid="watchlist-panel" className="flex h-full min-h-0 flex-col bg-panel lg:border-r lg:border-border">
      <div className="flex h-10 items-center border-b border-border px-4">
        <h2 className="text-heading font-semibold">Watchlist</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {view.kind === "loading" && <Skeleton />}
        {view.kind === "error" && <ErrorState onRetry={load} />}
        {view.kind === "ready" && view.items.length === 0 && <EmptyState />}
        {view.kind === "ready" && view.items.length > 0 && (
          <table className="w-full table-fixed">
            <thead className="sticky top-0 bg-panel">
              <tr className="h-8 border-b border-border text-label text-muted">
                <th className="w-24 px-4 text-left font-normal">Ticker</th>
                <th className="w-24 px-2 text-right font-normal">Price</th>
                <th className="w-22 px-2 text-right font-normal" title="Change since session start">
                  Chg %
                </th>
                <th className="px-2 text-left font-normal hidden sm:table-cell">Since load</th>
              </tr>
            </thead>
            <tbody>
              {view.items.map((item) => (
                <WatchlistRow key={item.ticker} item={item} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function Skeleton() {
  return (
    <div data-testid="watchlist-loading" aria-busy="true" aria-label="Loading watchlist">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="h-10 border-b border-border px-4">
          <div className="h-2 rounded-sm bg-raised motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div data-testid="watchlist-error" className="p-6">
      <h3 className="text-heading font-semibold">Watchlist unavailable</h3>
      <p className="text-body">
        The server did not return your watchlist. Check that FinAlly is running, then retry.
      </p>
      <button
        data-testid="watchlist-retry"
        onClick={onRetry}
        className="mt-4 h-8 rounded-sm border border-border px-4 hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Retry
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div data-testid="watchlist-empty" className="p-6">
      <h3 className="text-heading font-semibold">Watchlist is empty</h3>
      <p className="text-body">Add a ticker to start watching live prices.</p>
    </div>
  );
}
