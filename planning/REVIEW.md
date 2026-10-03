# Review of planning/PLAN.md

Reviewed 2026-10-03 against the plan, implemented market data code, its tests, and repository configuration. Static review only; no tests or external provider checks were run. Portfolio, chat, frontend, and deployment components remain planned, so findings about them concern design requirements rather than implemented defects.

The architecture is suitable for the single-user demo, but execution and persistence contracts need resolution before implementation. Section 13 already identifies important gaps, especially held-ticker tracking, API schemas, and validation. Its proposals should not be treated as settled decisions.

## High priority

1. **Trade writes need an atomic transaction and a concurrency policy (Sections 7–9).** Validation, balance changes, position changes, trade logging, and snapshots have no defined transaction boundary. Overlapping manual/chat buys could both validate against the same cash balance; failures between writes could leave the ledger inconsistent. Require validation and associated database writes in one serialized write transaction with rollback on failure. Read one quote per fill and retain it throughout the transaction. Test concurrent buys and injected write failures.

2. **Retries can execute trades twice (Sections 8–9).** A request may commit even if its HTTP response is lost. Retrying it can repeat the trade or every chat action. Define a client request identifier, persisted deduplication, and replay of the original result. For chat, define recovery after some actions commit but before the final response is stored. Test duplicate submissions and response loss.

3. **Adding a ticker does not guarantee readiness to trade (Sections 6 and 9).** `SimulatorDataSource.add_ticker()` seeds a quote immediately, but `MassiveDataSource.add_ticker()` only includes it in the next poll. Applying watchlist additions before trades therefore does not solve add-and-buy requests in both modes. Define action order, bounded quote readiness, and whether batches permit partial success. Return each action's actual fill or error. Cover unwatched tickers and sell-then-buy batches.

4. **Polling frequency does not guarantee fresh quotes (Section 6).** `MassiveDataSource._poll_once()` retains old cache entries on failures and uses the last trade timestamp. A 15-second polling interval does not bound quote age to 15 seconds. Specify acceptable quote age, handling of missing/stale quotes, and their effect on valuation and snapshots. Reject or explicitly label stale-price fills. Keep data freshness separate from the header's SSE connection status.

5. **Financial precision and accounting rules are missing (Section 7).** Money and fractional quantities use REAL. Define quantity precision, monetary rounding, weighted-average cost on buys, cost basis on partial sells, and residual quantities on liquidation. Apply one consistent decimal or scaled-integer policy across validation, persistence, and responses. Test fractional trades and purchases whose rounded cost exactly equals available cash.

6. **The completed LLM call cannot narrate later execution errors (Section 9).** The plan says a failed trade's error is returned so the LLM can inform the user, but its only model call precedes execution. Generated text can claim success when validation later fails. Use a bounded follow-up call or render authoritative action results separately. Include actual execution outcomes in subsequent conversation history, not only assistant text.

7. **Initialization and task ordering need one owner (Sections 4 and 7).** Lazy initialization conflicts with background tasks needing seeded state. Define startup order: initialize/seed transactionally, load watchlist plus held tickers, start the data source, then snapshots; stop tasks on shutdown. Preserve an intentionally empty watchlist and existing balances. Specify one application worker: multiple workers otherwise own independent caches and pollers and may duplicate snapshots.

## Medium priority

8. **Simulator restart continuity is undefined (Sections 6–7).** SQLite preserves holdings and snapshots, but `GBMSimulator` restarts from seed prices. Restarting or removing and re-adding a ticker can create abrupt valuation jumps. Choose whether simulation prices persist or reset, explain the behavior in the UI, and test restart with open positions.

9. **Persisted chat history has no retrieval API (Sections 7–10).** Only `POST /api/chat` is listed. Define a read endpoint or bootstrap response, stable ordering, and bounded retrieval so reloads restore messages and action results.

10. **Ticker normalization differs by provider.** Massive additions strip whitespace and uppercase symbols; its startup path simply copies the list, while the simulator and cache do not normalize. Normalize at a common boundary for manual requests, model actions, persisted state, and startup. Otherwise `aapl` becomes a separate simulated asset with a random seed price. Test lowercase and whitespace inputs in both modes.

11. **SSE empty-state and idle behavior are incomplete (Section 6).** `PriceCache.remove()` does not increment the version, and `_generate_events()` never emits empty snapshots or periodic heartbeats. Removing the final tracked ticker cannot clear client state through the stream; an idle stream has no regular traffic. Define empty snapshots and heartbeat comments. Test final-ticker removal and reconnecting to an empty cache. Stream connectivity must not imply provider health.

12. **Docker storage documentation contradicts the command (Section 11).** `-v finally-data:/app/db` mounts a named volume, not the repository's `db/` directory. Choose a named volume or host bind mount, document where data lives, and align scripts and local paths. Ignore the runtime database and SQLite sidecars; `.gitignore` currently excludes only `db.sqlite3`.

## Additional implementation notes

- Section 9 provides an example object, not a formal JSON schema. Define allowed sides/actions, finite positive quantities, unknown-field handling, and defaults for omitted arrays. Validate model output before executing it.
- Register API routes before mounting static files at `/`. Define static 404/fallback behavior while preserving API errors for unknown `/api/*` paths.
- Define the positions table percentage, preferably unrealized return against average cost. Section 13 separately covers the missing watchlist daily-change definition.
- `.env.example` and the planned runtime `db/` directory are absent. Include them as implementation deliverables. Mock mode should start without an OpenRouter key.
- `create_stream_router()` adds routes to a module-level router; repeated calls register duplicate routes with different cache closures. Construct the router inside the factory.
- Public deployment would allow anyone with access to spend paid chat credit and mutate the shared portfolio. Define access restrictions before deploying publicly. This exposes use of the server-side key, not necessarily its value.

## Acceptance checks

Extend Section 12 with concurrent and duplicate trades; partial chat failure; stale/missing quotes; add-and-buy in both providers; fractional/full-liquidation accounting; empty portfolio/watchlist rendering; reload restoring chat; and restart preserving balances, holdings, and the chosen simulation semantics.

Use fixed quotes for exact accounting assertions. A random seed alone does not make wall-clock E2E execution deterministic because requests can occur after different numbers of simulator ticks. Keep live-simulator checks focused on streaming and UI updates.

Resolve findings 1–7 together with Section 13's contract gaps before backend/frontend integration. They determine whether the UI can accurately report what executed and what the portfolio is worth.
