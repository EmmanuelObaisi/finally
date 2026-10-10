# API Coverage — Massive (formerly Polygon.io) REST, `massive` 2.8.0 client

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> Scope: the Massive stocks surface reachable from the official `massive` Python client.
> Source of the surface: `planning/MASSIVE_API.md` sections 4.1-4.7 and 7, `02-RESEARCH.md` "Deltas" 6.
> Integrated by plan 02-04 (`backend/app/market/massive_client.py`).

| capability | decision | reason |
|---|---|---|
| Full market snapshot, multi-ticker (`get_snapshot_all`) | INTEGRATE | |
| Grouped daily aggregates, all tickers for one date (`get_grouped_daily_aggs`) | INTEGRATE | |
| Plan entitlement detection (`BadResponse` with `NOT_AUTHORIZED` on snapshot) | INTEGRATE | |
| Client built-in retry on 429/5xx (urllib3 `Retry`) | INTEGRATE | |
| Single ticker snapshot (`get_snapshot_ticker`) | OPT-OUT | not needed: the multi-ticker snapshot returns the same object for every tracked ticker in one call |
| Previous close per ticker (`get_previous_close_agg`) | OPT-OUT | not needed: one call per ticker breaks the free 5 calls/min budget; Grouped Daily returns every close in one call |
| Daily open/close per ticker and date (`get_daily_open_close_agg`) | OPT-OUT | not needed: a history lookup, live prices come from snapshot or Grouped Daily |
| Last trade per ticker (`get_last_trade`) | OPT-OUT | not needed: snapshot `lastTrade` carries the same price for all tickers in one call; Developer plan and up only |
| Last quote / NBBO (`get_last_quote`, snapshot `lastQuote`) | OPT-OUT | explicitly out of scope: market orders fill at the last price, bid/ask is never shown |
| Custom-range aggregates / bars (`list_aggs`) | OPT-OUT | explicitly out of scope: REQUIREMENTS Out of Scope "OHLC candles, timeframes"; charts accumulate from SSE |
| WebSocket streaming | OPT-OUT | explicitly out of scope: REQUIREMENTS Out of Scope "Massive WebSocket"; REST polling only |
| Reference data: ticker search and details (`list_tickers`, `get_ticker_details`) | OPT-OUT | not needed: a symbol is unknown when no price appears (API_CONTRACT "Unknown ticker"), decided in Phase 3 |
| Market status and holidays (`get_market_status`, `get_market_holidays`) | OPT-OUT | not needed: costs a call from the free 5/min budget; the starting day is computed locally and the walk-back covers holidays |
| Trades and quotes history (`list_trades`, `list_quotes`) | OPT-OUT | explicitly out of scope: no trade-history or tick persistence (REQUIREMENTS Out of Scope) |
| Technical indicators (SMA, EMA, RSI, MACD) | OPT-OUT | explicitly out of scope: REQUIREMENTS Out of Scope "indicators" |
| Gainers / losers snapshots | OPT-OUT | not needed: no market-movers view in PLAN.md |
| Options, forex, crypto, indices, futures endpoints | OPT-OUT | explicitly out of scope: FinAlly trades US stocks only |
| Fundamentals, financials, news, dividends, splits | OPT-OUT | explicitly out of scope: no analytics or news features in PLAN.md |
