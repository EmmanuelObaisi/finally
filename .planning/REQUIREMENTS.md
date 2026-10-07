# Requirements: FinAlly — AI Trading Workstation

**Defined:** 2026-10-06
**Core Value:** One command launches a live, data-dense trading terminal where prices stream, trades fill instantly, and the AI copilot can act on the portfolio — and every specified unit and E2E scenario passes to prove it.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases. Source of truth: `planning/PLAN.md` with §13 proposals adopted (see PROJECT.md Context).

### Foundation

- [ ] **FND-01**: Committed build artifacts (`backend/static/`, `test/node_modules/`) are removed from git and gitignored; `.gitattributes` forces LF for `.sh`, Dockerfile and env files
- [x] **FND-02**: Backend is a uv project in `backend/` (FastAPI app factory, code under `backend/app/`) whose test suite runs with `uv run python -m pytest`
- [ ] **FND-03**: Frontend is a Next.js TypeScript project in `frontend/` that builds to a static export (`output: 'export'`) with Tailwind
- [ ] **FND-04**: The API/SSE contract (request/response shapes, field names, error format, status codes) is written down in `planning/` and is the single reference for backend and frontend
- [x] **FND-05**: Backend reads config from env: `OPENROUTER_API_KEY`, `MASSIVE_API_KEY`, `LLM_MOCK`, `DB_PATH`, `SIM_SEED`, `SIM_EVENT_PROBABILITY`; local dev loads the project-root `.env`
- [ ] **FND-06**: `README.md` and `CLAUDE.md` status lines reflect the actual state of the code

### Market Data

- [ ] **MKT-01**: Simulator generates prices by correlated geometric Brownian motion at ~500ms ticks, starting from realistic seed prices for the 10 default tickers
- [ ] **MKT-02**: Simulator injects occasional random 2-5% "event" moves on a ticker
- [ ] **MKT-03**: Simulator gives non-seed tickers a deterministic ticker-derived starting price (stable across restarts)
- [ ] **MKT-04**: Simulator randomness is seedable (`SIM_SEED`) and event probability configurable (`SIM_EVENT_PROBABILITY`) for deterministic tests
- [ ] **MKT-05**: When `MASSIVE_API_KEY` is set, a Massive REST poller supplies prices instead (paid: snapshot every 2-15s, default 5s; free: Grouped Daily fallback)
- [ ] **MKT-06**: Simulator and Massive poller implement one abstract interface; a factory selects by env var; downstream code is source-agnostic
- [ ] **MKT-07**: An in-memory price cache holds latest price, previous price, timestamp and session-start price per ticker, with a version counter
- [ ] **MKT-08**: Tracked tickers = watchlist ∪ open positions; a ticker is untracked only when in neither, and buying an untracked ticker starts tracking it before pricing
- [ ] **MKT-09**: `GET /api/stream/prices` streams SSE events, one per cache-version change, each a dict of all tracked tickers with `ticker, price, previous_price, timestamp, change, change_percent, direction` (change measured from session-start price)
- [ ] **MKT-10**: Market data task and SSE streams start and stop cleanly with the app lifespan (no hang on shutdown)

### Database

- [ ] **DB-01**: SQLite at `DB_PATH` (default `<root>/db/finally.db`, `/app/db/finally.db` in Docker) is created and seeded lazily and idempotently on startup
- [ ] **DB-02**: Schema uses natural primary keys for `users_profile(user_id)`, `watchlist(user_id, ticker)`, `positions(user_id, ticker)`; UUID ids on `trades`, `portfolio_snapshots`, `chat_messages`; all tables carry `user_id` defaulting to `"default"`
- [ ] **DB-03**: Seed data is one user with $10,000 cash, the 10 default watchlist tickers (AAPL, GOOGL, MSFT, AMZN, TSLA, NVDA, META, JPM, V, NFLX), and an initial $10,000 portfolio snapshot

### Watchlist

- [ ] **WL-01**: User can view the watchlist with latest prices via `GET /api/watchlist`
- [ ] **WL-02**: User can add a ticker via `POST /api/watchlist`; it is upper-cased, format-checked (`[A-Z][A-Z.]{0,9}`), and rejected with 400 "Unknown ticker" if no price appears
- [ ] **WL-03**: User can remove a ticker via `DELETE /api/watchlist/{ticker}`; unknown ticker returns 404; a held ticker keeps streaming

### Portfolio & Trading

- [ ] **PORT-01**: User can view cash, positions (ticker, quantity, avg cost, current price, unrealized P&L, % change), total value and total unrealized P&L via `GET /api/portfolio`
- [ ] **PORT-02**: User can buy shares at the current price via `POST /api/portfolio/trade`; cash decreases and position quantity/avg cost update; fractional quantities allowed
- [ ] **PORT-03**: User can sell owned shares; cash increases; the position row is deleted when quantity reaches zero (float residue handled)
- [ ] **PORT-04**: Invalid trades (quantity <= 0, no price, insufficient cash, insufficient shares) are rejected with 400 `{"error": "..."}` and change nothing
- [ ] **PORT-05**: Each trade is atomic, appended to the `trades` log, and followed by a portfolio snapshot
- [ ] **PORT-06**: Trade responses include the updated portfolio state
- [ ] **PORT-07**: User can fetch portfolio value history via `GET /api/portfolio/history`; a snapshot is recorded on request (min-interval guarded)
- [x] **PORT-08**: `GET /api/health` reports health for Docker

