# FinAlly — AI Trading Workstation

## What This Is

FinAlly (Finance Ally) is a Bloomberg-style AI trading workstation that runs in a single Docker container. It streams live (simulated or real) market prices, lets the user trade a $10,000 simulated portfolio with market orders, and has an AI chat copilot that analyzes positions and executes trades and watchlist changes by natural language. It is the capstone of an agentic AI coding course, built entirely by coding agents, and is built exactly as `planning/PLAN.md` specifies (with the PLAN.md §13 review proposals adopted).

## Core Value

One command launches a live, data-dense trading terminal where prices stream, trades fill instantly, and the AI copilot can act on the portfolio — and every specified unit and E2E scenario passes to prove it.

## Requirements

### Validated

- ✓ Repo hygiene: committed `backend/static/` and `test/node_modules/` removed and gitignored — Phase 1
- ✓ Multi-stage Dockerfile (Node 24 -> Python 3.12 + uv `--locked`) serving API + static frontend on port 8000, non-root — Phase 1

### Active

- [ ] Market data subsystem rebuilt from the design docs: GBM simulator (correlated moves, random events, ~500ms ticks), optional Massive REST poller, shared price cache, one abstract interface
- [ ] SSE stream `GET /api/stream/prices` pushing all tracked tickers on cache change
- [ ] SQLite database lazily created and seeded (default user with $10,000 cash, 10 default watchlist tickers)
- [ ] Watchlist API: list with prices, add (validated), remove
- [ ] Portfolio API: positions/cash/total value/unrealized P&L, market-order trades with validation, value history
- [ ] AI chat API: LiteLLM → OpenRouter (`openrouter/openai/gpt-oss-120b`, Cerebras provider) with structured outputs; auto-executes trades and watchlist changes; persists history; deterministic mock mode
- [ ] Next.js static-export frontend: watchlist with flashing prices and sparklines, main ticker chart, portfolio treemap heatmap, P&L chart, positions table, trade bar, collapsible AI chat panel, header with live total value, cash and connection dot
- [ ] Dark terminal visual design per PLAN.md §2 (accent yellow `#ecad0a`, blue `#209dd7`, purple `#753991` submit buttons)
- [ ] SQLite on a named Docker volume (persists across container restarts)
- [ ] Start/stop scripts for macOS/Linux and Windows (thin, idempotent wrappers)
- [ ] Backend pytest suite and frontend component tests covering PLAN.md §12
- [ ] Playwright E2E suite covering every PLAN.md §12 scenario, run with `LLM_MOCK=true`

### Out of Scope

