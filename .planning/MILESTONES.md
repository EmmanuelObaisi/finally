# Milestones

## v1.0 MVP (Shipped: 2026-10-10)

**Delivered:** One Docker command launches a live, data-dense AI trading terminal: streaming prices, instant market-order fills on a $10,000 simulated portfolio, charts and a P&L heatmap, and an AI copilot that trades and curates the watchlist by chat.

**Phases completed:** 6 phases, 34 plans, 88 tasks

**Closeout:** verified_closeout (all 6 phases verified `passed`; open-artifact audit clear, 0 acknowledged). Known verification overrides: 0 newly acknowledged, 0 carried forward.

**Key accomplishments:**

1. Walking skeleton proven on this Avast/App Control machine: FastAPI + Next.js 16.4 static export in a three-stage, non-root Docker image with TLS verification left on, against one frozen API/SSE contract (`planning/API_CONTRACT.md`).
2. Live market engine: correlated GBM simulator and an optional Massive REST poller behind one interface, a shared price cache and native FastAPI SSE feeding a dark terminal with price flashes, sparklines and an honest connection indicator.
3. Atomic market-order trading and watchlist management under one tracking rule (watchlist ∪ positions), so every held ticker stays priced and the header, positions table and watchlist update immediately.
4. Main ticker chart, portfolio value history chart (Lightweight Charts v5) and a `d3-hierarchy` P&L treemap heatmap, each with explicit loading, error and empty states.
5. AI copilot: LiteLLM → OpenRouter pinned to Cerebras with structured outputs, auto-executing trades and watchlist changes through the same validation as manual trades, graceful failure replies, and a deterministic mock mode.
6. One-command launch (compose plus idempotent start/stop scripts on a persistent named volume) and every PLAN.md §12 scenario proven: 329 backend + 345 frontend unit tests and 20 Playwright E2E tests against a throwaway container.

**Stats:**

- Commits: 335 total; feature range `3098c56` (first `feat(`) → `927d50d` (last `feat(`)
- Code: ~4.5k lines Python, ~7.3k lines TypeScript (tracked sources and tests)
- Timeline: 4 days (2026-10-06 → 2026-10-10)

**Known tech debt:** info/warning-level review findings carried in `milestones/v1.0-MILESTONE-AUDIT.md` (no requirement, integration or flow gaps).

**Archives:** `milestones/v1.0-ROADMAP.md`, `milestones/v1.0-REQUIREMENTS.md`, `milestones/v1.0-MILESTONE-AUDIT.md`, `milestones/v1.0-phases/`

---
