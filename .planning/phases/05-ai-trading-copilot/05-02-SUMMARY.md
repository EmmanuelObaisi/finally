---
phase: 05-ai-trading-copilot
plan: 02
subsystem: api
tags: [fastapi, chat, sqlite, llm, tracer, tdd, api-contract]

requires:
  - phase: 05-ai-trading-copilot
    provides: "complete() seam, ChatReply schema, build_messages prompt builder (plan 05-01)"
  - phase: 03-trading-and-watchlist
    provides: "place_trade, add_to_watchlist, remove_from_watchlist, build_portfolio, build_watchlist"
provides:
  - "POST /api/chat: one whole chat turn, returns {message, actions, portfolio, watchlist}"
  - "GET /api/chat/history: stored conversation, newest 100, oldest first"
  - "app.chat: run_turn, execute, get_reply, MAX_ACTIONS, MAX_MESSAGE_CHARS, OVER_CAP_ERROR, GENERIC_ERROR"
  - "app.chat_store: save_turn (one transaction per pair), load_recent"
  - "planning/API_CONTRACT.md records D-07..D-11 and the D-13 clarifications"
affects: [05-04-chat-ui, 06-e2e]

actuals:
  tokens: 9500
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "One broad except, only around the LLM call and the parse; action execution stays outside it"
    - "All SQLite work in asyncio.to_thread before and after the awaited model call; no connection held across it"
    - "Actions list built only from service results; model prose is never the record of an outcome"
    - "Per-action independent execution (trades then watchlist), cap of 10 each with over-cap failures reported"

key-files:
  created:
    - backend/app/chat.py
    - backend/app/chat_store.py
    - backend/tests/test_chat.py
    - backend/tests/test_chat_store.py
  modified:
    - backend/app/main.py
    - planning/API_CONTRACT.md

key-decisions:
  - "LLM failure is a 200 with one of two fixed ASCII texts; provider error text and the API key never reach the client, and the warning log carries the exception class with the key replaced by [redacted]"
  - "A failed turn is stored like a normal turn (user row plus assistant error row with actions '[]')"
  - "Message length is counted in Unicode code points after stripping; the stripped text is what is stored"
  - "Failure mode accepted: a non-DomainError raised by a service mid-batch leaves earlier actions applied and returns the generic 500 (the broad except is deliberately not widened around execution)"

requirements-completed: [CHAT-01, CHAT-04, CHAT-05, CHAT-06, CHAT-07, CHAT-08, CHAT-09, TEST-03]

coverage:
  - id: D1
    description: "POST /api/chat in mock mode fills a trade, persists the user and assistant rows, and GET /api/chat/history returns the pair; whitespace-only message is a 400 (checked live on uvicorn port 8769)"
    requirement: "CHAT-01"
    verification:
      - kind: unit
        ref: "backend/tests/test_chat.py#test_tracer_buy_fills_and_persists_the_pair"
        status: pass
      - kind: other
        ref: "live uvicorn LLM_MOCK=true on port 8769: buy filled, 2 history messages, whitespace message 400"
        status: pass
    human_judgment: false
  - id: D2
    description: "Each action runs through the manual services in its own transaction, trades then watchlist, independent, capped at 10 each with 'Too many actions in one reply' failures; Action.quantity and price follow D-13"
    requirement: "CHAT-04"
    verification:
      - kind: unit
        ref: "backend/tests/test_chat.py (execute, failure, tracking, ordering, adjacency, cap, empty_actions, parallel turns)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Turn persistence in one BEGIN IMMEDIATE transaction, history window, prompt window of 20, outcome lines in the prompt only, fresh portfolio and watchlist in every response"
    requirement: "CHAT-06"
    verification:
      - kind: unit
        ref: "backend/tests/test_chat.py (persist, history, prompt_window, outcome_lines, fresh_state) and backend/tests/test_chat_store.py"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every LLM failure (timeout, provider error, non-JSON, fenced, None, empty, NaN, bad enum, extra key, lone surrogate, missing key) is a graceful 200 that executes nothing; no key or provider text leaks to body or log"
    requirement: "CHAT-08"
    verification:
      - kind: unit
        ref: "backend/tests/test_chat.py#test_llm_failure_is_a_graceful_reply, test_llm_failure_not_configured, test_llm_failure_no_leak_in_body_or_log"
        status: pass
    human_judgment: false
  - id: D5
    description: "Mock-mode routes run the real parse, execute and persist path with no litellm import"
    requirement: "CHAT-09"
    verification:
      - kind: unit
        ref: "backend/tests/test_chat.py (test_mock_*)"
        status: pass
    human_judgment: false
  - id: D6
    description: "API contract states caps, order, fixed failure texts, 2000-character 400, history window with outcome lines, Action.quantity meaning and mock precedence"
    requirement: "TEST-03"
    verification:
      - kind: other
        ref: "grep checks from the plan's Task 3 verify command (CONTRACT_OK)"
        status: pass
    human_judgment: false

