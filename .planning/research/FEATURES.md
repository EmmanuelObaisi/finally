# Feature Research

**Domain:** AI-assisted simulated trading workstation (paper trading terminal with LLM copilot)
**Researched:** 2026-10-06
**Confidence:** MEDIUM (domain conventions from training knowledge plus one light web survey; scope itself is fixed by PLAN.md and is HIGH confidence)

## How to read this document

Scope is fixed by `planning/PLAN.md` with the §13 proposals adopted (see PROJECT.md "Resolved contract decisions"). This file does three things:

1. Organizes PLAN.md's features into requirement categories (REQ-ready groupings).
2. Flags table-stakes behavior PLAN.md implies but does not spell out ("Implied" rows). These are not scope expansion: they are the minimum for the specified feature to feel finished and to be testable.
3. Lists anti-features to deliberately NOT build, so downstream phases do not drift.

Rows marked **[PLAN]** are explicit in PLAN.md. Rows marked **[IMPLIED]** are not spelled out but are required for the PLAN feature to work acceptably.

## Feature Landscape

### Table Stakes (users expect these)

Paper-trading terminals (Alpaca paper, thinkorswim paperMoney, TradingView paper trading, Webull/Investopedia simulators) universally have: live quotes, a watchlist, buy/sell with instant market fill, a positions view with unrealized P&L, cash balance and total value, and a portfolio value-over-time chart. Missing any of these and the product reads as a demo, not a terminal.

