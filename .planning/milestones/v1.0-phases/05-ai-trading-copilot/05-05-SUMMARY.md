---
phase: 05-ai-trading-copilot
plan: 05
subsystem: ui
tags: [react, vitest, chat, tailwind, integration]

requires:
  - phase: 05-ai-trading-copilot
    provides: POST /api/chat, GET /api/chat/history, mock keyword rules (05-02); useChatStore (05-03); ChatPanel, ChatToggle (05-04)
provides:
  - Live mock-mode proof: built page + uvicorn answering buy, sell, add, broke and malformed turns with 10 stored messages
  - ChatPanel transcript states (history loading, history error with Retry, empty block with three example prompts)
  - Composer limits (empty, pending, 2000 UTF-16 units, IME), 8 second slow-reply text, local request-failure row
  - Focus rules (open, Close, Escape only as overlay)
  - README status for Phases 3 to 5, OPENROUTER_API_KEY row, live smoke command
affects: [06 Docker, compose, scripts and Playwright E2E for chat; end-of-phase verification]

actuals:
  tokens: 7000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Transcript rendered by history state: loading skeleton, error block, empty block, then rows, loading row and local error row"
    - "Retry disabled while sending so a pending turn is never replaced"
    - "Focus return via the chat-toggle test id so ChatPanel stays decoupled from ChatToggle"

key-files:
  created:
    - frontend/src/components/ChatPanel.states.test.tsx
    - frontend/src/components/ChatPanel.composer.test.tsx
  modified:
    - README.md
    - frontend/src/components/ChatPanel.tsx

key-decisions:
  - "Slow-reply and Escape timing constants (SLOW_AFTER_MS = 8000, MAX_DRAFT = 2000) live as named constants in ChatPanel.tsx; the 2000 limit is draft.length in UTF-16 units, never more permissive than the server"
  - "Fake timers are switched on only after the panel is ready, because Testing Library waitFor hangs under Vitest fake timers"

requirements-completed: [PUI-05, PUI-06, CHAT-03]

coverage:
  - id: D1
    description: "Built page served by a live LLM_MOCK uvicorn answers buy, sell, add, broke and malformed turns through the real parse and execute path; history holds all 10 messages"
    requirement: CHAT-03
    verification:
      - kind: e2e
        ref: "Task 1 and Task 3 curl live check on port 8770 (both rc=0)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Transcript states: history loading skeleton, error block with Retry (disabled while pending, replaces local rows on success), empty block with three example prompts that fill but never send, zero/one/100 messages, reply kept while panel closed and re-pinned on open"
    requirement: PUI-05
    verification:
      - kind: unit
        ref: "frontend/src/components/ChatPanel.states.test.tsx (11 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Composer: empty/whitespace/newline blocked, pending blocks second send but stays editable, 2000 unit limit (2000 and 1000 emoji pass, 2001 and 1001 emoji blocked), IME Enter ignored, textarea attributes"
    requirement: PUI-05
    verification:
      - kind: unit
        ref: "frontend/src/components/ChatPanel.composer.test.tsx#composer empty and pending, composer length"
        status: pass
    human_judgment: false
  - id: D4
    description: "Slow-reply text after 8000 ms, local chat-error row (400 verbatim, network sub-line), draft restored only into an empty textarea, no resend control, error gone after reload, LLM-failure reply an ordinary assistant message, chat usable while price stream is disconnected"
    requirement: PUI-05
    verification:
      - kind: unit
        ref: "frontend/src/components/ChatPanel.composer.test.tsx#slow reply, request failure, price-stream status"
        status: pass
    human_judgment: false
  - id: D5
    description: "Focus: open focuses textarea or title, default open takes no focus, Close and Escape return focus to the toggle, Escape ignored when docked"
    requirement: PUI-05
    verification:
      - kind: unit
        ref: "frontend/src/components/ChatPanel.composer.test.tsx#focus and Escape"
        status: pass
    human_judgment: false
  - id: D6
    description: "Phase gate: full backend suite, full frontend suite, export build and browser smoke pass on the finished code"
    requirement: PUI-06
    verification:
      - kind: command
        ref: "pytest 323 passed no warnings summary; vitest 344 passed; next build ok; npm --prefix test run smoke 17 passed"
        status: pass
    human_judgment: false
  - id: D7
    description: "Real-model behavior (grounding, hypothetical handling, size conversion, wording), live_smoke.py against OpenRouter/Cerebras, and the visual browser walkthrough at 1920px with reload restore"
    requirement: CHAT-03
    verification: []
    human_judgment: true
    rationale: "Needs the real OPENROUTER_API_KEY and a person watching docked layout, animation, scroll pinning and cross-panel refresh; the three plan human-checks were not run by the executor"

