"use client";

import { fmtMoney, MISSING } from "../lib/format";
import { useMarketStore } from "../lib/store";

/** Price text; a new flash.seq remounts the span, restarting the CSS fade with no timers. */
export default function PriceCell({ ticker, price, dim }: { ticker: string; price: number | null; dim: boolean }) {
  const flash = useMarketStore((s) => s.flash[ticker]);
  const text = fmtMoney(price);
  const anim = flash && flash.seq > 0 ? (flash.dir === "up" ? " animate-flash-up" : " animate-flash-down") : "";
  return (
    <span
      key={flash?.seq ?? 0}
      data-testid={"price-" + ticker}
      data-flash={flash?.dir ?? "none"}
      className={"block px-2 rounded-sm" + (text === MISSING ? " text-muted" : "") + anim + (dim ? " opacity-60" : "")}
    >
      {text}
    </span>
  );
}
