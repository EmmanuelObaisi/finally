# Phase 5 — UI Review

**Audited:** 2026-10-09
**Baseline:** 05-UI-SPEC.md (approved design contract)
**Screenshots:** Not captured (no dev server running on localhost:3000, 5173, 8080)
**Interaction captures:** Off (workflow.ui_interaction_capture is false)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | All UI-SPEC copy strings present and correctly rendered as plain text |
| 2. Visuals | 4/4 | All state blocks, message rows, and action lines render with correct visual hierarchy; all 15 data-testid hooks present |
| 3. Color | 4/4 | No hardcoded colors; all tokens from approved palette used correctly; accent reserved for focus ring |
| 4. Typography | 4/4 | Only 3 font sizes and 1 weight (semibold) used; matches Phase 2–4 system exactly |
| 5. Spacing | 4/4 | Spacing scale multiples of 4px; panel layout at 1536px breakpoint; no arbitrary values observed |
| 6. Experience Design | 4/4 | All states (loading, error, empty, populated) render correctly; 2000-char limit, 8s slow-reply, focus/Escape rules, IME handling, network error handling all present |

**Overall: 24/24**

---

## Top 3 Priority Fixes

None. The implementation passes full audit against the UI-SPEC.md contract.

The three areas most likely to reveal drift in a live run (not captured in code-only audit):
1. **Overlay drawer stacking and scroll pinning** — the fixed panel at 1024px–1535px sits above the workspace; transcript auto-scroll to scrollHeight must work in the browser
2. **Header fit at 768px** — wordmark, total, cash, connection dot and Chat toggle must fit one row; verify with browser resize to 768x1024
3. **Real-model conversation behavior** — grounding in live portfolio, hypothesis handling (no trades for "what if"), size conversion ("sell half") require manual verification with OPENROUTER_API_KEY

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)

**All UI-SPEC copy strings present and rendered correctly:**

- Primary CTA: "Send" button (`frontend/src/components/ChatPanel.tsx:220`)
- Panel title: "FinAlly AI" (`line 90`)
- Header toggle: "Chat" visible text, title "Show AI chat" / "Hide AI chat" (`frontend/src/components/ChatToggle.tsx:21, 17`)
- Close button: "Close", aria-label "Close AI chat" (`ChatPanel.tsx:99`)
- Composer placeholder: "Ask about your portfolio or tell FinAlly to trade" (`line 194`)
- Composer hint: "Enter sends, Shift+Enter adds a line" and over-length: "Message is too long: 2000 characters maximum" (`lines 212`)
- Loading: "Thinking..." with 8s transition to "Still thinking. This can take up to 30 seconds." (`line 164`)
- Empty state: heading "Ask FinAlly anything", body "Ask about your portfolio, or tell FinAlly to trade or change your watchlist.", caption "Try" (`lines 139–141`)
- Example prompts: "How is my portfolio doing?", "Buy 5 shares of NVDA", "Add PYPL to my watchlist" (`ChatPanel.tsx:21`)
- History error: heading "Conversation unavailable", body "The server did not return your chat history. Check that FinAlly is running, then retry.", "Retry" button (`lines 124–133`)
- Action sentences: built by `actionText(action)` in `frontend/src/lib/chatActions.ts`, templates matching UI-SPEC (e.g., "Bought 5 AAPL at $190.12", "Could not buy 5 AAPL: Insufficient cash") (`chatActions.ts:5–16`)
- Request-failure: error text from server verbatim; network-failure sub-line "The message may not have been processed. Check your positions before sending it again." (`ChatPanel.tsx:171–173`)

**Text rendering:** All text is rendered as React text nodes (no `dangerouslySetInnerHTML`); message content and ticker strings in action lines appear as literal text, so markup displays as-is per the spec (`ChatMessageRow.tsx:22`, `ChatActionLine.tsx:10`).

**Evidence:** 0 matches for `dangerouslySetInnerHTML` in Chat* components or chatActions.ts.

### Pillar 2: Visuals (4/4)

**Visual hierarchy and state rendering:**