duration: 8min
completed: 2026-10-09
status: complete
commits: 3
plan_head_before: e5ec67e68b1f7a13ee192a599b22e6df578f727d
plan_head_after: d83c0af104146abb7e99b2ea23065603b0c47a53
---

# Phase 5 Plan 05: Live integration proof and finished chat panel Summary

**Built page plus live mock-mode uvicorn proven end to end (five chat turns, 10 stored messages), then ChatPanel finished with history loading/error/empty states, 2000-unit composer limit, 8 second slow-reply text, local request-failure row and focus/Escape rules.**

## Performance

- **Duration:** about 8 min (18:46Z to 18:54Z local clock)
- **Tasks:** 3 (tracer + 2 auto TDD)
- **Files:** 4 (2 created, 2 modified)
- **Commits:** 3 (b87c091 README and live check, 0c6c124 transcript states, d83c0af composer and focus)

## Accomplishments

- Tracer: `npm run build` then a throwaway-database uvicorn on port 8770 with `LLM_MOCK=true` and `STATIC_DIR=frontend/out` served the page containing `chat-toggle` and `chat-panel`; buy, sell, add pypl, broke and malformed turns returned the expected actions and texts and history held exactly 10 messages. The throwaway database was removed and the server stopped.
- README: Phase 3 to 5 status lines, narrowed "Not built yet", `OPENROUTER_API_KEY` marked not needed with `LLM_MOCK=true`, and the manual `live_smoke.py` command.
- Transcript states: skeleton (`chat-history-loading`, three blocks, aria-busy), error block with `chat-retry` (disabled while a reply is pending), empty block with three `chat-example` buttons that only fill and focus the textarea; message rows and the Thinking row are hidden while history loads.
- Composer: `MAX_DRAFT = 2000` on `draft.length`, too-long hint in `text-down`, Send and Enter blocked; slow text after 8000 ms; `chat-error` row with the network-only sub-line and no resend control; draft restored only into an empty textarea.
- Focus: open moves focus to the textarea (title when disabled), Close and Escape return focus to the `chat-toggle`, Escape acts only below 1536px.

## Task Commits

1. Task 1 (tracer): `b87c091` docs(05-05): README status, live check command
2. Task 2: `0c6c124` feat(05-05): history loading, error with Retry, empty block with examples
3. Task 3: `d83c0af` feat(05-05): composer limits, slow-reply text, request-failure row, focus and Escape rules

## Verification

- Tracer live check (port 8770): passed, 10 history messages; repeated after Task 3: passed, 4 history messages. No `db/livecheck-05b.db*` left and no server running afterwards.
- `uv run --directory backend python -m pytest -q`: 323 passed, no warnings summary.
- `npm --prefix frontend test`: 344 passed (3 ChatPanel files, 42 tests).
- `npm --prefix frontend run build`: static export and type-check succeeded.
- `npm --prefix test run smoke`: 17 of 17 browser tests passed with the finished panel.
- Acceptance greps for Tasks 1 to 3 all pass (each marker string appears exactly once; states test file has 11 `it(`, composer test file 20).
- Human-checks NOT performed (queued for end-of-phase verification): `live_smoke.py` with the real key, the LLM_MOCK browser walkthrough at 1920x1080 with reload restore, and the real-model conversation (portfolio analysis, hypothetical, 5 NVDA buy, sell half). Layout check from 05-04 (1920/1536/1280/1024/768) also remains open.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None. T-05-16 mitigated (2000-unit gate on Send and Enter, one pending reply, tests pin the boundary). T-05-17 mitigated (the error row renders only the server `{error}` string or `NETWORK_ERROR`; a test checks the 400 text verbatim). T-05-18 mitigated (no resend control or automatic retry; draft restored for deliberate editing; network sub-line warns the message may have been processed).

## Issues Encountered

- Testing Library `waitFor` does not advance under Vitest fake timers, so the slow-reply test waits for the panel with real timers and enables fake timers just before sending.

## Next Phase Readiness

Phase 5 plans are complete. Remaining before the phase can be called verified: the human-checks above. Phase 6 owns the Docker image run (litellm dependency tree untested in the image), compose, start/stop scripts and the Playwright chat scenarios.

## Self-Check: PASSED

Created files exist (ChatPanel.states.test.tsx, ChatPanel.composer.test.tsx) and commits b87c091, 0c6c124, d83c0af are ancestors of HEAD.
