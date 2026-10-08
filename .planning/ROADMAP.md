# Roadmap: FinAlly — AI Trading Workstation

## Overview

FinAlly is built as a sequence of vertical slices. Each phase leaves the app runnable and adds one capability a user can see. Phase 1 is a walking skeleton: a clean repo, uv backend with health check, Next.js static export, a frozen API/SSE contract, and a Docker build proven on this machine early, because Avast TLS interception and App Control are the top risks. Phase 2 puts live prices on screen: market data engine, SSE, seeded database, watchlist panel and header. Phase 3 adds trading and watchlist management around a single tracking rule. Phase 4 adds the charts and portfolio visualizations. Phase 5 adds the AI copilot that acts on the portfolio. Phase 6 delivers one-command launch and proves every PLAN.md §12 unit and E2E scenario against the container.

**Conventions across phases:**
- Each phase writes unit tests for its own slice as it builds it. The TEST-xx requirements mark where each §12 test area is verified as complete.
- UI phases add stable `data-testid` hooks as they build components. Phase 6 audits and completes them for E2E.
- The contract frozen in Phase 1 (`planning/`) is the single reference. Any change to it is an explicit edit to that doc, not drift.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Walking Skeleton** - Clean repo, backend and frontend skeletons, frozen contract, and a Docker build proven on this machine (completed 2026-10-08)
- [ ] **Phase 2: Live Market Terminal** - Open the app and watch the 10 default tickers stream with flashes, sparklines and a live header
- [ ] **Phase 3: Trading & Watchlist Management** - Buy and sell shares and curate the watchlist, with positions, prices and streams kept consistent
- [ ] **Phase 4: Charts & Portfolio Visualizations** - Main ticker chart, P&L treemap heatmap and portfolio value history chart
- [ ] **Phase 5: AI Trading Copilot** - Chat with FinAlly, which reads the portfolio and executes trades and watchlist changes
- [ ] **Phase 6: One-Command Launch & Full Verification** - Compose and start/stop scripts, persistent volume, and every §12 unit and E2E scenario green

## Phase Details

### Phase 1: Walking Skeleton

**Goal**: A developer can build and run an end-to-end skeleton of FinAlly on this machine (local and in Docker) against one frozen API/SSE contract
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: FND-01, FND-02, FND-03, FND-04, FND-05, FND-06, PORT-08, PKG-01
**Success Criteria** (what must be TRUE):
  1. `backend/static/` and `test/node_modules/` are gone from git and ignored, `.gitattributes` forces LF for `.sh`, Dockerfile and env files, and README.md / CLAUDE.md describe the real state of the code (no "market data is complete" claim)
  2. In `backend/`, `uv run python -m pytest` passes, and running the app locally picks up the project-root `.env` (and the `DB_PATH`, `LLM_MOCK`, `SIM_SEED`, etc. env vars) and answers `GET /api/health` with 200
  3. In `frontend/`, the build produces a static export (`output: 'export'`) of a Tailwind-styled dark placeholder page
  4. `docker build` succeeds on this machine with TLS verification left on, and the running container serves the placeholder page and `/api/health` on port 8000 with one worker. A host-run Playwright smoke check loads that page, or, if App Control blocks host Playwright, the container fallback is chosen and recorded
  5. One API/SSE contract doc in `planning/` defines every endpoint's request/response shape, field names, the `{"error": "..."}` format, status codes, the SSE payload (`change_percent` from the session-start price), and `GET /api/chat/history`. Backend and frontend both reference it

**Plans**: 8/8 plans complete
Plans:
**Wave 1**
- [x] 01-01-PLAN.md — Repo hygiene: untrack build artifacts, fix .gitignore lib/ block, .gitattributes LF, .env.example, db/.gitkeep (W1)
- [x] 01-02-PLAN.md — Frozen API/SSE contract in planning/API_CONTRACT.md, market docs on D-01 names, CLAUDE.md pointer (W1)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 01-03-PLAN.md — Backend skeleton: uv project, create_app + /api/health, env config, {"error"} envelope, pytest (W2, PyPI checkpoint)
- [x] 01-04-PLAN.md — Frontend skeleton: Next 16 static export, Tailwind dark page calling same-origin /api/health (W2, npm checkpoint)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 01-05-PLAN.md — Local full-stack Playwright smoke, Docker TLS probe + 3-stage image on :8000, container smoke, README truth (W3)

**Gap closure** *(01-VERIFICATION.md CR-01 plus review warnings WR-01..WR-05; sequential because each plan updates 01-REVIEW-DISPOSITION.md)*
- [x] 01-06-PLAN.md — Empty env values fall back to defaults (CR-01), hermetic backend tests (WR-03), any-method /api 404 (WR-05) (W1)
- [x] 01-07-PLAN.md — getHealth checks res.ok so a non-2xx health renders "down" (WR-04) (W2)
- [x] 01-08-PLAN.md — Dockerfile fails on a failed uv sync (WR-01), non-root runtime user with writable /app/db (WR-02), full container re-proof (W3)

