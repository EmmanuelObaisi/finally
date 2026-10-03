# Review of FinAlly PLAN.md

Reviewed: 2026-10-03
Source: `../planning/PLAN.md` relative to the backend workspace (project-root `planning/PLAN.md`). There is no `backend/planning/PLAN.md`.

## Assessment

The architecture and demo scope are coherent, but the plan is not yet a complete implementation contract. Resolve the high-priority findings before building portfolio and chat mutations, then define the API schemas before frontend integration. Section 13 already identifies several useful gaps; those proposals need decisions incorporated into the relevant sections, rather than remaining a separate list of questions.

This is a specification review checked against the existing market-data code. Missing planned components are expected work, not implementation defects. No code was changed and no tests were run for this review.

## High-priority findings

### 1. Trade execution lacks transaction and concurrency guarantees

**References:** Sections 7, 8, 9 and 12.

The plan specifies balance and holding validation but does not require validation and mutation to occur in one transaction. Two concurrent purchases can each validate against the same cash balance and overspend; concurrent sales can similarly oversell. A failure between updating cash, updating a position, and writing the trade log can leave inconsistent state.

**Recommendation:** Define one trade service shared by manual and AI actions. Acquire the SQLite write transaction before reading balances and holdings, validate against that transaction's state, and commit cash, position, trade log and the post-trade snapshot together. Define rollback and lock-contention behavior. Test concurrent buys/sells and injected failures, not only sequential arithmetic.

### 2. Retry semantics can execute trades twice

**References:** Sections 8 and 9.

Neither mutation endpoint has an idempotency contract. If a trade or chat action commits but its HTTP response is lost, retrying can execute it again. A chat retry can also generate a different action list for the same user message.

**Recommendation:** Accept a client-generated request ID for trade and chat submissions, persist a unique request record and the committed outcome, and return that outcome for duplicates. Reject reuse with a different payload. Define recovery for a chat request interrupted between model inference and action execution. Test retries after a committed mutation with a lost response.

### 3. Market-price availability is not defined for execution or valuation

**References:** Sections 6–9; Section 13 items 1, 5 and 6; `app/market/massive_client.py`, `cache.py` and `factory.py`.

Tracking only watched symbols loses prices for held positions removed from the watchlist. An unwatched symbol added through Massive has no immediate price: `add_ticker()` schedules it for a later poll. Poll failures retain cached prices indefinitely. The plan's instruction to fill at the current price does not specify what happens when that price is absent or stale, including outside trading hours.

**Recommendation:** Track the union of watchlist and open positions, and define a bounded quote-acquisition path for new trade symbols. Specify quote validity, freshness, market-closed behavior and explicit rejection when a usable quote is unavailable. Distinguish source quote time from fetch time. Valuation should expose unavailable/stale values rather than silently treating a holding as worthless. Rebuild tracked symbols from persisted state on startup.

### 4. Fractional trading needs a precision and validation policy

**References:** Sections 7, 8 and 12; Section 13 item 5.

SQLite `REAL` balances, prices, quantities and average costs leave rounding rules unspecified. Fractional operations can produce residual holdings or tiny negative balances. The plan also omits rejection of non-finite numeric values and maximum input bounds.

**Recommendation:** Define supported quantity and monetary precision, a fixed-point or decimal storage/calculation strategy, rounding at each boundary and the exact zero-position rule. Validate positive, finite, bounded quantities and prices in the common trade service. Include fractional buys, partial sales, full liquidation and repeated operations in acceptance tests.

### 5. Chat action outcomes and execution order are ambiguous

**References:** Section 9 and Section 13 items 4 and 8.

The model produces its message before execution, so it can claim a trade succeeded even when backend validation fails. The sentence saying the error is returned "so the LLM can inform the user" does not match the one-call sequence. Multiple trades and watchlist changes also lack ordering and partial-failure rules; selling to fund a purchase makes order significant.

**Recommendation:** Define ordered action execution and choose whether batches are atomic or allow partial success. Return a typed result for every action with its actual status, error and executed quantity/price. Make the UI derive execution confirmations from those results. Either add a second model call to summarize outcomes or explicitly label the first message as commentary generated before execution. Define timeout, malformed-output and missing-key behavior, with no mutations before complete schema validation.

## Integration findings

### 6. The frontend contract is incomplete, especially after reload

**References:** Sections 6, 8 and 10; Section 13 items 2–4; `app/market/models.py` and `stream.py`.

The SSE implementation sends a map of ticker snapshots when the cache version changes; the main plan instead describes each event as an individual ticker update at a regular cadence. `change_percent` is change from the preceding update, not daily change. These differences can produce incompatible frontend parsing and misleading labels.

Chat messages are persisted, but the API has no retrieval endpoint for restoring the conversation after a reload. Similarly, the detailed ticker chart needs an explicit decision about whether it contains only prices received since page load.

