"use client";
/** Market order entry: ticker, quantity, buy, sell. */
import { useState } from "react";
import { formatPrice, formatQty } from "@/lib/format";
import type { Trade } from "@/lib/types";

interface Props {
  selected: string | null;
  onTrade: (ticker: string, quantity: number, side: "buy" | "sell") => Promise<Trade>;
}

export function TradeBar({ selected, onTrade }: Props) {
  const [ticker, setTicker] = useState(selected ?? "");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fill, setFill] = useState<Trade | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastSelected, setLastSelected] = useState(selected);

  if (selected !== lastSelected) {
    setLastSelected(selected);
    if (selected) setTicker(selected);
  }

  async function submit(side: "buy" | "sell") {
    setError(null);
    setFill(null);
    const symbol = ticker.trim().toUpperCase();
    const qty = Number(quantity);
    if (!symbol) return setError("Enter a ticker.");
    if (!(qty > 0)) return setError("Enter a quantity greater than 0.");
    setBusy(true);
    try {
      setFill(await onTrade(symbol, qty, side));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const input = "rounded border border-line bg-bg px-2 py-1.5 focus:border-blue focus:outline-none";
  const button = "flex-1 rounded py-1.5 font-semibold text-white disabled:opacity-50";

  return (
    <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-2 p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Ticker
          <input
            data-testid="trade-ticker"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            className={`${input} uppercase text-text`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Quantity
          <input
            data-testid="trade-quantity"
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={`${input} num text-text`}
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          data-testid="trade-buy"
          type="button"
          disabled={busy}
          onClick={() => submit("buy")}
          className={`${button} bg-up/85 hover:bg-up`}
        >
          Buy
        </button>
        <button
          data-testid="trade-sell"
          type="button"
          disabled={busy}
          onClick={() => submit("sell")}
          className={`${button} bg-down/85 hover:bg-down`}
        >
          Sell
        </button>
      </div>
      <div className="min-h-4 text-xs" aria-live="polite">
        {error && (
          <p data-testid="trade-error" className="text-down">
            {error}
          </p>
        )}
        {fill && (
          <p className="num text-muted">
            {fill.side === "buy" ? "Bought" : "Sold"} {formatQty(fill.quantity)} {fill.ticker} at{" "}
            {formatPrice(fill.price)}
          </p>
        )}
      </div>
    </form>
  );
}
