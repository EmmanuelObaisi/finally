# FinAlly — AI Trading Workstation

## What This Is

FinAlly (Finance Ally) is a Bloomberg-style AI trading workstation that runs in a single Docker container. It streams live (simulated or real) market prices, lets the user trade a $10,000 simulated portfolio with market orders, and has an AI chat copilot that analyzes positions and executes trades and watchlist changes by natural language. It is the capstone of an agentic AI coding course, built entirely by coding agents exactly as `planning/PLAN.md` specifies (with the PLAN.md §13 review proposals adopted). v1.0 shipped 2026-10-10: one command launches it, and every PLAN.md §12 unit and E2E scenario passes.

## Core Value

One command launches a live, data-dense trading terminal where prices stream, trades fill instantly, and the AI copilot can act on the portfolio — and every specified unit and E2E scenario passes to prove it.

## Requirements

### Validated

- ✓ Repo hygiene: committed `backend/static/` and `test/node_modules/` removed and gitignored — v1.0 (Phase 1)
- ✓ Multi-stage Dockerfile (Node 24 -> Python 3.12 + uv `--locked`) serving API + static frontend on port 8000, non-root — v1.0 (Phase 1)
- ✓ Market data subsystem rebuilt from the design docs: GBM simulator (correlated moves, random events, ~500ms ticks), optional Massive REST poller, shared price cache, one abstract interface — v1.0 (Phase 2)
- ✓ SSE stream `GET /api/stream/prices` pushing all tracked tickers on cache change — v1.0 (Phase 2)
- ✓ SQLite database lazily created and seeded (default user with $10,000 cash, 10 default watchlist tickers) — v1.0 (Phase 2)
- ✓ Dark terminal visual design per PLAN.md §2 (UI-SPEC theme tokens; UI audit 23/24) — v1.0 (Phase 2)
- ✓ Watchlist API: list with prices, add (validated), remove; tracked tickers = watchlist ∪ positions — v1.0 (Phase 3)
- ✓ Market-order trades with validation (atomic, 400 `{error}` on rejection), returning updated portfolio state — v1.0 (Phase 3)
- ✓ Trade bar, positions table and watchlist add/remove UI; header total updates immediately after a trade — v1.0 (Phase 3)
- ✓ Portfolio value history API (`GET /api/portfolio/history`, seed snapshot, 10 s + changed-value snapshot guard) — v1.0 (Phase 4)
- ✓ Main ticker chart (click a watchlist row to select), P&L treemap heatmap and portfolio value chart, each with an explicit empty state — v1.0 (Phase 4)
- ✓ AI chat API: LiteLLM → OpenRouter (`openrouter/openai/gpt-oss-120b`, Cerebras provider) with structured outputs; auto-executes trades and watchlist changes; persists history; deterministic mock mode — v1.0 (Phase 5); live smoke and real-model UAT passed
- ✓ Collapsible AI chat panel (docked at 1536 px and wider, overlay drawer below) with inline action lines and reload restore — v1.0 (Phase 5)
- ✓ SQLite on a named Docker volume (`finally-data`, persists across stop/start; proven by `npm --prefix test run persist`) — v1.0 (Phase 6)
- ✓ Start/stop scripts for macOS/Linux and Windows (thin, idempotent `docker compose` wrappers, loopback-only port) — v1.0 (Phase 6); real launch passed UAT
- ✓ Backend pytest suite and frontend component tests covering PLAN.md §12 (329 + 345 tests; audit matrix in 06-TEST-AUDIT.md) — v1.0 (Phase 6)
- ✓ Playwright E2E suite covering every PLAN.md §12 scenario with `LLM_MOCK=true`, one command against a throwaway container (`npm --prefix test run e2e`, 20 passed, 0 skipped) — v1.0 (Phase 6)

### Active

(none — next milestone not yet defined; run `/gsd-new-milestone`)

Candidate inputs for the next milestone (not committed): the v1.0 tech-debt list in `milestones/v1.0-MILESTONE-AUDIT.md`, and the PLAN.md §11 stretch goal (Terraform/App Runner deploy in `deploy/`).

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

## Current State

**Shipped:** v1.0 MVP (2026-10-10) — 6 phases, 34 plans, 88 tasks over 4 days. See `MILESTONES.md`.

- **Codebase:** ~4.5k lines Python (FastAPI, SQLite, market data, LiteLLM chat) and ~7.3k lines TypeScript (Next.js 16.4 static export, zustand, Lightweight Charts v5, d3-hierarchy, Vitest, Playwright).
- **Proof:** 329 backend + 345 frontend unit tests; 20 Playwright E2E tests against a throwaway mock-pinned container; persistence and start/stop scripts proven in both shells.
- **Known issues:** info/warning-level review findings only (no requirement gaps), listed in `milestones/v1.0-MILESTONE-AUDIT.md`. Most visible: a pre-Phase-4 database shows an empty P&L chart until the first trade; `trade-chat.spec.ts` assumes a fresh database; one rare flaky backend test (`test_llm_failure_no_leak_in_body_or_log`).

