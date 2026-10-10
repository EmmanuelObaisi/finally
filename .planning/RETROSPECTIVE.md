# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-10-10
**Phases:** 6 | **Plans:** 34 (88 tasks) | **Sessions:** not tracked

### What Was Built
- Walking skeleton proven on the real machine: FastAPI + Next.js 16.4 static export in a three-stage, non-root Docker image, against one frozen API/SSE contract
- Live market engine (correlated GBM simulator, optional Massive REST poller) streaming over native FastAPI SSE into a dark terminal with flashes, sparklines and an honest connection dot
- Atomic market-order trading and watchlist management under one tracking rule (watchlist ∪ positions)
- Main ticker chart, portfolio value chart and a d3-hierarchy P&L treemap
- AI copilot (LiteLLM → OpenRouter pinned to Cerebras, structured outputs) that executes trades and watchlist changes, with a deterministic mock mode
- One-command launch on a persistent volume, and every PLAN.md §12 scenario proven (329 + 345 unit tests, 20 container E2E tests)

### What Worked
- Vertical slices: every phase left a runnable app and a visible capability, so UAT always had something real to check
- Pulling the Docker build and host Playwright into Phase 1 surfaced the Avast TLS and App Control risks before any feature depended on them
- Freezing `planning/API_CONTRACT.md` in Phase 1 meant backend and frontend never drifted; contract changes were explicit edits
- One human package-approval gate per phase (exact pins, locked installs) kept supply-chain risk visible, including avoiding the compromised LiteLLM releases
- Mock LLM mode and private compose projects (`finally-test`, `finally-persist`) made E2E fast, free and safe for the user's own data

### What Was Inefficient
- Phase 1 needed three gap-closure plans (01-06..01-08) after verification; part of what it built (the health placeholder page and its spec) was replaced in Phase 2
- Verification fingerprints for phases 1-3 went stale as later phases edited shared files, forcing a re-verification pass at milestone close
- Some research claims did not survive contact with reality (`turbopackUseSystemTlsCerts` does not exist in Next 16.4; the lifespan-event shutdown recipe for SSE was disproved)
- Info-level review findings accumulated (about 25 across phases) without a scheduled clean-up phase; Nyquist VALIDATION.md files were left in draft for phases 1-2

### Patterns Established
- Every backend failure uses the `{"error"}` envelope; unknown or wrong-method `/api` requests are 404, never 405 or 422
- Tracking changes (trade, watchlist add/remove) are serialized by one `asyncio.Lock`, with `sync_ticker` the single place a ticker stops being tracked
- Pure state reducers (`applyFrame`, `liveTotals`) feed zustand stores; components only render, which keeps flash, sparkline and totals unit-testable in jsdom
- Automated checks never touch the user's app: explicit `-p` compose projects, dedicated images, literal mock pins
- On this machine: `uv run python -m pytest`, `UV_SYSTEM_CERTS=1`, `NODE_EXTRA_CA_CERTS`, and the interception CA only as a Docker build secret

### Key Lessons
1. Verify machine-specific risks (TLS interception, App Control, Docker) in the first phase, before features depend on them.
2. Prove a library or config claim with a run before planning around it; research summaries can be confidently wrong.
3. Shared files edited by later phases make earlier verification reports stale; expect a re-verification pass before closing a milestone.
4. Schedule a small clean-up phase for accumulated info-level review findings instead of carrying them all to the end.

### Cost Observations
- Model mix: not tracked (`adaptive` profile; planner opus, verifier sonnet, checker haiku at close)
- Sessions: not tracked
- Notable: 34 plans in 4 days; most plans executed in under 10 minutes, and the Docker/E2E-heavy plans (01-03, 01-05, 06-02..06-04) were the slowest at 18-30 minutes

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | not tracked | 6 | Vertical slices with a Phase 1 walking skeleton and a frozen API contract |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | 329 backend + 345 frontend unit, 20 E2E | not measured | not tracked |

### Top Lessons (Verified Across Milestones)

1. (Pending a second milestone to cross-validate.)