**Research flag**: Docker-build CA injection under Avast (build secret, never disabling verification). Whether App Control blocks host Playwright or Next native binaries (fallback: Playwright container, reversing §13 #23)

### Phase 2: Live Market Terminal

**Goal**: A user opens FinAlly and watches the 10 default tickers stream live in a dark terminal, with $10,000 cash shown and a live connection indicator
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: MKT-01, MKT-02, MKT-03, MKT-04, MKT-05, MKT-06, MKT-07, MKT-09, MKT-10, DB-01, DB-02, DB-03, WL-01, PORT-01, UI-01, UI-02, UI-03, UI-04, UI-05, UI-08, TEST-01
**Success Criteria** (what must be TRUE):
  1. Opening the app shows the 10 seeded watchlist tickers (AAPL, GOOGL, MSFT, AMZN, TSLA, NVDA, META, JPM, V, NFLX) in a dense dark terminal layout. Prices update about twice a second, flash green on upticks and red on downticks, and fade over ~500ms, with occasional sharp 2-5% event moves
  2. Each watchlist row shows the price, change % since session start, and a sparkline that fills in from page load. Prices show "--" until the first tick (never NaN or 0), and all numbers use shared formatters with tabular numerals
  3. On a fresh (deleted) database, the backend recreates and seeds it on startup, and the header shows $10,000.00 total value and cash. The connection dot is green while streaming, yellow while reconnecting and red when disconnected, and the page reconnects on its own after the backend restarts
  4. With `MASSIVE_API_KEY` set, the same UI is fed by the Massive REST poller with no frontend change. With `SIM_SEED` set, simulator output is reproducible, and a non-seed ticker always starts at the same ticker-derived price across restarts
  5. Stopping the server with browsers connected exits promptly (no SSE hang), and the market data unit tests (valid prices, GBM math, Massive parsing, interface conformance) pass

**Plans**: 3/7 plans executed
Plans:
**Wave 1**
- [x] 02-01-PLAN.md — Package gate (all Phase 2 PyPI/npm packages), market package + native SSE stream tracer, cache/frame/shutdown tests, Playwright launch flags (W1, checkpoint)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 02-02-PLAN.md — SQLite created and seeded in the lifespan, tracked tickers from the DB, GET /api/watchlist and GET /api/portfolio, wrong-method 404 contract rule (W2)
- [x] 02-03-PLAN.md — Realistic, reproducible simulator: sha256-derived start prices, GBM/correlation/event/seed tests (W2)
- [ ] 02-04-PLAN.md — Massive REST poller behind the same interface: paid snapshot, free-plan Grouped Daily within 5 calls/min, factory branch (W2)

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 02-05-PLAN.md — Live watchlist in the browser: one EventSource, zustand store, formatters, panel states, UI-SPEC theme, Vitest harness, new smoke E2E (W3)

**Wave 4** *(blocked on Wave 3 completion)*
- [ ] 02-06-PLAN.md — Header totals, connection dot state machine with reconnect backoff, refetch on reconnect, stale dimming, footer attribution (W4)

**Wave 5** *(blocked on Wave 4 completion)*
- [ ] 02-07-PLAN.md — Price flash and sparklines, row dimming, container proof with timed docker stop, README update (W5)

**UI hint**: yes
**Research flag**: Massive free-tier rate limits (Grouped Daily, weekend/holiday walk-back) and certifi/truststore for the `massive` client. Largest phase (21 requirements): split along market engine/SSE vs terminal UI when planning

### Phase 3: Trading & Watchlist Management

**Goal**: A user can buy and sell shares and curate their watchlist, and every position stays priced and every change shows immediately
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: MKT-08, WL-02, WL-03, PORT-02, PORT-03, PORT-04, PORT-05, PORT-06, UI-06, PUI-01, PUI-02, TEST-02
**Success Criteria** (what must be TRUE):
  1. User enters a ticker and quantity (fractional allowed) in the trade bar and clicks Buy. Cash drops by quantity x current price, and the position appears in the positions table with quantity, avg cost, current price, unrealized P&L and % change updating live, while the header total value tracks it. Each fill is logged and followed by a portfolio snapshot
  2. User sells shares and cash rises. Selling the full quantity removes the position row entirely, with no ghost fractional residue
  3. Invalid trades (quantity <= 0, unpriced ticker, insufficient cash, more shares than owned) show an inline error in the trade bar, return 400 `{"error": "..."}`, and leave cash and positions unchanged. Buy and Sell are disabled while a trade is in flight, and success shows inline
  4. User adds a ticker from the watchlist panel and it starts streaming. A malformed or unknown ticker is rejected with an inline "Unknown ticker" error. Removing a ticker drops it from the panel, and deleting an unknown ticker returns 404
  5. Removing a held ticker from the watchlist keeps its position priced and streaming, and buying an unwatched ticker starts streaming it before it is priced. Portfolio unit tests (execution, P&L, oversell, insufficient cash, selling at a loss) pass

**Plans**: TBD
**UI hint**: yes

### Phase 4: Charts & Portfolio Visualizations

**Goal**: A user can see the selected ticker and their portfolio at a glance: a main price chart, a P&L heatmap and a portfolio value history chart
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: UI-07, PORT-07, PUI-03, PUI-04, PUI-07
**Success Criteria** (what must be TRUE):
  1. A default ticker is shown in the main chart on load, and clicking any watchlist ticker switches the main chart to that ticker's price-over-time line
  2. With positions held, the heatmap shows one rectangle per position sized by portfolio weight, colored green for profit and red for loss, and it updates with live prices
  3. The P&L chart shows total portfolio value over time from snapshots, starting with the seeded $10,000 point on first launch. It refetches every 30s and ends in a live "now" point. A new trade adds a point, and repeated history requests do not flood the snapshot table
  4. With no positions or an emptied watchlist, the watchlist, positions table, heatmap and P&L chart each show an explicit empty state instead of a blank or broken panel

**Plans**: TBD
**UI hint**: yes

### Phase 5: AI Trading Copilot

**Goal**: A user can chat with FinAlly, which understands their portfolio and executes trades and watchlist changes on their behalf
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: CHAT-01, CHAT-02, CHAT-03, CHAT-04, CHAT-05, CHAT-06, CHAT-07, CHAT-08, CHAT-09, PUI-05, PUI-06, TEST-03
**Success Criteria** (what must be TRUE):
  1. User types in the collapsible chat panel and presses Enter. A loading indicator shows until the complete reply arrives, and the conversation auto-scrolls
  2. Asking about the portfolio returns a concise answer from the real model (LiteLLM, then OpenRouter, then Cerebras `gpt-oss-120b`) grounded in current cash, positions with P&L, watchlist prices and total value, and aware of the last 20 messages
  3. Asking FinAlly to buy, sell, or add/remove a watchlist ticker executes it through the same validation as manual actions. Each action's success or failure appears inline in the chat, and the header, positions, heatmap and watchlist refresh from the portfolio state in the response
  4. Reloading the page restores the prior conversation, including action lines. An LLM failure (timeout, malformed output, missing key) shows a graceful assistant error and executes nothing
  5. With `LLM_MOCK=true`, keyword messages (buy, sell, watchlist add/remove, analysis) return deterministic responses with no network calls. LLM unit tests (structured output parsing, malformed responses, trade validation in the chat flow) pass

**Plans**: TBD
**UI hint**: yes
**Research flag**: Live Cerebras strict-schema limits (no `oneOf`/`pattern`/`nullable`, `additionalProperties:false`) and OpenRouter provider pinning (`order=["cerebras"]`, `require_parameters`) through LiteLLM `acompletion`

### Phase 6: One-Command Launch & Full Verification

**Goal**: A user launches FinAlly with one command, and every PLAN.md §12 unit and E2E scenario passes against the running container
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: PKG-02, PKG-03, PKG-04, PUI-08, TEST-04, TEST-05, TEST-06
**Success Criteria** (what must be TRUE):
  1. Running the start script (`start_mac.sh` or `start_windows.ps1`) or `docker compose up` builds the image if needed, starts the container, and prints `http://localhost:8000`. Running it again is harmless
  2. Trades, positions and chat history survive a stop/start because SQLite lives on the named volume at `/app/db`. The stop script removes the container but keeps the volume, and `.env` reaches the container via `--env-file`
  3. The Playwright suite, run from the host against the container with `LLM_MOCK=true`, passes every §12 scenario: fresh start, add/remove ticker, buy, sell, heatmap and P&L chart, mocked AI chat with inline trade, and SSE reconnection. It selects elements by stable `data-testid` hooks
  4. Backend API route tests (status codes, response shapes, error handling) and frontend unit tests (component rendering, price flash, watchlist CRUD, portfolio calculations, chat rendering and loading state) all pass

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6. Phases 4 and 5 both build only on Phase 3. Running 4 first means chat-driven trades also refresh the heatmap and P&L chart when Phase 5 lands.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Walking Skeleton | 8/8 | Complete    | 2026-10-08 |
| 2. Live Market Terminal | 3/7 | In Progress | - |
| 3. Trading & Watchlist Management | 0/TBD | Not started | - |
| 4. Charts & Portfolio Visualizations | 0/TBD | Not started | - |
| 5. AI Trading Copilot | 0/TBD | Not started | - |
| 6. One-Command Launch & Full Verification | 0/TBD | Not started | - |