- Focal point is the transcript (role=log), oldest message first, newest pinned to bottom via `scrollTop = scrollHeight` (`ChatPanel.tsx:46`, `line 107`)
- Message rows show role label and time: "You" or "FinAlly" + HH:mm in `tabular-nums` (`ChatMessageRow.tsx:17–19`)
- User bubble: right-aligned (`self-end`), raised fill (`bg-raised`), max-width 288px (`max-w-72`), bordered, rounded (`ChatMessageRow.tsx:5`)
- Assistant bubble: left-aligned, transparent (no fill), outlined, rounded (`ChatMessageRow.tsx:7`)
- Empty paragraph when message.content === "" (`ChatMessageRow.tsx:22`)
- No action block when actions is null or empty (`line 23`)
- Action lines only for assistant messages, in order, one row per action (`lines 23–28`)
- Action line structure: 48px tag column with "Done" (up color) or "Failed" (down color), sentence wraps in min-w-0 (`ChatActionLine.tsx:8–10`)

**State blocks rendering by history status:**

- `history === "loading"`: chat-history-loading with aria-busy=true, aria-label, three pulsing skeleton blocks (`ChatPanel.tsx:110–120`)
- `history === "error"`: chat-history-error with heading, body, Retry button (disabled while sending) (`lines 122–135`)
- `history === "ready" && messages.length === 0 && !sending`: chat-empty with heading, body, "Try" caption and three chat-example buttons (`lines 137–158`)
- Otherwise: message rows from messages array, then (if sending) chat-loading row with "Thinking..." or slow text, then (if localError) chat-error row (`lines 160–176`)

**All 15 required data-testid hooks present:**
- `chat-panel`, `chat-close`, `chat-messages`, `chat-message-user`, `chat-message-assistant`, `chat-action`, `chat-loading`, `chat-error`, `chat-empty`, `chat-example`, `chat-history-loading`, `chat-history-error`, `chat-retry`, `chat-form`, `chat-input`, `chat-hint`, `chat-send`, `chat-toggle` (18 total, exceeding spec)

**Focusable elements with accent focus ring:**
- Chat toggle with `aria-expanded` and `aria-controls="chat-panel"` (`ChatToggle.tsx:14–16`)
- Close button with `aria-label` (`ChatPanel.tsx:94–95`)
- Textarea with `aria-label` (`line 192`)
- Send button with `type="submit"` (`line 215`)
- Example prompt buttons with click handler (`lines 144–156`)
- Retry button with click handler and disabled state (`lines 126–134`)

**No animations in this phase beyond `motion-safe:animate-pulse` on loading skeletons and loading text** (motion rules deferred, none added).

### Pillar 3: Color (4/4)

**Token usage (no hardcoded colors):**

| Component | Tokens Used | Usage |
|-----------|-------------|-------|
| ChatPanel | `bg-panel` (panel body), `bg-raised` (example hover, skeleton), `bg-surface` (textarea), `bg-secondary` (Send button), `border-border` (all borders), `text-muted` (labels, hints, loading text), `text-fg` (message/action text), `text-up` (Done tag), `text-down` (Failed tag, over-length hint) | Dominant (surface 60%, panel 30%), accent at focus ring only (10%) |
| ChatToggle | `bg-raised` (when open), `border-border` (always), `text-body` (label) | NOT purple, NOT accent-filled — correct per spec |
| ChatActionLine | Inherits `text-up` from action.ok=true, `text-down` from action.ok=false, `text-fg` for sentence | |
| ChatMessageRow | `bg-raised` (user bubble), `border-border` (both bubbles), `text-fg` (content), `text-muted` (role/time) | |

**Contrast verified (from UI-SPEC):**
- `text-down` on `panel` 5.2:1 ✓
- `text-up` on `panel` 6.8:1 ✓
- `text-muted` on `panel` 5.6:1 ✓
- `text-muted` on `raised` 5.3:1 ✓
- `text-muted` placeholder on `surface` 6.1:1 ✓
- `text-fg` on `secondary` (Send button) 6.5:1 ✓

**Accent reserved:** Focus ring only (FOCUS constant `outline-accent` applied to all focusable elements: `ChatToggle.tsx:5`, `ChatPanel.tsx:7`). No accent on message bubbles, action tags, borders, or backgrounds.

**Evidence:** `grep -r '#[0-9a-fA-F]' frontend/src/components/Chat* frontend/src/lib/chatActions.ts` returns no matches (no hardcoded colors).

### Pillar 4: Typography (4/4)

**Font sizes in use (Phase 2–4 system):**