### AI Chat

- [ ] **CHAT-01**: User can send a message via `POST /api/chat` and receive a complete JSON response with the assistant message and executed actions
- [ ] **CHAT-02**: The LLM prompt includes the FinAlly system prompt, current portfolio context (cash, positions with P&L, watchlist prices, total value) and the last 20 messages
- [ ] **CHAT-03**: LLM is called via LiteLLM → OpenRouter (`openrouter/openai/gpt-oss-120b`, Cerebras provider) per the cerebras skill, async, with structured output `{message, trades[], watchlist_changes[]}`
- [ ] **CHAT-04**: Trades and watchlist changes in the response auto-execute through the same validation as manual actions; each action's success or error is returned
- [ ] **CHAT-05**: User and assistant messages (with actions JSON) are persisted in `chat_messages`
- [ ] **CHAT-06**: User can reload prior conversation via `GET /api/chat/history`
- [ ] **CHAT-07**: Chat responses include the updated portfolio state
- [ ] **CHAT-08**: LLM failures (timeout, malformed output, missing key) return a graceful assistant error message and execute no actions
- [ ] **CHAT-09**: With `LLM_MOCK=true`, deterministic keyword-driven mock responses are returned (buy, sell, watchlist add/remove, plain analysis) without network calls

### Frontend: Market UI

- [ ] **UI-01**: Dark terminal theme (backgrounds ~`#0d1117`, muted borders; accent `#ecad0a`, blue `#209dd7`, purple `#753991` submit buttons), dense desktop-first layout, functional on tablet
- [ ] **UI-02**: Header shows live total portfolio value, cash balance, and a connection dot (green connected / yellow reconnecting / red disconnected)
- [ ] **UI-03**: A single `EventSource` feeds all components and re-connects after failure
- [ ] **UI-04**: Watchlist panel shows ticker, price, change % and a sparkline accumulated since page load
- [ ] **UI-05**: Prices flash green on uptick / red on downtick, fading over ~500ms
- [ ] **UI-06**: User can add and remove watchlist tickers from the panel
- [ ] **UI-07**: Clicking a ticker shows it in the main chart (price over time); a default ticker is selected on load
- [ ] **UI-08**: Prices show "--" before the first value arrives (never NaN or 0); numbers use shared currency/quantity/sign/percent formatters with tabular numerals

### Frontend: Portfolio & Chat UI

- [ ] **PUI-01**: Trade bar with ticker, quantity, Buy and Sell executes market orders; shows inline success/error; buttons disabled while in flight
- [ ] **PUI-02**: Positions table shows ticker, quantity, avg cost, current price, unrealized P&L and % change, updating live
- [ ] **PUI-03**: Portfolio heatmap (treemap) sizes positions by weight and colors by P&L (green profit, red loss)
- [ ] **PUI-04**: P&L chart shows total portfolio value over time from snapshots, refetched every 30s with a live "now" point
- [ ] **PUI-05**: Collapsible AI chat panel with message input (Enter to send), scrolling history restored on load, auto-scroll, and loading indicator
- [ ] **PUI-06**: Executed trades and watchlist changes (and their failures) appear inline in the chat; portfolio and watchlist views refresh from the response
- [ ] **PUI-07**: Watchlist, positions, heatmap and P&L chart have explicit empty states
- [ ] **PUI-08**: Key elements carry stable `data-testid` attributes for E2E

### Packaging

- [ ] **PKG-01**: Multi-stage Dockerfile (Node 24 build → Python 3.12 + uv `--locked`) produces one image serving API and static frontend on port 8000 with one worker
- [ ] **PKG-02**: SQLite persists on a named Docker volume mounted at `/app/db`; `.env` is passed via `--env-file`
- [ ] **PKG-03**: `docker-compose.yml` defines the run; `scripts/start_mac.sh`, `stop_mac.sh`, `start_windows.ps1`, `stop_windows.ps1` are thin idempotent wrappers (start builds if needed, prints URL; stop keeps the volume)
- [ ] **PKG-04**: User can launch the app with one command and open `http://localhost:8000`

### Testing

- [ ] **TEST-01**: Backend pytest covers market data (valid prices, GBM math, Massive parsing, interface conformance)
- [ ] **TEST-02**: Backend pytest covers portfolio (trade execution, P&L, oversell, insufficient cash, selling at a loss)
- [ ] **TEST-03**: Backend pytest covers LLM (structured output parsing, malformed responses, trade validation in chat flow)
- [ ] **TEST-04**: Backend pytest covers API routes (status codes, response shapes, error handling)
- [ ] **TEST-05**: Frontend unit tests cover component rendering, price flash triggering, watchlist CRUD, portfolio calculations, chat rendering and loading state
- [ ] **TEST-06**: Playwright E2E (host against container, `LLM_MOCK=true`) covers: fresh start (watchlist, $10k, streaming), add/remove ticker, buy, sell, heatmap and P&L chart, mocked AI chat with inline trade, SSE reconnection

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Deployment

