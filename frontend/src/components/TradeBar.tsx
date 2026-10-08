"use client";

import { useRef, useState } from "react";
import { postTrade } from "../lib/api";
import { fmtMoney, fmtQty } from "../lib/format";
import FormMessage, { type MessageKind } from "./FormMessage";

const FOCUS = " focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const INPUT =
  "h-8 w-32 rounded-sm border border-border bg-surface px-2 text-body text-fg placeholder:text-muted" + FOCUS;
const BUTTON =
  "h-8 w-20 rounded-sm bg-secondary px-4 text-body font-semibold text-fg hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50" +
  FOCUS;

type Message = { kind: MessageKind; text: string };
const IDLE: Message = { kind: "idle", text: "" };

/** Market-order form. Orders only fire from an explicit click on Buy or Sell. */
export default function TradeBar() {
  const [ticker, setTicker] = useState("");
  const [quantity, setQuantity] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<Message>(IDLE);
  const quantityRef = useRef<HTMLInputElement>(null);

  async function submit(side: "buy" | "sell") {
    if (pending) return;
    setPending(true);
    setMessage({ kind: "pending", text: "Placing order..." });
    try {
      const { trade } = await postTrade(ticker.trim(), Number(quantity), side);
      setQuantity("");
      const verb = trade.side === "buy" ? "Bought" : "Sold";
      setMessage({
        kind: "success",
        text: `${verb} ${fmtQty(trade.quantity)} ${trade.ticker} at ${fmtMoney(trade.price)}`,
      });
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
    } finally {
      setPending(false);
      quantityRef.current?.focus();
    }
  }

  return (
    <form
      aria-label="Trade"
      data-testid="trade-bar"
      aria-busy={pending ? "true" : undefined}
      onSubmit={(e) => e.preventDefault()}
      className="h-18 shrink-0 border-b border-border bg-panel"
    >
      <div className="flex h-12 items-center gap-2 px-4">
        <input
          data-testid="trade-ticker"
          type="text"
          placeholder="Ticker"
          aria-label="Ticker"
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="characters"
          value={ticker}
          onChange={(e) => {
            setTicker(e.target.value);
            setMessage(IDLE);
          }}
          className={INPUT + " uppercase"}
        />
        <input
          ref={quantityRef}
          data-testid="trade-quantity"
          type="text"
          inputMode="decimal"
          placeholder="Quantity"
          aria-label="Quantity"
          autoComplete="off"
          value={quantity}
          onChange={(e) => {
            setQuantity(e.target.value);
            setMessage(IDLE);
          }}
          className={INPUT + " text-right tabular-nums"}
        />
        <button
          data-testid="trade-buy"
          type="button"
          disabled={pending}
          onClick={() => submit("buy")}
          className={BUTTON + " ml-2"}
        >
          Buy
        </button>
        <button data-testid="trade-sell" type="button" disabled={pending} onClick={() => submit("sell")} className={BUTTON}>
          Sell
        </button>
      </div>
      <FormMessage testId="trade-message" kind={message.kind} text={message.text} />
    </form>
  );
}