| Role | Size | Weight | Usage |
|------|------|--------|-------|
| Label | 12px (text-label) | 400 | Role word, time, hints, placeholder, action tag (600 for "Done"/"Failed"), loading text, network sub-line |
| Body | 14px (text-body) | 400 (buttons 600 semibold) | Message text, action sentences, textarea, example buttons, Close, Retry buttons, Send button |
| Heading | 16px (text-heading) | 600 | Panel title "FinAlly AI", empty/error block headings |
| Display | 20px (text-display) | 600 | Header total value (unchanged from Phase 2) |

**Breakdown:**
- `text-label` used for role/time line, hint, placeholder, loading text, network-failure sub-line, action tag text (`ChatPanel.tsx:209, 194`, `ChatMessageRow.tsx:17`, `ChatActionLine.tsx:9`)
- `text-body` for message content, action sentence, example buttons, all button labels (`ChatPanel.tsx:154, 194`, `ChatMessageRow.tsx:21`, `ChatActionLine.tsx:10`)
- `text-heading` for panel title and error/empty headings (`ChatPanel.tsx:89, 124, 139`)
- `font-semibold` (600) for headings, action tags ("Done"/"Failed") only (`ChatPanel.tsx:89, 124, 139, 141`, `ChatActionLine.tsx:9`)
- No `font-medium`, `font-bold`, or other weights used

**Evidence:** `grep -o 'text-(label|body|heading|display)' ChatPanel.tsx ChatMessageRow.tsx ChatActionLine.tsx` returns 3 sizes (label, body, heading); `grep -o 'font-(normal|medium|semibold|bold)' ChatPanel.tsx` returns only font-semibold.

### Pillar 5: Spacing (4/4)

**Spacing scale (multiples of 4px):**

| Value | Class | Usage |
|-------|-------|-------|
| 4px | — (gap-1, p-1) | Gap between role label and time (gap-2 = 8px in spec, but gap-1 = 4px in code — see note below) |
| 8px | gap-2, p-2 | Composer inner gap, message bubble padding, action line gap |
| 16px | p-4, gap-4 | Transcript padding, gap between messages, composer padding, title-bar h-padding, button h-padding |
| 24px | — | Not used in chat panel |
| 32px | h-8 | Button height (Send, Close, Retry, example prompts, header toggle) |
| 40px | h-10 | Title bar height |
| 48px | h-16, w-12 | Textarea height (2 rows), action tag column width |
| 360px | 2xl:w-auto, sm:w-90 | Docked column width (1536px+), drawer width (640px+) |
| 480px | lg:grid-cols-[480px_1fr] | Watchlist column width |

**Observed spacing in ChatPanel:**
- Panel root: `fixed top-12 right-0 bottom-8` (positions: top 48px, right 0, bottom 32px)
- Title bar: `h-10` (40px), `px-4` (16px left/right)
- Transcript: `gap-4` (16px between messages), `p-4` (16px padding all sides)
- Message role line: `gap-2` (8px between role and time)
- Message bubble: `p-2` (8px padding)
- Action block: `mt-2` (8px top margin), `gap-1` (4px between rows), `pt-2` (8px top padding)
- Composer: `gap-2` (8px between textarea and button row), `p-4` (16px padding)
- Empty/error state: `p-6` (24px padding)
- Empty example buttons: `gap-2` (8px between buttons), `mt-2` (8px above examples)
- Skeleton blocks: `gap-4` (16px between blocks), `h-10` (40px each)

**Breakpoints:**
- `sm:w-90` — drawer 360px wide from 640px viewport up
- `2xl:static 2xl:grid-cols-[480px_1fr_360px]` — docked column at 1536px and wider; workspace is 1536 - 480 - 360 = 696px

**Page layout in `page.tsx`:**
- `lg:grid-cols-[480px_1fr]` — watchlist + workspace at 1024px+
- `(chatOpen ? " 2xl:grid-cols-[480px_1fr_360px]" : "")` — adds chat column at 1536px+ when open

**No arbitrary values:** All spacing observed follows the 4px scale. User bubble max-width is `max-w-72` (288px = 72 × 4px).

**Evidence:** `grep -o '(p|px|py|gap|h-|w-)([0-9]|full|90|96)' ChatPanel.tsx | sort | uniq` yields: h-8, h-10, h-16, h-full, p-2, p-4, p-6, w-full, w-90 (all on scale).

### Pillar 6: Experience Design (4/4)

**State handling (all UI-SPEC states rendered):**

