---
phase: 05-ai-trading-copilot
plan: 04
subsystem: ui
tags: [react, zustand, vitest, chat, tailwind]

requires:
  - phase: 05-ai-trading-copilot
    provides: useChatStore, actionText, ChatMessage/ChatAction types, watchlist push channel (plan 05-03); POST /api/chat and GET /api/chat/history (plans 05-01, 05-02)
provides:
  - ChatPanel (always-mounted aside, role=log transcript, Enter-to-send composer, Thinking row, auto-scroll, default-open effect)
  - ChatMessageRow and ChatActionLine (role/time line, bubbles, Done/Failed action rows from the server record)
  - ChatToggle in the Header after the connection dot
  - Page placement: ChatPanel third child of main, 2xl three-column grid only while open
  - Default matchMedia stub in vitest.setup.ts
affects: [05-05 chat history states, composer limits, slow-reply text, request-failure rows and focus rules]

actuals:
  tokens: 6850
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Always-mounted panel hidden by class so draft, scroll and history survive close and reopen"
    - "Default-open decided in a mount effect from matchMedia, never in initial state (static export hydration)"
    - "Message, ticker and error strings rendered only as React text nodes; tags come from action.ok alone"

key-files:
  created:
    - frontend/src/components/ChatPanel.tsx
    - frontend/src/components/ChatMessageRow.tsx
    - frontend/src/components/ChatActionLine.tsx
    - frontend/src/components/ChatToggle.tsx
    - frontend/src/components/ChatPanel.test.tsx
  modified:
    - frontend/src/components/Header.tsx
    - frontend/src/components/Header.test.tsx
    - frontend/src/app/page.tsx
    - frontend/vitest.setup.ts

key-decisions:
  - "ChatPanel test file does not call vi.unstubAllGlobals in beforeEach: it would wipe the setup file's matchMedia stub, which the panel needs on mount"
  - "ChatToggle created during Task 1 work but committed with Task 2 so each commit holds only its task's files"

requirements-completed: [PUI-05, PUI-06]

coverage:
  - id: D1
    description: "Enter sends a typed message: optimistic user bubble, cleared textarea, Thinking row, then the assistant reply with Done/Failed action lines, scrolled transcript and updated portfolio store"
    requirement: PUI-05
    verification:
      - kind: unit
        ref: "frontend/src/components/ChatPanel.test.tsx#Enter sends, shows the loading row, then the reply with action lines"
        status: pass
    human_judgment: false
  - id: D2
    description: "Inline action lines: Done/Failed by action.ok, server error verbatim, null price as --, 20 rows in order, no block for zero actions, markup shown literally"
    requirement: PUI-06
    verification:
      - kind: unit
        ref: "frontend/src/components/ChatPanel.test.tsx#ChatPanel transcript presentation"
        status: pass
    human_judgment: false
  - id: D3
    description: "Panel open state: default-open from the 1536px query, closed-but-mounted otherwise, Close keeps the draft, history loaded once"
    requirement: PUI-05
    verification:
      - kind: unit
        ref: "frontend/src/components/ChatPanel.test.tsx#ChatPanel open state"
        status: pass
    human_judgment: false
  - id: D4
    description: "Header Chat toggle: aria-expanded, aria-controls, title, bg-raised when open, focusSeq only on open, after the connection dot, not purple or accent"
    requirement: PUI-05
    verification:
      - kind: unit
        ref: "frontend/src/components/Header.test.tsx#Header chat toggle"
        status: pass
      - kind: e2e
        ref: "npm --prefix test run smoke (17 existing browser tests pass after header and page changes)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Real layout: docked 360px third column at 1536px and wider with the workspace at least 696px, overlay drawer below, header fit at 768px"
    requirement: PUI-05
    verification: []
    human_judgment: true
    rationale: "Layout, overlay stacking and header fit cannot be asserted in jsdom; the plan's human-check (resize to 1920, 1536, 1280, 1024, 768) was not run by the executor"

