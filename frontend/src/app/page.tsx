"use client";

import WatchlistPanel from "../components/WatchlistPanel";
import { useMarketStream } from "../lib/useMarketStream";

export default function Home() {
  useMarketStream();

  return (
    <div className="flex h-dvh flex-col">
      <header
        data-testid="header"
        className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-panel px-4"
      >
        <h1 data-testid="app-title" className="text-heading font-semibold text-accent">
          FinAlly
        </h1>
      </header>
      <main className="min-h-0 flex-1 lg:grid lg:grid-cols-[480px_1fr]">
        <WatchlistPanel />
      </main>
    </div>
  );
}