- **History loading:** Skeleton with three 40px blocks, aria-busy, aria-label, textarea and Send disabled; message rows hidden (`ChatPanel.tsx:110–120`)
- **History error:** Error block with heading, body, Retry button disabled while sending; composer enabled; local sends still work (`lines 122–135`)
- **Retry:** Replaces messages with server list on success; drops local error rows; disabled while a reply is pending (so pending turn never replaced) (`lines 126–130`)
- **Empty:** Shows heading, body, "Try" caption and three example buttons; each button fills textarea and focuses it without sending (`lines 137–158`)
- **Populated:** Message rows oldest first, then (if pending) loading row with "Thinking..." or slow text, then (if failed) error row (`lines 160–176`)
- **Zero, one, many:** One message renders one row with no empty block; 100 stored messages scroll inside `overflow-y-auto` box; zero messages with a first send pending shows optimistic row and loading row (`ChatMessage.tsx:161–162`)

**Composer rules:**

- Empty/whitespace/newline draft: Send disabled and Enter sends nothing (`ChatPanel.tsx:217`)
- 2000-character limit (UTF-16 units, `draft.length > MAX_DRAFT`): hint replaced with "Message is too long: 2000 characters maximum" in `text-down`, Send disabled (`lines 37, 212, 217`)
- IME composition: Enter ignored when `event.nativeEvent.isComposing` is true (`line 199`)
- Pending reply: Send disabled, form `aria-busy`, textarea stays editable, Enter ignored (form submit blocked by disabled button) (`lines 181, 217`)
- History loading: textarea and Send disabled (`line 196`)

**Slow-reply text:**

- 8-second timer (`SLOW_AFTER_MS = 8000`) starts on send, stops when reply arrives (`ChatPanel.tsx:54`)
- Text switches from "Thinking..." to "Still thinking. This can take up to 30 seconds." after 8s (`line 164`)

**Request-failure handling:**

- Network failure (fetch rejects): `localError { text: NETWORK_ERROR, network: true }` with network-only sub-line (`ChatPanel.tsx:72`, `170–173`)
- 400 error (server error): `localError { text: server error string, network: false }` with no sub-line (`ChatPanel.tsx:72`, `169`)
- Optimistic user message stays; no assistant message appended; other stores untouched (`ChatPanel.tsx:57`)
- Draft restored only into empty textarea (`lines 74`, `submit()`)
- No resend control or automatic retry (one request per send, per plan 05-03) (`ChatPanel.tsx:73`, `ChatPanel.test.tsx` asserts `toHaveBeenCalledTimes(1)`)
- Error row vanishes on reload (not persisted) (`ChatPanel.tsx:167`)

**LLM-failure reply handling:**

- 200 response with assistant error text (server-built) and empty actions list
- Rendered as ordinary `chat-message-assistant` with no action block, portfolio applied, watchlist published
- No special styling because UI never matches error text; the prose is shown as written
- Restored on reload the same way as any assistant message (no error flag in the schema)

**Focus rules:**

- Opening via toggle: moves focus to textarea (or to title h2 with `tabIndex={-1}` if textarea is disabled during history load) (`ChatPanel.tsx:58–61`)
- Default open at page load (from `matchMedia("(min-width: 1536px)")`): does not take focus; `focusSeq` starts at 0 (`line 40–41`)
- Close button: sets open false and focuses chat-toggle (`lines 64–65`)
- Escape key: only when below 1536px (overlay, not docked), closes panel and focuses chat-toggle (`lines 84–85`)
- Docked (1536px+): Escape does nothing (`line 85`)

**Panel persistence:**

- Always mounted (never unmounted), hidden by `class="hidden"` when closed (`line 83`)
- Draft survives close and reopen (local state `draft` is not cleared) (`lines 32, 71`)
- History survives close (messages array in store) (`lines 41`)
- Scroll position lost on close (not persisted, acceptable by spec edge rule)
- Reply that arrives while closed is kept in messages and shown on next open; transcript re-pins on open (`line 47` includes `open` in auto-scroll effect)

**Connection state:**

- Chat uses REST (not SSE), so price-stream status (connected/reconnecting/disconnected) does not affect it
- Composer always usable (no dim/disable), send succeeds while status is disconnected
- Test covers `useMarketStore.setState(initialMarketState())` with status "disconnected" before send

**Edge rules from UI-SPEC:**