**Recommendation:** Publish canonical request/response examples and typed schemas for every endpoint, including timestamps, errors and per-action outcomes. Incorporate the actual SSE map format into Section 6. Rename tick change or add a defined session baseline. Add bounded chat-history retrieval, specify chart-history scope and define how the client refreshes portfolio/watchlist state after actions and on SSE reconnect. Define heartbeats so a healthy but quiet feed is distinguishable from a stalled connection. Cache removal currently does not increment `version`; ensure removal can notify clients, including when the final ticker disappears.

### 7. Startup and persistence responsibilities are inconsistent

**References:** Sections 4, 5, 7 and 11; Section 13 items 10–12.

Initialization is variously described as lazy, on startup, or on the first request. Background price tracking and snapshots need seeded state before requests arrive. The database path is relative and ambiguous in local development. The deployment text also conflates a named Docker volume with a bind mount of the project-root `db/` directory; the shown command uses the former.

**Recommendation:** Initialize schema and seed data once in FastAPI lifespan before starting background tasks; make initialization transactional and idempotent. Define an absolute resolved `DB_PATH`, local and container defaults, and environment-loading precedence. Explicitly choose named-volume persistence or a bind mount. Document a single application worker while cache and scheduler state remain process-local. Bound history responses and define snapshot retention. Record an initial snapshot so a fresh portfolio has a chart baseline.

### 8. No-login deployment needs an explicit access boundary

**References:** Sections 2, 9 and 11.

The local single-user demo has no authentication, while optional cloud deployment exposes mutation endpoints sharing one portfolio and a server-funded model API key. An accessible deployment would let unrelated callers mutate state and consume model usage. Simulated money does not remove that cost.

**Recommendation:** Scope the core application to trusted local access and bind the local Docker port to loopback. If cloud hosting is implemented, require an access gate and model request limits. Define missing-key behavior so the simulator and manual trading remain usable without chat credentials, consistent with the first-launch experience.

### 9. Portfolio P&L and treemap weight need explicit definitions

**References:** Sections 2, 7, 8 and 10.

The plan calls the snapshot chart a P&L chart but stores and displays total portfolio value. It does not define total return, realized P&L, the positions-table percentage baseline, or whether treemap weights include cash. After selling a profitable position, unrealized P&L alone no longer describes the portfolio's gain; a cash-only portfolio also has no position rectangles to display.

**Recommendation:** Define equity as cash plus marked position values, total P&L as equity minus the initial $10,000 (while deposits and withdrawals remain unsupported), and unrealized P&L as quantity times current price minus average cost. Specify the percentage denominators and whether the chart shows equity or profit. Define cash inclusion and an empty-positions state for the treemap. Test a profitable full sale and a cash-only account.

### 10. Mock chat alone does not make end-to-end tests deterministic

**References:** Section 12; `app/market/simulator.py`.

`LLM_MOCK=true` controls model output, but prices still move using both NumPy and Python random generators, and a persisted Docker volume may retain cash, holdings and history from an earlier run. The same mocked buy can therefore have a different fill price or fail against leftover state.

**Recommendation:** Give each test run an isolated fresh database and an injectable fixed-price market source for arithmetic assertions. Test streaming movement separately, with bounded expectations or controlled randomness. Specify mock message-to-action fixtures and disable external provider calls in the E2E environment. Include container restart persistence as a separate scenario using an intentionally retained volume.

## Decisions already raised in Section 13

- Promote tracked-symbol ownership, daily-change semantics, SSE shape, REST schemas, ticker validation, chat-history depth, model failure behavior, deterministic mocks, retention and configuration paths into normative requirements.
- Keep UUID removal, chart-library consolidation, script reduction and E2E harness simplification as optional design choices. They are not blockers.
- Do not replace periodic snapshots solely with history-request snapshots without accepting the changed behavior: periods with no browser requests would lose portfolio history.
- Correct the blanket `user_id` statement to acknowledge the profile primary key, and acknowledge both market-data and snapshot background tasks.
- Resolve the canvas/SVG chart-library wording and the two different paid polling ranges. Make the polling interval an actual supported configuration; the current factory always uses the default.
- Section 9 depends on a `cerebras-inference` skill that is not among this session's available skills. Provide an accessible implementation reference or make the required integration contract self-contained. This review did not verify external provider capabilities or lifecycle dates asserted in the plan.

## Suggested implementation sequence

1. Amend the specification with quote, precision, transaction, idempotency and chat-batch decisions.
2. Define API schemas and examples, including chat history and error outcomes.
3. Implement database lifespan and the common trade service with concurrency and retry tests.
4. Integrate market-data tracking, quote freshness and snapshot recording.
5. Implement chat execution and deterministic mocks, then frontend and container E2E flows.

## Output-location limitation

The requested project-root `planning/REVIEW.md` is outside this session's writable root (`backend/`). This review is saved at `backend/planning/REVIEW.md` instead. The source plan was read from the parent project's `planning/` directory and was not modified.
