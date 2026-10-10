---
phase: 01-walking-skeleton
plan: 02
subsystem: docs
tags: [api-contract, sse, rest, market-data, documentation]

requires: []
provides:
  - "planning/API_CONTRACT.md: the single API/SSE contract (conventions, PriceUpdate, SSE wire format, ten endpoints, shared shapes, mock LLM table, empty/null cases)"
  - "MARKET_INTERFACE.md and MARKET_SIMULATOR.md reconciled to session_start_price / change_percent (D-01)"
  - "CLAUDE.md pointing agents at the contract with no false completion claim"
affects: [01-03, 01-04, 01-05, phase-02-market-engine, phase-03-trading, phase-05-chat]

actuals:
  tokens: 3400
  tasks: 2
  commits: 2
plan_head_before: 2722c6024daeb7e50e18698c226eec8684bc8413
plan_head_after: 02e65197f01f0d3ad3ab4cc7084a8b843e9b38da

tech-stack:
  added: []
  patterns:
    - "One contract file as the single wire-format authority; changes happen by editing it"
    - "change/direction tick-over-tick for the flash; change_percent from session_start_price"

key-files:
  created: [planning/API_CONTRACT.md]
  modified: [planning/MARKET_INTERFACE.md, planning/MARKET_SIMULATOR.md, CLAUDE.md]

key-decisions:
  - "change_percent is measured from session_start_price (first cached price since process start) for both simulator and Massive; change and direction stay tick-over-tick (D-01)"
  - "Massive previous-close reference dropped: PriceCache.update(ticker, price, timestamp=None) takes no reference argument"
  - "Re-adding a watchlist ticker is an idempotent 200; wrapper shapes are {watchlist: [...]}, {history: [...]}, {messages: [...]}"
  - "Unknown /api/* path returns 404 {\"error\": \"Not found\"}; mock LLM keywords match case-insensitively (details the plan left open)"

requirements-completed: [FND-04, FND-06]

coverage:
  - id: D1
    description: "SSE payload names frozen once in API_CONTRACT.md and both market design docs use the same names; no legacy field name remains under planning/"
    requirement: FND-04
    verification:
      - kind: other
        ref: "Task 1 automated verify (grep -F for contract strings, grep -rn day_change_percent|reference_price prints nothing)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Contract covers every endpoint's request, success body, status codes and error body, shared shapes, mock LLM table and empty/null cases"
    requirement: FND-04
    verification:
      - kind: other
        ref: "Task 2 automated verify (grep -F loop over endpoint strings and shape names)"
        status: pass
    human_judgment: false
  - id: D3
    description: "CLAUDE.md names planning/API_CONTRACT.md, keeps the title and the @planning/PLAN.md import, and drops the stale completion claim and dead pointers"
    requirement: FND-06
    verification:
      - kind: other
        ref: "Task 2 automated verify (grep for contract path, import line, absence of MARKET_DATA_SUMMARY|planning/archive|has been completed)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Contract wording is unambiguous enough for Phases 2-5 to implement against without re-asking"
    verification: []
    human_judgment: true
    rationale: "Clarity and completeness of prose is judged by the people who implement against it; no test asserts it"

duration: 15min
completed: 2026-10-07
status: complete
---

# Phase 1 Plan 02: API and SSE Contract Summary

**One frozen contract in planning/API_CONTRACT.md covering the SSE price payload (change_percent from session_start_price) and ten REST endpoints, with the market design docs and CLAUDE.md reconciled to it**

## Performance

- **Duration:** about 15 min
- **Completed:** 2026-10-07T21:38Z
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 edited)

## Accomplishments

- Created `planning/API_CONTRACT.md`: conventions (UTF-8 JSON, 200/400/404/500, `{"error": "..."}`, rounding, timestamp formats, ticker format `[A-Z][A-Z.]{0,9}`), the PriceUpdate shape and the SSE wire format (`retry: 1000`, `: ping`, full tracked set per frame).
- Added the ten endpoint sections, WatchlistItem, Portfolio, Trade, Action (trade and watchlist variants), the LLM structured-output schema, the frozen mock LLM keyword table and the empty/null cases.
- Reconciled `MARKET_INTERFACE.md` (model field, `change_percent` property, `to_dict()`, cache `update()` signature, Massive snapshot path, example frame, test bullet, lifespan note, contract-wins note) and `MARKET_SIMULATOR.md` to D-01. `grep -rn -E 'day_change_percent|reference_price' planning` prints nothing.
- Rewrote the `CLAUDE.md` status paragraph as pointers to the contract, market docs and `.planning/` tracking files.

## Task Commits

1. **Task 1 (tracer): Freeze the SSE price payload end to end** - `b00b6b5` (docs)
2. **Task 2: Complete the REST contract and point CLAUDE.md at it** - `02e6519` (docs)

**Plan metadata:** committed separately as `docs(01-02): complete API and SSE contract plan`.

## Files Created/Modified

- `planning/API_CONTRACT.md` - the single API/SSE contract
- `planning/MARKET_INTERFACE.md` - session_start_price / change_percent, no reference argument, contract pointer
- `planning/MARKET_SIMULATOR.md` - session-start bullet
- `CLAUDE.md` - agent entry point corrected

## Decisions Made

- D-01 implemented as specified. `session_start_price` is the first price cached since process start for both sources, so Massive no longer carries a previous-close reference.
- Where the plan left a detail open, the contract fixes it: unknown `/api/*` paths return `404 {"error": "Not found"}`, mock LLM keywords match case-insensitively, and empty chat history is `{"messages": []}`. Phase 2-5 work should treat these as part of the contract.

## Deviations from Plan

None - plan executed exactly as written.

The tracer gate ran in end-of-phase mode with an automated-only `<verify>`: it was re-run and passed before Task 2, so no checkpoint was raised. One acceptance criterion (the phrase "idempotent 200") failed on first check because the wording used a backticked `200`; it was reworded and re-checked within the same task.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** none.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

None - documentation only. T-01-04, T-01-05 and T-01-06 mitigations are written into the contract (single contract file, generic 500 body, ticker format and `quantity > 0` rules).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plans 01-03 to 01-05 can implement the error envelope, the 404 catch-all and `GET /api/health` against the contract.
- `README.md` is still stale and is corrected in 01-05.
- Unrelated uncommitted orchestrator state (`.planning/config.json`, `milestone.lock`, `state.json`) was left uncommitted.

---
*Phase: 01-walking-skeleton*
*Completed: 2026-10-07*

## Self-Check: PASSED

- FOUND: planning/API_CONTRACT.md, planning/MARKET_INTERFACE.md, planning/MARKET_SIMULATOR.md, CLAUDE.md
- FOUND commits: b00b6b5, 02e6519 (ancestors of HEAD)
- Task 1 and Task 2 automated verifies exit 0; legacy-name grep prints nothing; `.claude/CLAUDE.md` unchanged
