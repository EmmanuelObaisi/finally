"use client";

import { useEffect, useRef } from "react";
import { fmtMoney, MISSING } from "../lib/format";
import { usePortfolioStore } from "../lib/portfolioStore";
import { useMarketStore } from "../lib/store";
import { liveTotals } from "../lib/totals";
import ConnectionDot from "./ConnectionDot";

/** Wordmark, live total value and cash from GET /api/portfolio, and the connection dot. */
export default function Header() {
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const load = usePortfolioStore((s) => s.load);
  const prices = useMarketStore((s) => s.prices);
  const status = useMarketStore((s) => s.status);

  useEffect(load, [load]);

  const previous = useRef(status);
  useEffect(() => {
    if (status === "connected" && previous.current !== "connected") load();
    previous.current = status;
  }, [status, load]);

  const totals = portfolio ? liveTotals(portfolio, prices) : null;
  const total = fmtMoney(totals?.total);
  const cash = fmtMoney(totals?.cash);
  const muted = (text: string) => (text === MISSING ? " text-muted" : "");
  const stale = status === "disconnected" ? " opacity-60" : "";

  return (
    <header
      data-testid="header"
      className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-panel px-4"
    >
      <h1 data-testid="app-title" className="text-heading font-semibold text-accent">
        FinAlly
      </h1>
      <div className="flex min-w-0 items-baseline gap-4 lg:gap-8">
        <div className="flex items-baseline gap-2">
          <span className="text-label text-muted">Total value</span>
          <span
            data-testid="header-total-value"
            className={"text-display font-semibold tabular-nums whitespace-nowrap" + muted(total) + stale}
          >
            {total}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-label text-muted">Cash</span>
          <span
            data-testid="header-cash"
            className={"text-body tabular-nums whitespace-nowrap" + muted(cash) + stale}
          >
            {cash}
          </span>
        </div>
        <ConnectionDot />
      </div>
    </header>
  );
}