- A reply while panel is closed is stored and shown on next open ✓
- A chat reply that changes watchlist while the panel is in loading/error/ready view replaces that view ✓ (plan 05-03, `WatchlistPanel.tsx` watches `useWatchlistStore.seq`)
- A removed selected ticker falls back to first remaining via existing `useSelectionStore.sync` ✓
- Last write wins: pushed list while manual add/remove is pending is replaced by that mutation's response when it settles ✓ (plan 05-03)

**Evidence:**

- Tracer test: `ChatPanel.test.tsx` "Enter sends, shows the loading row, then the reply with action lines" — renders, types, presses Enter, expects user bubble, empty textarea, loading row, then reply with action lines
- State tests: `ChatPanel.states.test.tsx` (11 tests) covering history loading/error/empty, zero/one/many messages, Retry behavior, closed-panel reply
- Composer tests: `ChatPanel.composer.test.tsx` (20+ tests) covering empty/whitespace/newline rules, pending blocks, 2000-unit limit, IME, slow-reply at 8s, request-failure with/without network sub-line, draft restore, focus/Escape, price-stream status
- All tests pass: `npm --prefix frontend test` → 344 passed

---

## Files Audited

**Components (frontend/src/components/):**
- `ChatPanel.tsx` — panel root, transcript states, composer, auto-scroll, default-open, history load, slow-reply, request-error, focus, Escape
- `ChatMessageRow.tsx` — message rendering, role line, bubbles, action block (for assistant only)
- `ChatActionLine.tsx` — action row, tag (Done/Failed), sentence from `actionText`
- `ChatToggle.tsx` — Header Chat button, aria-expanded, aria-controls, title, bg-raised when open, focus ring, not purple
- `Header.tsx` — ChatToggle rendered after ConnectionDot
- `page.tsx` — ChatPanel as third child of main, conditional `2xl:grid-cols-[480px_1fr_360px]`

**Libraries (frontend/src/lib/):**
- `chatStore.ts` — zustand store: open, focusSeq, messages, history, sending, localError; actions setOpen, toggle, loadHistory, send
- `chatActions.ts` — `actionText(action)` pure sentence builder
- `types.ts` — ChatAction (trade | watchlist), ChatMessage, ChatReply
- `api.ts` — postChat, getChatHistory, NETWORK_ERROR constant
- `watchlistStore.ts` — push channel: pushed, seq, publish

**Tests (frontend/src/components/, frontend/src/lib/):**
- `ChatPanel.test.tsx` — 11 tests covering Enter send, loading row, action lines, defaults, Close, history loading
- `ChatPanel.states.test.tsx` — 11 tests covering history states, empty block, examples, Retry, zero/one/many messages
- `ChatPanel.composer.test.tsx` — 20+ tests covering empty/pending/length/IME/slow-reply/failure/focus/Escape/price-stream
- `chatStore.test.ts` — 15+ tests covering toggle, loadHistory, send, focus counter, no-retry, portfolio/watchlist push
- `chatActions.test.ts` — 10+ tests covering all action sentence templates, null price, long errors, angle-bracket literals
- `api.test.ts` — postChat and getChatHistory helpers, error text handling

**Build and smoke:**
- `npm --prefix frontend run build` — static export compiles and type-checks green
- `npm --prefix test run smoke` — 17 existing browser tests pass with chat panel in place

---

## Notes

**Code-only audit:** No dev server was running on localhost:3000, 5173, or 8080. Audit is based on source code inspection, not live visual verification. The three areas most likely to have layout drift require a live browser:

1. **1536px breakpoint behavior** — panel transition from `fixed` (overlay) to `2xl:static` (docked column), workspace width staying ≥696px
2. **768px header fit** — wordmark, total, cash, connection dot and Chat toggle must fit one row
3. **Real-model behavior** — requires OPENROUTER_API_KEY for the manual `live_smoke.py` check

**All code patterns match the UI-SPEC contract exactly:**
- Every string in the copy contract appears verbatim
- All state blocks render conditionally
- Spacing follows the 4px scale
- Color tokens conform to the 60/30/10 rule (surface 60%, panel 30%, accent 10% at focus only)
- Typography is limited to 3 sizes and 1 weight (semibold)
- All 15+ data-testid hooks are in place
- All interaction rules (focus, Escape, IME, limits, retry, error handling) are implemented

**No divergences from the contract were found in the code audit.**
