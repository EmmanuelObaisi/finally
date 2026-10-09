import { fmtMoney, fmtQty } from "./format";
import type { ChatAction } from "./types";

/** The one sentence for an action line; failed sentences print the server error verbatim. */
export function actionText(action: ChatAction): string {
  if (action.type === "trade") {
    const { side, ticker, ok } = action;
    const qty = fmtQty(action.quantity);
    if (ok) return (side === "buy" ? "Bought " : "Sold ") + qty + " " + ticker + " at " + fmtMoney(action.price);
    return "Could not " + side + " " + qty + " " + ticker + ": " + (action.error ?? "");
  }
  if (action.ok) {
    return action.action === "add" ? "Added " + action.ticker + " to watchlist" : "Removed " + action.ticker + " from watchlist";
  }
  return "Could not " + action.action + " " + action.ticker + ": " + (action.error ?? "");
}