duration: 5min
completed: 2026-10-09
status: complete
commits: 2
plan_head_before: cf8a2fe56aba1aa76b14d84545421436dd99922c
plan_head_after: b6497c4ceba3cc8b260419982955d7d24252ca86
---

# Phase 5 Plan 04: Chat panel, Header toggle and page placement Summary

**AI chat panel with Enter-to-send, Thinking row, bottom-pinned role=log transcript and Done/Failed inline action lines, opened from a Header Chat toggle and placed as a docked third column at 1536px and wider or a right-edge overlay drawer below.**

## Performance

- **Duration:** 5 min (17:41Z to 17:46Z)
- **Tasks:** 2 (tracer + auto)
- **Files:** 9 (5 created, 4 modified)
- **Commits:** 2 (481fead tracer, b6497c4 toggle and placement)

## Accomplishments

- Tracer: composer Enter -> `useChatStore.send` -> stubbed `POST /api/chat` -> user bubble, "Thinking..." row, assistant bubble with a Done and a Failed action line, transcript `scrollTop` 480, portfolio store updated. Proven in a component test and the static export build.
- `ChatPanel` is always mounted: default-open decided in a mount effect from `matchMedia("(min-width: 1536px)")`, history loaded once, Close hides by class so a half-typed draft survives reopening.
- `ChatActionLine` takes the tag only from `action.ok` and the sentence only from `actionText`; `ChatMessageRow` shows the model's prose as written (D-04) and omits the paragraph for empty text and the action block for null or empty actions.
- `ChatToggle` after `ConnectionDot`; `page.tsx` renders `ChatPanel` as the third child of `main` and appends `2xl:grid-cols-[480px_1fr_360px]` only while open.
- `vitest.setup.ts` gains a default `matchMedia` stub (re-applied in `beforeEach`) so jsdom stays closed-by-default.

## Task Commits

1. Task 1 (tracer): `481fead` feat(05-04): chat panel sends with Enter and shows replies with inline action lines
2. Task 2: `b6497c4` feat(05-04): header Chat toggle and page placement for the chat panel

## Verification

- Tracer gate: `npx vitest run ChatPanel` (11 tests) and `npm run build` both passed before expansion.
- `npm --prefix frontend test`: 24 files, 313 tests passed.
- `npm --prefix frontend run build`: static export and type-check succeeded.
- `npm --prefix test run smoke`: 17 of 17 existing browser tests passed with the header and page changes.
- All acceptance greps for both tasks pass (`dangerouslySetInnerHTML` absent, `scrollIntoView` absent, `bg-secondary` absent from the toggle, `<ChatToggle` after `<ConnectionDot`, `<ChatPanel` after the workspace `</section>`).
- Human-check (real layout at 1920, 1536, 1280, 1024, 768 and the 768px header fit) was NOT performed; it is the plan's backstop for the E1 long-text truth and is left for the verifier or user.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. The history-loading, history-error and empty blocks, composer limits, slow-reply text, request-failure row and focus rules are intentionally deferred to plan 05-05 per the plan; `chatStore` already holds the state they will read.

## Threat Flags

None. T-05-14 (XSS) mitigated: all text is React text nodes, a test pushes angle-bracket markup through a message and an action ticker and asserts literal output, and no raw-HTML prop exists under components. T-05-15 (repudiation) mitigated: Done/Failed come only from `action.ok`, and a test pins a failed action showing Failed with the server error verbatim.

## Issues Encountered

- My first Task 2 shell command accidentally began with a stray interactive `python -` (the same slip noted in 05-03), which blocked for the shell timeout; the process was killed and the intended edits then applied without change. No code impact.
- Early test run failed with `window.matchMedia is not a function` because the test file's own `vi.unstubAllGlobals()` in `beforeEach` removed the setup stub; the call was dropped (each test stubs its own fetch).

## Next Phase Readiness

Plan 05-05 can extend `ChatPanel` with the history state blocks, empty block, composer limits, 8-second slow text, `chat-error` row and focus/Escape rules; the test ids and store fields it needs already exist.

## Self-Check: PASSED

All created files exist on disk and commits 481fead and b6497c4 are ancestors of HEAD.
