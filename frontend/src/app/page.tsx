"use client";

import Footer from "../components/Footer";
import Header from "../components/Header";
import PositionsTable from "../components/PositionsTable";
import TradeBar from "../components/TradeBar";
import WatchlistPanel from "../components/WatchlistPanel";
import { useMarketStream } from "../lib/useMarketStream";

export default function Home() {
  useMarketStream();

  return (
    <div className="flex h-dvh flex-col">
      <Header />
      <main className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[480px_1fr] lg:overflow-hidden">
        <WatchlistPanel />
        <section data-testid="workspace" className="flex min-h-0 flex-col lg:h-full">
          <TradeBar />
          <PositionsTable />
        </section>
      </main>
      <Footer />
    </div>
  );
}
