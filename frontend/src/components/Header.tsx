"use client";

import { useEffect, useRef, useState } from "react";
import { getPortfolio } from "../lib/api";
import { fmtMoney, MISSING } from "../lib/format";
import { useMarketStore } from "../lib/store";
import { liveTotals } from "../lib/totals";
import type { Portfolio } from "../lib/types";
import ConnectionDot from "./ConnectionDot";

/** Wordmark, live total value and cash from GET /api/portfolio, and the connection dot. */
export default function Header() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const prices = useMarketStore((s) => s.prices);
  const status = useMarketStore((s) => s.status);

  function load() {
    getPortfolio()
      .then(setPortfolio)
      .catch(() => {});
  }

  useEffect(load, []);

  const previous = useRef(status);
  useEffect(() => {
    if (status === "connected" && previous.current !== "connected") load();
    previous.current = status;
  }, [status]);

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