#### A. Market data and streaming

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Live-updating prices via SSE `GET /api/stream/prices` [PLAN] | The product is "live"; static prices kill the premise | MEDIUM | One event per cache-version change, dict of all tracked tickers (decision 3). Native `EventSource`. |
| GBM simulator with correlated moves, random 2-5% events, seed prices, ~500ms ticks [PLAN] | Default data source; must look realistic or the demo is dull | MEDIUM | Runs in-process; no external deps. Rebuilt from planning docs. |
| Optional Massive REST poller behind same interface [PLAN] | Real data when a key is set | MEDIUM | Free tier 15s poll; paid 2-15s (5s default); free falls back to Grouped Daily (decision 16). |
| Shared in-memory price cache (latest, previous, timestamp, version) [PLAN] | Single source for SSE, trades, portfolio valuation | LOW | All downstream code is source-agnostic. |
| Tracked tickers = watchlist union open positions [PLAN §13 #1] | Without it a held ticker loses its price after watchlist removal, breaking P&L | MEDIUM | Service-layer rule; untrack only when in neither. |
| Change % since seed/session-start price [PLAN §13 #2] | Watchlist needs a "change" column with a defined meaning | LOW | Label as "Chg %" (not "daily") to be honest about the definition. |
| Connection status dot (green/yellow/red) [PLAN] | Users must know whether prices are live | LOW | Map `EventSource.readyState` and onerror to the three states. |
| Auto-reconnect on SSE drop [PLAN] | Terminal must self-heal | LOW | Built into EventSource; just surface state in the dot. E2E-tested. |
| Stale-price handling on reconnect [IMPLIED] | After disconnect the UI shows frozen prices that look live | LOW | Dot goes red/yellow; optionally dim price cells while not connected. Do not clear the sparkline history. |

#### B. Watchlist

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| 10 default tickers seeded (AAPL, GOOGL, MSFT, AMZN, TSLA, NVDA, META, JPM, V, NFLX) [PLAN] | First-launch experience must be populated | LOW | Seeded on lazy DB init. |
| Watchlist grid: ticker, price, change %, sparkline [PLAN] | Core terminal surface | MEDIUM | Sparklines accumulate client-side from SSE since page load. |
| Price flash green/red, fade ~500ms via CSS transition [PLAN] | Signature "alive" feel | LOW | Apply class on change, remove after ~500ms; test via class toggle. |
| Add ticker (manual and via AI) [PLAN] | Watchlist management | LOW | Validate `[A-Z][A-Z.]{0,9}`, upper-case, 400 "Unknown ticker" if no price (decision 6). |
| Remove ticker (manual and via AI) [PLAN] | Watchlist management | LOW | 404 for unknown; held tickers stay tracked (decision 1). |
| Click row to select ticker for main chart [PLAN] | Standard terminal interaction | LOW | Selected-row highlight. Default selection on load (first ticker) [IMPLIED]. |
| Add-ticker input error feedback [IMPLIED] | Invalid/unknown ticker needs a visible reason | LOW | Inline message under the input, from the 400 `{"error"}` body. |
| Empty watchlist state [IMPLIED] | User can remove all 10 tickers | LOW | Single-line "Watchlist is empty, add a ticker" placeholder. |
| Placeholder before first price arrives [IMPLIED] | First paint precedes first SSE event | LOW | Show "--" not "0.00" or "NaN"; sparkline empty. |

#### C. Trading and portfolio

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Trade bar: ticker, quantity, Buy, Sell; market order, instant fill, no confirmation, no fees [PLAN] | Defining paper-trading action | MEDIUM | Fractional quantity allowed. Returns updated portfolio state (§13 #24) so UI updates without refetch. |
| Trade validation: qty > 0, ticker has a price, enough cash, enough shares [PLAN §13 #5] | Integrity of portfolio math | MEDIUM | 400 `{"error"}`. Position row deleted at quantity 0. Buying untracked ticker starts tracking first. |
| Trade error feedback in trade bar [IMPLIED] | "Insufficient cash" must be visible next to the control, not just a 400 in the console | LOW | Inline red message; clears on next edit or success. |
| Trade success feedback [IMPLIED] | Instant fill with no dialog means no sense of completion otherwise | LOW | Brief inline/toast line: "Bought 10 AAPL @ 190.12". Auto-dismiss. Cash and positions update is the main signal. |
| Trade bar prefill from selected ticker [IMPLIED] | Clicking a row then retyping the symbol is friction | LOW | Optional small nicety; acceptable but not required. Keep only if trivial. |
| Disable buttons while request in flight [IMPLIED] | Prevents double-submit of market orders | LOW | One boolean. |
| Positions table: ticker, qty, avg cost, current price, unrealized P&L, % change [PLAN] | Core portfolio view | MEDIUM | Prices update live from SSE cache; P&L computed client-side from SSE or from `/api/portfolio` refresh. |
| Empty positions state [IMPLIED] | Fresh start has zero positions | LOW | "No positions yet" row. Heatmap and P&L chart need matching empty states. |
| Header: total value (live), cash balance, connection dot [PLAN] | Always-visible vitals | LOW | Total = cash + sum(qty * live price); must tick with the stream, not only on trade. |
| `GET /api/portfolio` with positions, cash, total value, unrealized P&L [PLAN] | Source of truth for initial load | LOW | Define response shape in the contract (PLAN §13 #4). |
| Portfolio value history `GET /api/portfolio/history` [PLAN] | Feeds P&L chart | LOW | Snapshot after each trade and on each history request (§13 #20); no background task. |
| Number and sign formatting [IMPLIED] | Financial UI with unformatted floats looks broken | LOW | Currency with thousands separators and 2 dp; quantity up to ~4 dp trimmed; P&L with explicit +/- sign and green/red; percent 2 dp. One shared formatter module. Float rounding on REAL columns must be handled (round at display, not in storage). |

#### D. Charts and visualization

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Main chart for selected ticker (price over time) [PLAN] | Click-to-inspect is expected in any terminal | MEDIUM | Lightweight Charts line/area series fed from SSE-accumulated history since page load. No server-side OHLC history exists, so the chart starts sparse after load; show that honestly. |
| Sparklines in watchlist [PLAN] | Dense glanceable trend | MEDIUM | Lightweight Charts per row can be heavy at 10+ instances; use minimal config (no axes, no crosshair) or a tiny canvas/SVG line. Cap points per ticker (e.g. last few hundred) to bound memory. |
| Portfolio treemap heatmap: size by weight, color by P&L [PLAN] | Specified headline visual | MEDIUM | Needs a separate lib (Lightweight Charts has no treemap); decision 14. Empty state when no positions. Colors must handle zero/near-zero P&L (neutral gray) and a single-position case. |
| P&L chart: total portfolio value over time [PLAN] | Standard equity curve | MEDIUM | From snapshots plus live points appended on the frontend from SSE (§13 #20). Needs at least 2 points to draw: seed an initial snapshot on first history request. |
| Dark terminal theme, data-dense layout, specified accent colors [PLAN] | Brand of the product | MEDIUM | Tailwind custom theme. Yellow `#ecad0a` accent, blue `#209dd7` primary, purple `#753991` submit buttons. Desktop-first; functional on tablet. Tabular-nums font feature so digits do not jitter on update. |

#### E. AI chat copilot

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Docked/collapsible chat panel with input, history, loading indicator [PLAN] | The "AI copilot" half of the product | MEDIUM | Collapsed state must not break layout. |
| Natural-language portfolio analysis with live context (cash, positions + P&L, watchlist + prices, total value) [PLAN] | The reason to have a copilot | MEDIUM | Context assembled server-side per request; last 20 messages as history (decision 7). |
| Structured output `{message, trades?, watchlist_changes?}` via LiteLLM to OpenRouter (gpt-oss-120b on Cerebras) [PLAN] | Reliable machine-actionable replies | MEDIUM | Must use project `cerebras` skill. Parse defensively at the boundary only (malformed JSON is a real LLM failure mode), not everywhere. |
| Auto-execute trades and watchlist changes, same validation as manual [PLAN] | Defining agentic behavior | MEDIUM | Reuse the same service functions as the REST trade/watchlist endpoints; no second code path. |
| Inline action confirmations in the chat stream [PLAN] | User must see what the AI actually did | LOW | Per-action line: success ("Bought 10 AAPL @ 190.12") or failure ("Failed: insufficient cash"). Chat response carries per-action status (decision 4). |
| Failed-action reporting in chat [PLAN] | Trades can legitimately fail | LOW | Failure is shown inline and conveyed to the user, not swallowed. |
| Chat persistence across reloads [PLAN] | History lives in `chat_messages` | LOW | Load history on panel mount via... note: PLAN has no GET chat endpoint. [IMPLIED] Either add a `GET /api/chat/history` or accept that history is server-side context only and UI starts empty after reload. Decide explicitly in the contract. Recommend the tiny GET endpoint: cheap and expected. |
| Graceful LLM failure message (timeout, malformed JSON, missing key) [PLAN §13 #8] | LLM calls fail; the UI must not hang or crash | LOW | Assistant-style error bubble; no actions executed. Loading indicator always clears. |
| Deterministic mock mode (`LLM_MOCK=true`) [PLAN] | E2E and no-key development | LOW | Keyword-driven (e.g. "buy" -> buy 1 AAPL; also define "sell", "add"/"watch", and a plain analysis reply so every E2E branch is reachable). |
| UI refresh after chat actions [IMPLIED] | AI trade must update positions, cash, heatmap immediately | LOW | Chat response returns portfolio state (§13 #24); apply to the same store as manual trades. |
| Chat input behavior [IMPLIED] | Basic usability | LOW | Enter to send, Shift+Enter newline, disabled while loading, auto-scroll to newest, ignore empty input. |

#### F. Platform, packaging, operations

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Single container, port 8000, API plus static export on one origin [PLAN] | "One command" promise | MEDIUM | Multi-stage Dockerfile, Node 24 build stage (decision 15). |
| SQLite lazy init and seed on first run, volume-persisted [PLAN] | No setup step | MEDIUM | `DB_PATH` env var (decision 11). Fresh volume yields seeded DB. |
| `GET /api/health` [PLAN] | Docker/deploy liveness | LOW | Trivial. |
| Start/stop scripts (mac/linux + Windows), idempotent, thin [PLAN, §13 #22] | One-command launch | LOW | Wrappers over `docker compose up -d` / `down`; stop never removes the volume. |
| `.env` handling and `.env.example` [PLAN §13 #12] | Key management | LOW | Docker `--env-file`; local dev loads root `.env`. App must still start with no `OPENROUTER_API_KEY` (chat degrades gracefully). |
| Test suites per PLAN §12 [PLAN] | User's definition of done | HIGH | Backend pytest, frontend component tests, Playwright E2E with `LLM_MOCK=true`. Stable `data-testid` hooks on key elements are an IMPLIED requirement for E2E. |

### Differentiators (competitive advantage)

Most paper-trading apps have no copilot that can act. FinAlly's differentiation is concentrated in a few places and all of it is already in scope.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| AI copilot that executes trades and edits the watchlist from natural language, no confirmation [PLAN] | Agentic demo: "buy 10 AAPL and add PYPL" works in one message. Competitors' AI features are typically read-only analysts or coaches. | MEDIUM | The core course theme. Same validation path as manual trades keeps it safe. |
| Portfolio-aware analysis (concentration, risk, P&L) grounded in live context [PLAN] | Answers are specific to the user's book, not generic | MEDIUM | Quality is mostly prompt design plus the context block. |
| Bloomberg-style dense layout with flashing ticks and sparklines [PLAN] | Visual wow factor; screenshot-worthy | MEDIUM | Polish effort, not logic effort. |
| Treemap heatmap of positions (size = weight, color = P&L) [PLAN] | Instantly shows concentration and winners/losers; uncommon in simple simulators | MEDIUM | Separate lib; needs graceful single/empty cases. |
| Correlated simulator with random "events" [PLAN] | Realistic, dramatic market without an API key; zero-setup demo | MEDIUM | Makes tests flaky if not seedable; make the simulator RNG seedable for tests [IMPLIED]. |
| Drop-in real data via Massive with identical downstream behavior [PLAN] | Same UI with real prices when a key is present | MEDIUM | Interface abstraction already specified. |
| One-command zero-login launch [PLAN] | Lowest-friction onboarding | LOW | Already a PLAN property. |

### Anti-Features (do NOT build)

Scope is fixed. These are commonly requested in the domain or tempting during build; each is either out of scope per PROJECT.md or a trap that adds cost without serving the Core Value.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Authentication, signup, multi-user | "Real app" feel | Contradicts single-user design; adds sessions, security surface | Hardcoded `default` user; keep `user_id` columns for the future. |
| Limit/stop orders, order book, partial fills, fees, slippage | Realism | Explodes portfolio math and state machine | Market orders only, instant fill at cached price. |
| Short selling / margin / leverage / options | Trading completeness | Negative positions, margin calls, collateral logic | Reject sells above holdings (400); long-only. |
| Trade confirmation dialogs | Safety habit | Deliberately removed: fake money, fluid agentic demo | Inline success/failure line only. |
| Token-by-token LLM streaming | Modern chat UX | Complicates structured-output parsing; Cerebras is fast | Single JSON response plus loading indicator. |
| WebSockets for prices | "Real-time" | SSE already sufficient for one-way push | SSE. |
| Trade history / transaction log view in UI | Standard in brokerage apps | Not in PLAN §10 layout; `trades` table exists as append-only audit log only | Keep table for audit and tests; no UI. Revisit only after v1. |
| Price alerts / notifications | Common watchlist feature | Needs background evaluator, delivery channel | Not built. |
| Historical OHLC candles, timeframe selector, technical indicators, drawing tools | TradingView expectations | Needs historical data source and a large charting surface; simulator has no history | Price-over-time line since page load only. |
| Performance analytics (Sharpe, drawdown, win rate, backtester) | Appears in paper-trading feature lists | Heavy, off-spec | P&L chart and unrealized P&L only. |
| Realized P&L accounting, tax lots, FIFO/LIFO | Accounting completeness | Not in schema; positions use average cost | Average-cost positions, unrealized P&L only. |
| Order confirmation emails, news feed, fundamentals, SEC filings research | AI "research assistant" pitch | Needs external data providers beyond scope | Chat analysis uses portfolio and price context only. |
| LLM tool-calling loop / multi-step agent with function calls | Fashionable agent pattern | Spec is single structured-output call with auto-execute | One structured response; execute actions afterwards. |
| Per-ticker persistent price history in DB | Better charts after reload | Storage and retention policy for 500ms ticks | In-memory/frontend accumulation only; snapshots only for portfolio value. |
| Background snapshot task | Smooth P&L curve | Extra task, unbounded rows (§13 #20 replaced it) | Snapshot after trade and on history request; append live points on frontend. |
| Custom user settings, themes, light mode, layout editor | Polish | Spec specifies one dark theme | One fixed dark theme. |
| Mobile-first layout | Reach | Spec is desktop-first, tablet-functional | Responsive down to tablet only. |
| Dedicated Playwright container and compose test file | Isolation | Replaced by host-run Playwright (§13 #23) | Playwright on host against running container. |
| Cloud deployment (Terraform, App Runner) | Showcase | Stretch goal only | Deferred. |

## Feature Dependencies

```
SQLite lazy init + seed
    └──required by──> Watchlist API ──required by──> Watchlist UI
    └──required by──> Portfolio API ──required by──> Trade bar, Positions table, Header

Price cache + simulator/Massive source (one interface)
    └──required by──> SSE stream ──required by──> flashing prices, sparklines, main chart,
    │                                              connection dot, live header total, P&L live points
    └──required by──> Trade execution (needs a price)
    └──required by──> Tracked-tickers rule (watchlist U positions) ──required by──> held-ticker pricing

Trade service (validate + execute + snapshot)
    └──required by──> POST /api/portfolio/trade ──required by──> Trade bar
    └──required by──> AI auto-execution (same code path)
    └──required by──> portfolio_snapshots ──required by──> P&L chart

Watchlist service (validate + add/remove + tracking)
    └──required by──> Watchlist UI
    └──required by──> AI watchlist_changes

LLM client (LiteLLM + structured output) + mock mode
    └──required by──> POST /api/chat ──required by──> Chat panel
Portfolio + watchlist context builder ──required by──> POST /api/chat

Positions data ──required by──> Treemap heatmap, Positions table
Selected-ticker state ──required by──> Main chart ──enhanced by──> SSE history buffer (also feeds sparklines)

Static export build ──required by──> Docker single-container serving ──required by──> E2E tests
Mock LLM + seedable simulator ──required by──> deterministic E2E
```

### Dependency Notes

- **Everything visual depends on the price cache and SSE.** Market data first; it unblocks watchlist, trading (needs a price), and all charts.
- **The tracked-tickers rule (decision 1) must exist before the trade service**, because buying an unwatched ticker has to start tracking it before reading its price.
- **Trade service is shared by manual and AI trades.** Build it once, call it from REST and chat. This prevents divergent validation.
- **P&L chart depends on the snapshot rule** (after trade plus on history request); it needs a seed point so two points exist before any trade.
- **Chat depends on portfolio and watchlist services** (context plus execution), so it lands after them. Mock mode should land with chat, not later, since E2E depends on it.
- **E2E depends on the Docker build**, which depends on the frontend export. Packaging is a late phase but its skeleton should be proven early to avoid late surprises.
- **Treemap and Lightweight Charts are independent libraries**; treemap choice does not block the line charts.

## MVP Definition

Scope is fixed, so "MVP" here means build order inside one release, not feature cuts. Done = one Docker command plus all PLAN §12 unit and E2E scenarios green (PROJECT.md).

### Launch With (v1: the whole PLAN scope)

Suggested slices (vertical, each demonstrable):

- [ ] Market data subsystem plus SSE (cache, simulator, Massive, tracked-ticker rule) — unblocks everything
- [ ] DB init/seed plus watchlist and portfolio/trade APIs with validation and error shapes — backend is feature-complete without UI
- [ ] Frontend shell: theme, header, SSE hook, watchlist with flash and sparklines, connection dot, formatters
- [ ] Trading UI: trade bar, positions table, header totals, inline error/success feedback
- [ ] Charts: main chart, P&L chart, treemap heatmap (with empty states)
- [ ] AI chat: LLM client, mock mode, context builder, auto-execution, chat panel with inline action confirmations
- [ ] Packaging: Dockerfile, compose, start/stop scripts, `.env.example`, repo hygiene
- [ ] Tests: backend pytest, frontend component tests, Playwright E2E for every §12 scenario

### Add After Validation (v1.x)

Nothing is planned; PLAN.md is the full scope. Candidates only if the user later asks:

- [ ] Trade history view (data already in `trades`) — trigger: user asks to see past fills
- [ ] Chat history load on reload if not included in v1 contract

### Future Consideration (v2+)

- [ ] Multi-user/auth (schema already carries `user_id`)
- [ ] Cloud deployment (Terraform / App Runner)
- [ ] Limit orders, historical candles, alerts

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Price cache, simulator, SSE | HIGH | MEDIUM | P1 |
| Watchlist grid with flash and sparklines | HIGH | MEDIUM | P1 |
| Trade bar plus validation plus feedback | HIGH | MEDIUM | P1 |
| Positions table and header vitals | HIGH | LOW | P1 |
| AI chat with auto-execution and inline confirmations | HIGH | MEDIUM | P1 |
| Mock LLM mode | HIGH | LOW | P1 |
| Docker single-container packaging | HIGH | MEDIUM | P1 |
| Main ticker chart | HIGH | MEDIUM | P1 |
| P&L chart | MEDIUM | MEDIUM | P1 |
| Treemap heatmap | MEDIUM | MEDIUM | P1 |
| Connection status dot | MEDIUM | LOW | P1 |
| Massive REST poller | MEDIUM | MEDIUM | P1 (spec'd; default path is simulator so it can trail) |
| Empty states and error feedback (IMPLIED rows) | MEDIUM | LOW | P1 (cheap; tested by E2E) |
| Shared number formatters | MEDIUM | LOW | P1 |
| `GET /api/chat/history` for reload persistence | MEDIUM | LOW | P2 (decide in contract) |
| Prefill trade bar from selected ticker | LOW | LOW | P3 |
| Dimming prices while disconnected | LOW | LOW | P3 |

**Priority key:**
- P1: Must have (in PLAN scope)
- P2: Should have, small contract decision needed
- P3: Nice to have, only if trivial

## Competitor Feature Analysis

| Feature | Alpaca paper / thinkorswim paperMoney | TradingView paper trading / Webull sim | Our Approach |
|---------|----------------------------------------|----------------------------------------|--------------|
| Order types | Market, limit, stop, bracket | Market, limit, stop | Market only (anti-feature, decision) |
| Positions and P&L | Unrealized and realized, per-position | Same | Unrealized only, average cost |
| Portfolio chart | Equity curve | Equity curve, analytics | Value-over-time line from snapshots |
| Charts | Full OHLC, indicators | Full OHLC, indicators, drawing | Line charts since page load via Lightweight Charts |
| Alerts | Yes | Yes | None |
| Heatmap | Rare in sims | Market heatmaps (not portfolio) | Portfolio treemap (differentiator) |
| AI assistant | Generally none, or read-only add-ons | Read-only/chat helpers | Acts on the portfolio from natural language (differentiator) |
| Onboarding | Account, API keys | Account | None, one command |

## Sources

- PLAN.md (`planning/PLAN.md`) and PROJECT.md decisions 1-17: authoritative for scope (HIGH)
- Domain conventions for paper-trading products (Alpaca paper trading, thinkorswim paperMoney, TradingView, Webull simulators): training knowledge, not re-verified this session (MEDIUM)
- Web survey of paper-trading and AI trading agent features: [open papertrade](https://www.producthunt.com/products/open-papertrade-product-launch), [AlphaPilot AI](https://lablab.ai/ai-hackathons/alpaca-ai-trading-agents-hackathon/quantum-coders/alphapilot-ai), [Paper Profit](https://backiee.wasmer.app/https_github_com/fknadm/paper-profit) — confirm watchlists, order history, P&L/equity curve, and AI coach/analyst as common; read-only AI is the norm (LOW-MEDIUM; blog/hackathon-grade sources)

---
*Feature research for: AI-assisted simulated trading workstation*
*Researched: 2026-10-06*
