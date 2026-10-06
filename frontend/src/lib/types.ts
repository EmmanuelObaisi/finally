/** Shapes shared with the backend (planning/CONTRACT.md sections 3 and 6). */

export type Direction = "up" | "down" | "flat";

export interface PriceUpdate {
  ticker: string;
  price: number;
  previous_price: number;
  timestamp: number;
  change: number;
  direction: Direction;
  day_change_percent: number;
}

export type PriceMap = Record<string, PriceUpdate>;

export interface PricePoint {
  time: number;
  value: number;
}

export interface Position {
  ticker: string;
  quantity: number;
  avg_cost: number;
  current_price: number;
  market_value: number;
  unrealized_pnl: number;
  pnl_percent: number;
}

export interface Portfolio {
  cash_balance: number;
  total_value: number;
  positions_value: number;
  unrealized_pnl: number;
  positions: Position[];
}

export interface Trade {
  ticker: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  executed_at: string;
}

export interface WatchItem {
  ticker: string;
  price: number | null;
  previous_price: number | null;
  change: number | null;
  direction: Direction | null;
  day_change_percent: number | null;
}

export interface Snapshot {
  total_value: number;
  recorded_at: string;
}

export interface TradeAction {
  ticker: string;
  side: "buy" | "sell";
  quantity: number;
  status: "ok" | "error";
  price?: number;
  error?: string;
}

export interface WatchlistAction {
  ticker: string;
  action: "add" | "remove";
  status: "ok" | "error";
  error?: string;
}

export interface ChatActions {
  trades: TradeAction[];
  watchlist_changes: WatchlistAction[];
}

export interface ChatResponse {
  message: string;
  actions: ChatActions;
  portfolio: Portfolio;
}

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected";
