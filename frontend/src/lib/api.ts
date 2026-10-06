/** Same-origin REST client for /api/*. Errors surface FastAPI's `detail`. */
import type { ChatResponse, Portfolio, Snapshot, Trade, WatchItem } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json" },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(errorDetail(body) ?? `Request failed (${res.status})`);
  }
  return body as T;
}

function errorDetail(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("detail" in body)) return null;
  const detail = (body as { detail: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d?.msg ?? String(d)).join("; ");
  return null;
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export const api = {
  portfolio: () => request<Portfolio>("/api/portfolio"),
  history: () => request<Snapshot[]>("/api/portfolio/history"),
  trade: (ticker: string, quantity: number, side: "buy" | "sell") =>
    request<{ trade: Trade; portfolio: Portfolio }>(
      "/api/portfolio/trade",
      post({ ticker, quantity, side }),
    ),
  watchlist: () => request<WatchItem[]>("/api/watchlist"),
  addTicker: (ticker: string) => request<WatchItem[]>("/api/watchlist", post({ ticker })),
  removeTicker: (ticker: string) =>
    request<WatchItem[]>(`/api/watchlist/${encodeURIComponent(ticker)}`, { method: "DELETE" }),
  chat: (message: string) => request<ChatResponse>("/api/chat", post({ message })),
};
