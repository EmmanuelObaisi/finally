// Typed calls to the FinAlly API. Shapes: planning/API_CONTRACT.md.
import type { Portfolio, WatchlistItem } from "./types";

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