- **DEPL-01**: Terraform config for AWS App Runner in `deploy/`

## Out of Scope

| Feature | Reason |
|---------|--------|
| Auth, signup, multi-user | Single hardcoded user by design; schema keeps `user_id` for the future |
| Limit/stop orders, order book, partial fills, fees | Market orders only keeps portfolio math simple |
| Shorting, margin, options | Not in spec; complicates validation |
| Trade-history UI | `trades` table is an audit log only |
| Price alerts | Not in spec |
| OHLC candles, timeframes, indicators | Line charts from SSE suffice |
| Analytics (Sharpe, win rate, backtesting), realized P&L / tax lots | Not in spec |
| Token-by-token LLM streaming | Cerebras is fast; loading indicator suffices |
| Trade confirmation dialogs | Deliberate: fake money, fluid agentic demo |
| LLM tool-calling loop | Single structured-output call per turn |
| Per-tick price persistence | Sparklines/charts accumulate client-side |
| Settings page, light theme | Not in spec |
| WebSockets, Postgres, Massive WebSocket | SSE, SQLite and REST polling are sufficient |
| 30s background snapshot task | Replaced by seeded snapshot + after-trade + on-request snapshots |
| Dedicated Playwright container | Playwright runs on host (unless the Phase 1 spike forces a container) |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FND-01 | Phase 1 | Gaps Found |
| FND-02 | Phase 1 | Complete |
| FND-03 | Phase 1 | Gaps Found |
| FND-04 | Phase 1 | Gaps Found |
| FND-05 | Phase 1 | Complete |
| FND-06 | Phase 1 | Gaps Found |
| MKT-01 | Phase 2 | Pending |
| MKT-02 | Phase 2 | Pending |
| MKT-03 | Phase 2 | Pending |
| MKT-04 | Phase 2 | Pending |
| MKT-05 | Phase 2 | Pending |
| MKT-06 | Phase 2 | Pending |
| MKT-07 | Phase 2 | Pending |
| MKT-08 | Phase 3 | Pending |
| MKT-09 | Phase 2 | Pending |
| MKT-10 | Phase 2 | Pending |
| DB-01 | Phase 2 | Pending |
| DB-02 | Phase 2 | Pending |
| DB-03 | Phase 2 | Pending |
| WL-01 | Phase 2 | Pending |
| WL-02 | Phase 3 | Pending |
| WL-03 | Phase 3 | Pending |
| PORT-01 | Phase 2 | Pending |
| PORT-02 | Phase 3 | Pending |
| PORT-03 | Phase 3 | Pending |
| PORT-04 | Phase 3 | Pending |
| PORT-05 | Phase 3 | Pending |
| PORT-06 | Phase 3 | Pending |
| PORT-07 | Phase 4 | Pending |
| PORT-08 | Phase 1 | Complete |
| CHAT-01 | Phase 5 | Pending |
| CHAT-02 | Phase 5 | Pending |
| CHAT-03 | Phase 5 | Pending |
| CHAT-04 | Phase 5 | Pending |
| CHAT-05 | Phase 5 | Pending |
| CHAT-06 | Phase 5 | Pending |
| CHAT-07 | Phase 5 | Pending |
| CHAT-08 | Phase 5 | Pending |
| CHAT-09 | Phase 5 | Pending |
| UI-01 | Phase 2 | Pending |
| UI-02 | Phase 2 | Pending |
| UI-03 | Phase 2 | Pending |
| UI-04 | Phase 2 | Pending |
| UI-05 | Phase 2 | Pending |
| UI-06 | Phase 3 | Pending |
| UI-07 | Phase 4 | Pending |
| UI-08 | Phase 2 | Pending |
| PUI-01 | Phase 3 | Pending |
| PUI-02 | Phase 3 | Pending |
| PUI-03 | Phase 4 | Pending |
| PUI-04 | Phase 4 | Pending |
| PUI-05 | Phase 5 | Pending |
| PUI-06 | Phase 5 | Pending |
| PUI-07 | Phase 4 | Pending |
| PUI-08 | Phase 6 | Pending |
| PKG-01 | Phase 1 | Gaps Found |
| PKG-02 | Phase 6 | Pending |
| PKG-03 | Phase 6 | Pending |
| PKG-04 | Phase 6 | Pending |
| TEST-01 | Phase 2 | Pending |
| TEST-02 | Phase 3 | Pending |
| TEST-03 | Phase 5 | Pending |
| TEST-04 | Phase 6 | Pending |
| TEST-05 | Phase 6 | Pending |
| TEST-06 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 65 total
- Mapped to phases: 65
- Unmapped: 0 ✓

---
*Requirements defined: 2026-10-06*
*Last updated: 2026-10-06 after roadmap creation (traceability mapped)*
