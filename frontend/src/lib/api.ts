// Typed calls to the FinAlly API. Shapes: planning/API_CONTRACT.md.
import type { Portfolio, Trade, WatchlistItem } from "./types";

export async function getWatchlist(): Promise<WatchlistItem[]> {
  const res = await fetch("/api/watchlist");
  if (!res.ok) throw new Error("watchlist " + res.status);
  const body = (await res.json()) as { watchlist: WatchlistItem[] };
  return body.watchlist;
}

export async function getPortfolio(): Promise<Portfolio> {
  const res = await fetch("/api/portfolio");
  if (!res.ok) throw new Error("portfolio " + res.status);
  return (await res.json()) as Portfolio;
}

export const NETWORK_ERROR = "Could not reach the server. Check that FinAlly is running, then try again.";

/** Mutation call: a failure shows the server's {error} text, anything unreadable the fixed network text. */
export async function send<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => {
    throw new Error(NETWORK_ERROR);
  });
  if (res.ok) return (await res.json()) as T;
  const payload: unknown = await res.json().catch(() => null);
  const error = (payload as { error?: unknown } | null)?.error;
  throw new Error(typeof error === "string" ? error : NETWORK_ERROR);
}

export async function addTicker(ticker: string): Promise<WatchlistItem[]> {
  const body = await send<{ watchlist: WatchlistItem[] }>("POST", "/api/watchlist", { ticker });
  return body.watchlist;
}

export async function removeTicker(ticker: string): Promise<WatchlistItem[]> {
  const body = await send<{ watchlist: WatchlistItem[] }>("DELETE", "/api/watchlist/" + encodeURIComponent(ticker));
  return body.watchlist;
}

export function postTrade(ticker: string, quantity: number, side: "buy" | "sell") {
  return send<{ trade: Trade; portfolio: Portfolio }>("POST", "/api/portfolio/trade", {
    ticker,
    quantity,
    side,
  });
}