plan_head_before: 3171ee17a26e04674f3f3743282a75f8b767341a
plan_head_after: 8810349d68291154f9db8a809acb016562bd0629
commits: 3
duration: 5min
completed: 2026-10-09
status: complete
---

# Phase 5 Plan 02: Chat Turn Summary

**POST /api/chat runs a whole turn server-side (one LLM call through the complete() seam, per-action execution via the manual trade and watchlist services capped at 10 each, atomic persistence of the user and assistant rows) with every LLM failure turned into a fixed-text graceful reply, plus GET /api/chat/history and the matching API contract text.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-10-09T17:35:12Z
- **Completed:** 2026-10-09T17:39:15Z
- **Tasks:** 3 (Task 1 tracer, Task 2 TDD, Task 3 contract)
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments

- `app.chat_store`: `save_turn` writes both rows in one `transaction(conn)`; `load_recent` reads the newest window with `ORDER BY created_at DESC, rowid DESC` and returns it oldest first with parsed actions.
- `app.chat`: `run_turn` strips and validates the message (400 for empty or over 2000 code points), reads context in a thread, awaits `complete()` with no connection open, executes actions, persists in a thread and returns fresh portfolio and watchlist. `get_reply` is the single broad except (LLM call plus parse).
- Tracer proven live: uvicorn with `LLM_MOCK=true`, POST "buy" filled 1 AAPL, history held exactly two messages, whitespace-only message was HTTP 400.
- 41 chat-flow tests and 5 chat_store tests; full backend suite 323 passed, no warnings summary.
- `planning/API_CONTRACT.md` now records the 400 texts, the two fixed failure texts, history window and outcome lines, independent ordered execution, the cap, `Action.quantity` meaning and the frozen mock precedence.

## Task Commits

1. **Task 1: Chat turn end to end (tracer)** - `fd8a64c` (feat)
2. **Task 2: Failures, caps, ordering, persistence, concurrency (TDD)** - `a1d6bbc` (test)
3. **Task 3: API contract text** - `8810349` (docs)

**Plan metadata:** recorded in the docs commit that follows this summary.

## TDD Gate Compliance

Task 2 is `tdd="true"` but its implementation (chat.py, chat_store.py) was already written in the Task 1 tracer, as the plan orders them. The Task 2 tests therefore passed on first run (61 passed) and there is no separate RED commit; they pin existing behavior. Test values were written from the plan's behavior list and the literal UI-SPEC strings rather than from the implementation constants, so copy drift in the fixed texts would be caught. No implementation defect was exposed, so chat.py and chat_store.py were not changed in Task 2. `workflow.tdd_mode` is not enabled, so `check tdd-red-evidence` was not run.

## Deviations from Plan

None - plan executed exactly as written. (Task 3's required phrase "Too many actions in one reply" was kept on a single source line so the plan's grep matches.)

## Issues Encountered

- The upstream 429 noted in 05-01 is covered by the generic-failure path (provider exception, `test_llm_failure_is_a_graceful_reply[provider_error]`); no live call was made in this plan.
- `.planning/config.json`, `.planning/milestone.lock` and `.planning/state.json` pre-dated this run and were left untouched.

## Known Stubs

None.

## Threat Flags

None. The new endpoints are the planned `POST /api/chat` and `GET /api/chat/history`; mitigations T-05-05..T-05-10 are implemented and test-pinned (service-only execution with caps, fixed failure texts with key redaction, parameterized SQL, single-transaction turn writes).

## Next Phase Readiness

- The chat UI plan can consume `POST /api/chat` and `GET /api/chat/history` exactly as documented in `planning/API_CONTRACT.md`.
- Phase 6 E2E can use the frozen mock keywords: malformed, broke, add/remove TICKER, buy, sell.

## Self-Check: PASSED

Created files exist (chat.py, chat_store.py, test_chat.py, test_chat_store.py); commits fd8a64c, a1d6bbc and 8810349 are ancestors of HEAD; full backend suite re-run green (323 passed, no warnings summary); contract grep checks pass; live uvicorn check passed.
