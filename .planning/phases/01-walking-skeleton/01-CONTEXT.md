# Phase 1: Walking Skeleton - Context

**Gathered:** 2026-10-06 (decisions taken during /gsd-plan-phase 1 after research; no discuss-phase run)
**Status:** Ready for planning

<domain>
## Phase Boundary

A developer can build and run an end-to-end skeleton of FinAlly on this machine (local and in Docker) against one frozen API/SSE contract. Requirements: FND-01..06, PORT-08, PKG-01. No DB, market data, SSE implementation, charts, LLM, compose or scripts in this phase.

</domain>

<decisions>
## Implementation Decisions

### API/SSE contract
- **D-01:** SSE price fields are `ticker, price, previous_price, timestamp, change, change_percent, direction`, plus `session_start_price`. `change_percent` is measured from the session-start price (simulator and Massive alike); `change` and `direction` stay tick-over-tick. `planning/MARKET_INTERFACE.md` and `planning/MARKET_SIMULATOR.md` are updated to drop `day_change_percent` / `reference_price` in favour of these names.

### Backend test tooling
- **D-02:** Use plain `httpx` (not `httpx2`) as the Starlette `TestClient` transport, with a pytest warnings filter for Starlette's preference warning. Do not install `httpx2`.

### Walking Skeleton scope
- **D-03:** SQLite is deferred to Phase 2. The skeleton proves browser -> static page -> same-origin `GET /api/health` instead of a DB read/write; SKELETON.md records the deferral.

### Docker
- **D-04:** The user will have Docker Desktop running before execution; no "start Docker Desktop" human checkpoint is needed. The Docker plan still runs the TLS probe before the full build and must keep TLS verification on (optional BuildKit CA secret in throwaway stages only, never baked into the final image).

### E2E location
- **D-05:** Host-run Playwright works on this machine (verified in research), so PROJECT.md §13 #23 stands: Playwright runs on the host from `test/`, no Playwright container.

### Claude's Discretion
- Watchlist re-add semantics (idempotent 200 vs 409) and response wrapper shapes (`{"watchlist": [...]}` etc.) in the contract doc (RESEARCH A7): follow the research recommendation.
- Plan slicing and wave layout.

</decisions>

<specifics>
## Specific Ideas

- Avast root PEM already exists at `C:\ProgramData\Avast Software\Avast\wscert.pem` (same thumbprint as the store root) — use it as the optional build secret source.
- `.gitignore` Python-packaging block (`lib/`, `build/`, `dist/`) must be anchored or removed so `frontend/src/lib/` is not ignored.
- This shell pre-exports `LLM_MOCK` and `OPENROUTER_API_KEY`; config tests must `delenv` the vars they check.

</specifics>

<canonical_refs>
## Canonical References

- `planning/PLAN.md` §8 — endpoint list; §11 — Docker layout
- `.planning/PROJECT.md` Context — resolved contract decisions 1-17
- `.planning/phases/01-walking-skeleton/01-RESEARCH.md` — verified snippets, Docker/TLS pattern, Validation Architecture
- `.planning/phases/01-walking-skeleton/01-PATTERNS.md` — file map and analogs
- `planning/MARKET_INTERFACE.md`, `planning/MARKET_SIMULATOR.md` — to be reconciled with D-01

</canonical_refs>

<code_context>
## Existing Code Insights

Greenfield: no Python or frontend source exists. Stale tracked artifacts (`backend/static/`, `test/node_modules/`, `test/playwright-report/`, `test/test-results/`) are untrack targets, not analogs.

</code_context>
