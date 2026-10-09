// Wire shapes from planning/API_CONTRACT.md.
export type Direction = "up" | "down" | "flat";

export type PriceUpdate = {
  ticker: string;
  price: number;
  previous_price: number;
  timestamp: number;
  change: number;
  change_percent: number;
  direction: Direction;
  session_start_price: number;
};

/** One SSE frame: every tracked ticker keyed by symbol. */
export type PriceFrame = Record<string, PriceUpdate>;

/** GET /api/watchlist item: every price field is null until the ticker is priced. */
export type WatchlistItem = {
  ticker: string;
  price: number | null;
  previous_price: number | null;
  timestamp: number | null;
  change: number | null;
  change_percent: number | null;
  direction: Direction | null;
  session_start_price: number | null;
};

export type Position = {
  ticker: string;
  quantity: number;
  avg_cost: number;
  current_price: number;
  market_value: number;
  unrealized_pnl: number;
  pnl_percent: number;
};

export type Portfolio = {
  cash: number;
  total_value: number;
  unrealized_pnl: number;
  positions: Position[];
};

/** POST /api/portfolio/trade fill. */
export type Trade = {
  id: string;
  ticker: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  executed_at: string;
};

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected";

/** One portfolio value snapshot from the history endpoint. */
export type HistoryPoint = { total_value: number; recorded_at: string };
