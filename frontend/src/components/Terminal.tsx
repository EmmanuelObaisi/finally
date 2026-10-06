"use client";
/** The trading workstation: owns app state and lays out the panels. */
import { useCallback, useEffect, useState } from "react";
import { usePriceStream } from "@/hooks/usePriceStream";
import { api } from "@/lib/api";
import { livePortfolio } from "@/lib/portfolio";
import type { Portfolio, Snapshot, WatchItem } from "@/lib/types";
import { ChatPanel } from "./ChatPanel";
import { Header } from "./Header";
import { Heatmap } from "./Heatmap";
import { MainChart } from "./MainChart";
import { Panel } from "./Panel";
import { PnlChart } from "./PnlChart";
import { PositionsTable } from "./PositionsTable";
import { TradeBar } from "./TradeBar";
import { Watchlist } from "./Watchlist";

const HISTORY_REFRESH_MS = 30_000;

export function Terminal() {
  const { prices, history, status } = usePriceStream();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(true);

  const refreshHistory = useCallback(() => api.history().then(setSnapshots), []);

  useEffect(() => {
    api.portfolio().then(setPortfolio);
    api.watchlist().then((items) => {
      setWatchlist(items);
      setSelected((s) => s ?? items[0]?.ticker ?? null);
    });
    refreshHistory();
    const timer = setInterval(refreshHistory, HISTORY_REFRESH_MS);
    return () => clearInterval(timer);
  }, [refreshHistory]);

  const live = portfolio && livePortfolio(portfolio, prices);
  const liveAt = Math.max(0, ...Object.values(prices).map((p) => p.timestamp));

  async function trade(ticker: string, quantity: number, side: "buy" | "sell") {
    const res = await api.trade(ticker, quantity, side);
    setPortfolio(res.portfolio);
    refreshHistory();
    return res.trade;
  }

  async function chat(message: string) {
    const res = await api.chat(message);
    setPortfolio(res.portfolio);
    if (res.actions.watchlist_changes.length) setWatchlist(await api.watchlist());
    if (res.actions.trades.length) refreshHistory();
    return res;
  }

  return (
    <div className="flex flex-col lg:h-screen">
      <Header
        totalValue={live?.total_value ?? null}
        cash={live?.cash_balance ?? null}
        pnl={live?.unrealized_pnl ?? null}
        status={status}
        chatOpen={chatOpen}
        onToggleChat={() => setChatOpen((o) => !o)}
      />
      <main
        className={`grid grid-cols-1 gap-px bg-line lg:min-h-0 lg:flex-1 ${
          chatOpen
            ? "lg:grid-cols-[minmax(290px,330px)_1fr_minmax(300px,360px)]"
            : "lg:grid-cols-[minmax(290px,330px)_1fr]"
        }`}
      >
        <Watchlist
          items={watchlist}
          prices={prices}
          history={history}
          selected={selected}
          onSelect={setSelected}
          onAdd={async (t) => setWatchlist(await api.addTicker(t))}
          onRemove={async (t) => setWatchlist(await api.removeTicker(t))}
          className="max-lg:h-[420px]"
        />
        <div className="grid min-w-0 grid-cols-1 gap-px lg:min-h-0 lg:grid-rows-[1.3fr_1fr_minmax(190px,0.8fr)]">
          <MainChart
            ticker={selected}
            quote={selected ? prices[selected] : undefined}
            points={selected ? (history[selected] ?? []) : []}
            className="max-lg:h-[360px]"
          />
          <div className="grid min-h-0 gap-px md:grid-cols-2">
            <Panel title="Portfolio heatmap" className="max-lg:h-[280px]">
              <Heatmap positions={live?.positions ?? []} />
            </Panel>
            <Panel title="Portfolio value" className="max-lg:h-[280px]">
              <PnlChart snapshots={snapshots} liveValue={live?.total_value ?? null} liveAt={liveAt} />
            </Panel>
          </div>
          <div className="grid min-h-0 gap-px md:grid-cols-[1fr_260px]">
            <Panel title="Positions" className="max-lg:min-h-[200px]">
              <PositionsTable positions={live?.positions ?? []} onSelect={setSelected} />
            </Panel>
            <Panel title="Market order">
              <TradeBar selected={selected} onTrade={trade} />
            </Panel>
          </div>
        </div>
        <div className={chatOpen ? "contents" : "hidden"}>
          <Panel title="FinAlly assistant" className="max-lg:h-[480px]">
            <ChatPanel onSend={chat} />
          </Panel>
        </div>
      </main>
    </div>
  );
}
