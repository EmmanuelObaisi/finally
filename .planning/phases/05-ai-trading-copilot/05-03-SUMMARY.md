---
phase: 05-ai-trading-copilot
plan: 03
subsystem: ui
tags: [zustand, react, vitest, chat, sse-adjacent-stores]

requires:
  - phase: 05-ai-trading-copilot
    provides: frozen POST /api/chat and GET /api/chat/history wire shapes (planning/API_CONTRACT.md)
provides:
  - ChatAction, ChatMessage, ChatReply wire types
  - postChat and getChatHistory API calls
  - actionText pure sentence builder for chat action lines
  - useChatStore (send lifecycle, history, panel open and focus counter)
  - useWatchlistStore push channel consumed by WatchlistPanel
affects: [05-04 chat panel rendering, 05-05 chat composer and layout]

actuals:
  tokens: 7500
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Push-channel store: a reply publishes the server list and bumps seq; the owning component listens to seq and last write wins"
    - "One request per send, no automatic retry (a lost response may hide an executed trade)"

key-files:
  created:
    - frontend/src/lib/chatStore.ts
    - frontend/src/lib/chatStore.test.ts
    - frontend/src/lib/watchlistStore.ts
    - frontend/src/lib/watchlistStore.test.ts
    - frontend/src/lib/chatActions.ts
    - frontend/src/lib/chatActions.test.ts
  modified:
    - frontend/src/lib/types.ts
    - frontend/src/lib/api.ts
    - frontend/src/lib/api.test.ts
    - frontend/src/components/WatchlistPanel.tsx
    - frontend/src/components/WatchlistPanel.test.tsx

key-decisions:
  - "A chat reply refreshes the rest of the terminal through exactly two calls: usePortfolioStore.applyTrade(reply.portfolio) (existing ticket guard) and useWatchlistStore.publish(reply.watchlist)"
  - "focusSeq is an added chatStore field so toggle-opening can move focus without the default-open effect stealing it at page load"
  - "chatStore never reads price-stream status, so chat works while the stream is disconnected"

patterns-established:
  - "Failure replies from the LLM (200 with empty actions) take the same path as any assistant message; the UI never matches error text"
  - "Request failures live in localError {text, network} with the server text or the fixed NETWORK_ERROR verbatim"

requirements-completed: [PUI-05, PUI-06]

coverage:
  - id: D1
    description: "A chat reply updates the portfolio store and the rendered WatchlistPanel rows without reload"
    requirement: PUI-06
    verification:
      - kind: unit
        ref: "frontend/src/components/WatchlistPanel.test.tsx#a chat reply that adds PYPL shows the PYPL row and applies the portfolio"
        status: pass
    human_judgment: false
  - id: D2
    description: "chatStore send lifecycle: single pending reply, optimistic message, local error, no retry, history load, focus counter"
    requirement: PUI-05
    verification:
      - kind: unit
        ref: "frontend/src/lib/chatStore.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "actionText produces the UI-SPEC action sentences, errors verbatim"
    requirement: PUI-05
    verification:
      - kind: unit
        ref: "frontend/src/lib/chatActions.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "postChat and getChatHistory helpers, WatchlistPanel push edge cases (loading, error, empty, selection, last write wins)"
    requirement: PUI-06
    verification:
      - kind: unit
        ref: "frontend/src/lib/api.test.ts; frontend/src/components/WatchlistPanel.test.tsx"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-10-09
status: complete
commits: 3
plan_head_before: ae0849380eefaa98719a25ddc20be7c16f156b14
plan_head_after: 34e7135d31eb9df4998fb937acb4c6463d7b0475
---

# Phase 5 Plan 03: Chat data layer and push channels Summary

**Zustand chatStore with single-pending send, optimistic message and no-retry semantics, plus a watchlistStore push channel so one chat reply refreshes the portfolio store and the WatchlistPanel rows.**

## Performance

- **Duration:** 8 min
- **Tasks:** 2 (tracer + TDD)
- **Files:** 11 (6 created, 5 modified)
- **Commits:** 3 (de75b05 tracer, 5b17fa1 RED tests, 34e7135 GREEN actionText)

## Accomplishments

- Tracer: `useChatStore.send` -> `postChat` -> `applyTrade` + `publish` -> a rendered `WatchlistPanel` shows the new PYPL row, proven in a component test.
- `chatStore` owns messages, history status, `sending`, `localError`, `open` and `focusSeq`; exactly one `postChat` call per send, a second send while pending returns false with no request.
- `watchlistStore` (`pushed`, `seq`, `publish`) and a `seq` effect in `WatchlistPanel`; a push replaces loading, error and ready views and the existing selection sync re-runs; a manual mutation response that settles later wins.
- `actionText` builds the UI-SPEC sentences from `fmtQty`/`fmtMoney`; null price prints `--`, failed trades print the requested quantity and the server error verbatim.
- `postChat` / `getChatHistory` in `api.ts`; history failure never echoes the response body.

## Task Commits

1. Task 1 (tracer): `de75b05` feat(05-03): chat reply refreshes portfolio store and watchlist rows
2. Task 2 RED: `5b17fa1` test(05-03): pin chat store rules, action sentences, api helpers and panel push
3. Task 2 GREEN: `34e7135` feat(05-03): add actionText sentence builder for chat action lines

## Verification

- `npm --prefix frontend test`: 23 files, 299 tests passed.
- `npm --prefix frontend run build`: static export and type-check succeeded.
- Tracer gate re-run (WatchlistPanel tests + build) passed before expansion.
- Acceptance greps all pass. `chatActions.test.ts` uses `it.each` tables (13 cases in 4 blocks); counted per row against the "10 or more" criterion. `chatStore.test.ts` has 17 `it(` calls.
- `git status --porcelain frontend` lists only files from `files_modified`.

## Deviations from Plan

None - plan executed exactly as written. Note: in the TDD task the chatStore, watchlistStore, api and panel tests passed immediately against the Task 1 implementation (those units were built in the tracer); only the `chatActions` suite was a true RED (missing module), as the plan's task split implies.

## Known Stubs

None.

## Threat Flags

None. T-05-11 (no retry, single pending send), T-05-12 (existing `applyTrade` ticket guard) and T-05-13 (verbatim server error or fixed network text, history never echoes the body) are mitigated and covered by tests.

## Issues Encountered

- A stray interactive `python -` in one shell command hung until timeout; the files for that step were re-created afterwards. No code impact.

## Next Phase Readiness

Plans 05-04 and 05-05 can render the whole chat from `useChatStore` and `actionText` with no further data work.

## Self-Check: PASSED

All created files exist on disk and commits de75b05, 5b17fa1 and 34e7135 are ancestors of HEAD.
