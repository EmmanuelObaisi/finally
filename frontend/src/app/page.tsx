"use client";

import Footer from "../components/Footer";
import Header from "../components/Header";
import WatchlistPanel from "../components/WatchlistPanel";
import { useMarketStream } from "../lib/useMarketStream";

export default function Home() {
  useMarketStream();

  return (
    <div className="flex h-dvh flex-col">
      <Header />
      <main className="min-h-0 flex-1 lg:grid lg:grid-cols-[480px_1fr]">
        <WatchlistPanel />
      </main>
      <Footer />
    </div>
  );
}