- Authentication, signup, multi-user — single hardcoded `default` user by design (schema keeps `user_id` for the future)
- Limit orders, order book, partial fills, fees — market orders only keeps portfolio math simple
- Token-by-token LLM streaming — Cerebras is fast enough; a loading indicator suffices
- Trade confirmation dialogs — deliberate: fake money, fluid agentic demo
- WebSockets — SSE is sufficient for one-way push
- Postgres / separate DB server — SQLite is self-contained
- Massive WebSocket feed — REST polling works on all tiers
- Cloud deployment (Terraform/App Runner) — stretch goal only, not part of core build
- Background snapshot task — replaced by snapshot-after-trade + on history request (§13 #20)
- Dedicated Playwright container / `docker-compose.test.yml` — Playwright runs on the host against the container (§13 #23)

## Context

- **Spec:** `planning/PLAN.md` is the source of truth. Detailed market data design lives in `planning/MARKET_INTERFACE.md`, `planning/MARKET_SIMULATOR.md`, `planning/MASSIVE_API.md` (module layout, data model, cache, interface, tracking rule, ticker validation, tests).
- **Repo state after Phase 1 (2026-10-08):** walking skeleton in place: FastAPI app factory with `/api/health`, JSON error envelope and an all-method `/api` catch-all 404; Next.js static-export placeholder page; three-stage Docker image (non-root, healthcheck, CA secret only in build stages); host Playwright smoke test; frozen contract in `planning/API_CONTRACT.md`. README/CLAUDE.md describe the real state.
- **Repo state at init (2026-10-06):** effectively greenfield. `README.md`/`CLAUDE.md` claim market data is done, but no `.py` source exists (only stale `__pycache__`); `planning/MARKET_DATA_SUMMARY.md` and `planning/archive/` referenced by `CLAUDE.md` do not exist. `frontend/` is empty. Stale committed artifacts: `backend/static/` (old Next.js export), `test/node_modules/` (Playwright). README/CLAUDE.md status lines must be corrected as work lands.
- **Agents coordinate through files in `planning/`** (and now `.planning/`).
- **Dev machine:** Windows 11 with Avast TLS interception — every TLS stack (uv, Python/certifi, Node, Next.js) needs its own opt-in to the OS trust store (`UV_SYSTEM_CERTS=1`, `truststore`, `turbopackUseSystemTlsCerts`). Never disable verification.
- **pytest is blocked by App Control here:** run tests as `uv run python -m pytest`; dev deps via `uv sync --extra dev`.
- **LLM calls** must use the project `cerebras` skill (`.claude/skills/cerebras/SKILL.md`).

### Resolved contract decisions (PLAN.md §13, proposals adopted)

1. **Tracked tickers** = watchlist ∪ open positions. Untrack only when in neither (enforced by service layer, per `MARKET_INTERFACE.md` §6). Buying an untracked ticker starts tracking it before reading the price.
2. **Change %** = change since the seed/session-start price (not tick-over-tick, not "daily").
3. **SSE payload:** one event per cache-version change carrying a dict of all tickers: `{"AAPL": {ticker, price, previous_price, timestamp, change, change_percent, direction}, ...}`.
4. **REST errors:** 400 `{"error": "..."}` for validation failures; 404 for deleting an unknown watchlist ticker. Trade and chat endpoints return updated portfolio state (§13 #24). Chat response includes per-action success/failure.
5. **Trade validation:** quantity must be > 0; fractional shares allowed; ticker must have a price after tracking; insufficient cash/shares → 400. Position row deleted when quantity reaches 0.
6. **Ticker validation:** format `[A-Z][A-Z.]{0,9}` after upper-casing; add to source; if no price appears, untrack and 400 "Unknown ticker" (Massive rejects bad symbols; simulator accepts any well-formed one).
7. **Chat history depth:** last 20 messages sent to the LLM.
8. **LLM failures** (timeout, malformed JSON, missing key) → chat returns a graceful assistant error message, no actions executed.
9. **Mock LLM:** deterministic keyword-driven responses (e.g. message containing "buy" → buy 1 AAPL), defined for E2E use.
10. **Snapshots** recorded after each trade and on each history request — no background task, bounded row growth.
11. **DB path:** `DB_PATH` env var, defaulting to `<project root>/db/finally.db`; `/app/db/finally.db` in Docker.
12. **`.env`:** Docker passes `--env-file .env`; local dev loads project-root `.env` itself.
13. **Schema:** natural primary keys — `users_profile(user_id)`, `watchlist(user_id, ticker)`, `positions(user_id, ticker)` (§13 #19); UUID ids kept only on append-only tables.
14. **Charts:** Lightweight Charts (canvas) for sparklines, main chart and P&L chart; a separate lib only for the treemap (§13 #21).
15. **Node:** current LTS (Node 24) in the Docker build stage, not Node 20.
16. **Massive paid polling:** 2-15s (5s default); free tier falls back to Grouped Daily.
17. **Scripts / compose:** `docker-compose.yml` is the run definition; start/stop scripts are thin idempotent wrappers (§13 #22).

## Constraints

- **Tech stack**: FastAPI + Python 3.12 via `uv`; Next.js + TypeScript static export + Tailwind; SQLite; LiteLLM → OpenRouter/Cerebras — fixed by PLAN.md
- **Deployment**: single container, single port 8000, one origin (no CORS) — students run one command
- **Python tooling**: always `uv run` / `uv add`, never `pip`/`python3` directly — user's mandatory style
- **Code style**: simple, incremental, short modules/functions, no defensive programming, no emojis in code or logs, concise README — user's mandatory style
- **Latest APIs**: use current library APIs (verify with docs) — user requirement
- **Testing**: E2E runs with `LLM_MOCK=true`; no real API calls in tests
- **Security**: TLS verification always stays on; secrets only via `.env` (gitignored)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Build exactly per PLAN.md | User's explicit direction | — Pending |
| Adopt all PLAN.md §13 proposals (see Context) | Closes contract gaps and simplifies before work starts | — Pending |
| Rebuild market data from planning docs | Source code is gone; docs are detailed enough to rebuild | — Pending |
| Done = one docker command + all §12 unit and E2E scenarios green | User's definition of done for the capstone | — Pending |
| Remove committed build artifacts and node_modules | Regenerated by builds; stale and noisy in git | ✓ Good — done in Phase 1 |
| Unknown `/api/*` paths return 404 `{"error": "Not found"}` for every method via a catch-all route | Keeps the JSON envelope; the static mount never answers API paths | ✓ Good — Phase 1; a wrong method on a real route also 404s (decide 405 before Phase 2 adds routes) |
| Interception CA passed only as a build secret in throwaway build stages | Never bake the Avast root into the image | ✓ Good — Phase 1; an interrupted build re-runs cleanly with no CA left behind |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-10-08 after Phase 1*