## Context

- **Spec:** `planning/PLAN.md` is the source of truth. Detailed market data design lives in `planning/MARKET_INTERFACE.md`, `planning/MARKET_SIMULATOR.md`, `planning/MASSIVE_API.md` (module layout, data model, cache, interface, tracking rule, ticker validation, tests).
- **Agents coordinate through files in `planning/`** (and now `.planning/`).
- **Dev machine:** Windows 11 with Avast TLS interception — every TLS stack (uv, Python/certifi, Node, Next.js) needs its own opt-in to the OS trust store (`UV_SYSTEM_CERTS=1`, `NODE_EXTRA_CA_CERTS`; the Docker build takes the CA only as a build secret). `turbopackUseSystemTlsCerts` does not exist in Next 16.4, and certifi verifies fine here, so no `truststore` was needed. Never disable verification.
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
| Build exactly per PLAN.md | User's explicit direction | ✓ Good — v1.0 shipped to spec; 65/65 requirements, all §12 scenarios green |
| Adopt all PLAN.md §13 proposals (see Context) | Closes contract gaps and simplifies before work starts | ✓ Good — v1.0; every proposal landed and no contract gap reopened |
| Rebuild market data from planning docs | Source code is gone; docs are detailed enough to rebuild | ✓ Good — Phase 2; simulator and Massive poller behind one interface, real Massive key verified in UAT |
| Done = one docker command + all §12 unit and E2E scenarios green | User's definition of done for the capstone | ✓ Good — Phase 6; one-command launch passed UAT, all suites green |
| Remove committed build artifacts and node_modules | Regenerated by builds; stale and noisy in git | ✓ Good — done in Phase 1 |
| Unknown `/api/*` paths return 404 `{"error": "Not found"}` for every method via a catch-all route | Keeps the JSON envelope; the static mount never answers API paths | ✓ Good — Phase 1; a wrong method on a real route also 404s (decide 405 before Phase 2 adds routes) |
| Interception CA passed only as a build secret in throwaway build stages | Never bake the Avast root into the image | ✓ Good — Phase 1; an interrupted build re-runs cleanly with no CA left behind |
| Wrong method on a known `/api/*` path is 404, never 405 | One JSON envelope via the existing catch-all; settles the Phase 1 open question | ✓ Good — Phase 2; written into `planning/API_CONTRACT.md` |
| One blocking-human package gate before any phase install | Supply-chain check (registry repo, version, install scripts) in one place | ✓ Good — Phase 2; all 12 packages approved, exact pins, locked installs |
| No `truststore` for the Massive client unless `CERTIFICATE_VERIFY_FAILED` is observed | Research and a real call show certifi verifies on this machine; fix only proven problems | ✓ Good — Phase 2; review fix WR-05 reverted at user request |
| Reject orders whose value rounds to $0.00 ("Order value is too small"), except a sell of the whole position | Sub-cent buys acquired shares for free; the exemption keeps dust positions closable without allowing $0.00 partial sells | ✓ Good — Phase 3 review fixes WR-01/WR-06; in `planning/API_CONTRACT.md` |
| One `asyncio.Lock` serializes every tracking change (trade, watchlist add/remove) | The watchlist ∪ positions rule was check-then-act and raced with a slow-poll source | ✓ Good — Phase 3 review fix WR-03 |
| Snapshots recorded on trades and on history requests (no 30 s background task), guarded by 10 s and a changed 2 dp total | PLAN.md §13 #20; avoids a second background task without flooding the table | ✓ Good — Phase 4 |
| Treemap is `d3-hierarchy` layout rendering plain divs | Full control of P&L colors and transitions at ~136 KB, unit-testable in jsdom | ✓ Good — Phase 4; UAT legible at 4 viewport sizes |
| Strict Cerebras pinning (no OpenRouter fallbacks, no LiteLLM Router) | A provider outage must become the graceful assistant error, never a silent reroute | ✓ Good — Phase 5; live smoke confirmed the Cerebras route |
| Chat text that cannot be encoded as UTF-8 is a 400 before any model call or action | A lone surrogate executed trades and then failed to store the turn (review CR-01) | ✓ Good — Phase 5 |
| An unexpected exception inside one chat action becomes a failed action with fixed text | Keeps the batch going and the turn stored instead of a 500 after partial commits (review WR-01) | ✓ Good — Phase 5 |
| Automated launch and E2E checks run only on private compose projects (`finally-test`, `finally-persist`) with explicit `-p`, image `finally-e2e` and literal mock pins | Tests must never touch the user's own app, volume or API credit | ✓ Good — Phase 6; user volume and images unchanged across every run |
| E2E runs Playwright on the host against a container (no Playwright container) | PLAN.md §13 #23 | ✓ Good — Phase 6 |

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
*Last updated: 2026-10-10 after v1.0 milestone*
