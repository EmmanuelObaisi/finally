---
phase: 05-ai-trading-copilot
verified: 2026-10-09T19:10:00Z
status: gaps_found
score: 4/6 must-haves verified
covered_files:
  - ".planning/phases/05-ai-trading-copilot/05-01-PLAN.md"
  - ".planning/phases/05-ai-trading-copilot/05-01-SUMMARY.md"
  - ".planning/phases/05-ai-trading-copilot/05-02-PLAN.md"
  - ".planning/phases/05-ai-trading-copilot/05-02-SUMMARY.md"
  - ".planning/phases/05-ai-trading-copilot/05-03-PLAN.md"
  - ".planning/phases/05-ai-trading-copilot/05-03-SUMMARY.md"
  - ".planning/phases/05-ai-trading-copilot/05-04-PLAN.md"
  - ".planning/phases/05-ai-trading-copilot/05-04-SUMMARY.md"
  - ".planning/phases/05-ai-trading-copilot/05-05-PLAN.md"
  - ".planning/phases/05-ai-trading-copilot/05-05-SUMMARY.md"
  - "backend/app/chat.py"
  - "backend/app/chat_store.py"
  - "backend/app/llm/client.py"
  - "backend/app/llm/mock.py"
  - "backend/app/llm/prompt.py"
  - "backend/app/llm/schema.py"
  - "frontend/src/components/ChatPanel.tsx"
  - "frontend/src/lib/chatStore.ts"
  - "frontend/src/lib/watchlistStore.ts"
covered_digest: "v3:sha256:98a9f583a07b1d7ca822aef742fcdde66ea5cb03ab748c85d9e86c15d7fa197d"
behavior_unverified: 1
overrides_applied: 0
gaps:
  - truth: "Every action the chat executes is reported in the response and persisted with the turn (CHAT-04 + CHAT-05 consistency)"
    status: failed
    reason: "A turn can execute trades and then fail before the response and the chat rows exist. Reproduced (CR-01): POST /api/chat with LLM_MOCK=true and body {\"message\": \"buy \\ud800\"} filled the buy (cash 9810.0 -> 9620.0), returned 500 {\"error\":\"Internal server error\"}, and GET /api/chat/history stayed at 8 rows (no new pair). Cause: run_turn validates only emptiness and length, execute() commits the trade, then finish_turn -> save_turn raises UnicodeEncodeError when sqlite3 binds the lone-surrogate string. Related (WR-01, from code, not reproduced): run_trade/run_watchlist catch only DomainError, so an unexpected exception from the market source in Massive mode (state.source.add_ticker -> _poll) or a locked database aborts the batch after earlier actions committed, with a 500 and no record."
    artifacts:
      - path: "backend/app/chat.py"
        issue: "run_turn (lines ~140-152) has no encodability check before side effects; run_trade/run_watchlist (lines ~91-109) catch only DomainError"
      - path: "backend/app/chat_store.py"
        issue: "save_turn is the first place a non-UTF-8 string fails, after actions have run"
    missing:
      - "Reject text that cannot be encoded as UTF-8 with a 400 DomainError before any model call or action (text.encode('utf-8') in run_turn), plus a test_chat.py case asserting 400, unchanged cash and empty history"
      - "Turn an unexpected exception inside a single action into a failed action with a fixed non-leaking error text (and log it) so the batch continues and the turn is still stored and reported"
behavior_unverified_items:
  - truth: "Asking about the portfolio returns a concise answer from the real model (LiteLLM -> OpenRouter -> Cerebras gpt-oss-120b) grounded in current cash, positions with P&L, watchlist prices and total value, and aware of the last 20 messages"
    test: "Run `uv run --directory backend python tests/live_smoke.py` with a real OPENROUTER_API_KEY, then ask the real model about the portfolio, a hypothetical, 'buy 5 NVDA' and 'sell half my AAPL' through the UI"
    expected: "Smoke check passes against the pinned Cerebras route; analysis answers cite real cash/positions/weights; hypotheticals produce empty trades; buy/sell produce correct share quantities"
    why_human: "Needs a real API key and a live model; the verifier must not call the real LLM. Code checks prove only that the call shape (model, provider pin, response_format, timeout) and the prompt context are correct, not what the model does with them"
human_verification:
  - test: "Real-key live smoke: `uv run --directory backend python tests/live_smoke.py`"
    expected: "Reply parses as ChatReply and OpenRouter generation record shows the Cerebras provider"
    why_human: "Real network call and real API key (CHAT-03 live path)"
  - test: "Real-model conversation: portfolio analysis, a hypothetical ('what if I bought 5 NVDA'), 'buy 5 NVDA', 'sell half my AAPL'"
    expected: "Grounded concise answers; hypothetical executes nothing; explicit requests execute with sensible quantities; follow-up questions reflect earlier turns"
    why_human: "Model quality and grounding cannot be judged from code (roadmap success criterion 2)"
  - test: "LLM_MOCK browser walkthrough at 1920x1080: send 'buy some', 'sell some', 'add PYPL', 'remove PYPL', then reload"
    expected: "Loading row then reply, Done/Failed action lines inline, header cash/total, positions, heatmap and watchlist update without reload; after reload the conversation and action lines are restored; transcript auto-scrolls"
    why_human: "Visual and real-browser behavior (unit tests use jsdom; chart canvas and layout are not exercised)"
  - test: "Layout check at 1920, 1536, 1280, 1024 and 768 px"
    expected: "Chat docks as a third column at >= 1536 px and is an overlay drawer below; header fits at 768 px; Escape closes the drawer only when overlaid"
    why_human: "Responsive layout is visual"
---

# Phase 5: AI Trading Copilot Verification Report

**Phase Goal:** A user can chat with FinAlly, which understands their portfolio and executes trades and watchlist changes on their behalf
**Verified:** 2026-10-09T19:10:00Z
**Status:** gaps_found
**Re-verification:** No, initial verification

## Goal Achievement

The core capability exists and works end to end in mock mode: the chat panel sends, the backend builds a portfolio-grounded prompt, calls the single LLM seam, parses structured output, executes trades and watchlist changes through the same services as the manual endpoints, persists the pair, and returns fresh portfolio and watchlist state that the UI applies. One reproduced defect (CR-01) breaks the "what executed is what is reported and stored" guarantee, so the phase is not clean. It is a narrow, cheap fix. The real-model behavior (criterion 2) is not provable here and is routed to humans.

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | SC1: User types in the collapsible chat panel and presses Enter; a loading indicator shows until the complete reply arrives; conversation auto-scrolls | VERIFIED | `ChatPanel.tsx`: Enter-to-send composer, `sending` drives a Thinking row, scroll effect sets `scrollTop = scrollHeight` on messages/sending/open; panel is mounted in `page.tsx` and toggled by `ChatToggle` in `Header.tsx`. Frontend suite: 344 passed incl. ChatPanel tests (Enter sends, loading row, reply). Visual check queued for human |
| 2 | SC2: Portfolio question answered by the real model, grounded in cash, positions with P&L, watchlist prices, total value, and the last 20 messages | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `client.py` awaits `litellm.acompletion` with `openrouter/openai/gpt-oss-120b`, `response_format=ChatReply`, `reasoning_effort="low"`, provider pinned to cerebras with `allow_fallbacks: False`, timeout 30, `num_retries=0`; `prompt.py` `build_context` injects cash, weights, P&L, watchlist prices and `HISTORY_LIMIT = 20` history with outcome lines; `read_context` loads `load_recent(conn, HISTORY_LIMIT)`. litellm pinned `==1.104.0` in `pyproject.toml` and `uv.lock`, RECORD has 0 `.pth` entries. No real call was made (not permitted); model grounding is unproven |
| 3 | SC3: Buy, sell, watchlist add/remove execute through the same validation as manual actions; each outcome appears inline; header, positions, heatmap, watchlist refresh from the response | VERIFIED | `chat.py` `run_trade`/`run_watchlist` call `place_trade`, `add_to_watchlist`, `remove_from_watchlist` (the manual services), DomainError becomes a failed action. Repro run (mock, TestClient): buy filled `[(True,'AAPL',1.0)]` cash 9810.0; "broke" returned `ok: False, error: 'Insufficient cash'`. `chatStore.send` calls `usePortfolioStore.applyTrade(reply.portfolio)` and `useWatchlistStore.publish(reply.watchlist)`; Header/Positions/Heatmap read `usePortfolioStore`; `WatchlistPanel` listens to `seq`. `ChatActionLine` renders Done/Failed from `action.ok` |
| 4 | SC4: Reload restores the conversation including action lines; an LLM failure (timeout, malformed, missing key) shows a graceful assistant error and executes nothing | VERIFIED | `GET /api/chat/history` via `load_recent` parses stored actions JSON; `ChatPanel` mount effect calls `loadHistory()`. Repro: "malformed" returned 200 with the fixed GENERIC_ERROR text and `actions []`; `NOT_CONFIGURED` raised before any litellm call; `test_chat.py -k llm_failure` passes. Ordering caveat WR-02 (overlapping turns interleave in history) is non-default and noted below |
| 5 | SC5: With LLM_MOCK=true keyword messages return deterministic responses with no network calls; LLM unit tests (parsing, malformed, trade validation in chat flow) pass | VERIFIED | `mock.py` keyword precedence malformed, broke, add/remove, buy, sell, plain; `complete()` imports `mock` only, litellm never imported in mock branch (tested with litellm blocked). Backend suite re-run: 323 passed. Repro confirmed analyze/buy/broke/malformed outputs |
| 6 | Derived (CHAT-04 + CHAT-05): every executed action is reported in the response and persisted with the turn | ✗ FAILED | CR-01 reproduced: `{"message": "buy \ud800"}` in mock mode filled the trade, returned 500, stored no rows (history stayed 8). WR-01: only DomainError is caught per action (code-evidenced, Massive mode) |

**Score:** 4/6 truths verified (1 present, behavior-unverified; 1 failed)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `backend/app/llm/{schema,client,mock,prompt}.py` | LLM seam, mock, prompt | VERIFIED | Substantive, wired from `chat.py` |
| `backend/app/chat.py`, `chat_store.py` | Chat turn and persistence | VERIFIED with defect | Wired in `main.py` (`include_router(chat.router)`); CR-01/WR-01 gap |
| `frontend/src/lib/{chatStore,watchlistStore,chatActions}.ts`, `api.ts`, `types.ts` | Browser data layer | VERIFIED | Consumed by ChatPanel and WatchlistPanel |
| `frontend/src/components/Chat{Panel,MessageRow,ActionLine,Toggle}.tsx` | Chat UI | VERIFIED | Rendered from `page.tsx` and `Header.tsx` |
| `backend/tests/test_chat*.py`, `test_llm_*.py`, `live_smoke.py` | Tests and live check | VERIFIED | Suite green; live smoke exists but not run |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `ChatPanel` | `POST /api/chat` | `chatStore.send` -> `postChat` | WIRED | Single request per send, no retry |
| `chat.run_turn` | `complete()` | `get_reply` | WIRED | Only mock/real divergence point |
| `chat.execute` | trading/watchlist services | `place_trade`, `add_to_watchlist`, `remove_from_watchlist` | WIRED | Same validation as manual endpoints |
| chat reply | header/positions/heatmap | `applyTrade(reply.portfolio)` | WIRED | Existing ticket guard |
| chat reply | WatchlistPanel | `publish(reply.watchlist)` / `seq` effect | WIRED | |
| `chat.router` | app | `main.py` include_router | WIRED | Included above the `/api` 404 catch-all |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `ChatPanel` messages | `messages` | `getChatHistory` -> `load_recent` (SQLite `chat_messages`) | Yes (repro: 8 stored rows) | FLOWING |
| LLM prompt context | portfolio/watchlist | `build_portfolio`, `build_watchlist` from DB + price cache | Yes | FLOWING |
| Action lines | `action.ok/error/price` | service results only (never model prose) | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Backend suite | `uv run --directory backend python -m pytest -q` | 323 passed | PASS |
| Frontend suite | `npx vitest run` (frontend/) | 344 passed | PASS |
| Mock chat turns | scratch TestClient script (analyze, buy, broke, malformed) | 200s with expected actions/messages | PASS |
| Lone-surrogate message | same script, body `{"message": "buy \ud800"}` | 500, cash 9810.0 -> 9620.0, history unchanged at 8 | FAIL (CR-01) |

### Probe Execution

Step 7c: SKIPPED, no probe scripts declared by the phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| CHAT-01 | 05-02 | POST /api/chat complete JSON response | SATISFIED | Repro + `test_chat.py` |
| CHAT-02 | 05-01 | Prompt has system prompt, portfolio context, last 20 messages | SATISFIED | `prompt.py`, `HISTORY_LIMIT = 20`, `test_llm_prompt.py` |
| CHAT-03 | 05-01, 05-05 | LiteLLM -> OpenRouter -> Cerebras, async, structured output | SATISFIED (code); live path needs human | `client.py` call shape pinned by test; live smoke not run |
| CHAT-04 | 05-02 | Auto-execute through same validation, outcome returned | PARTIAL | Works normally; CR-01/WR-01 break reporting on failure paths |
| CHAT-05 | 05-02 | Messages with actions persisted | PARTIAL | Works normally; CR-01 loses the turn after actions executed |
| CHAT-06 | 05-02 | Reload via GET /api/chat/history | SATISFIED | `load_recent`, repro history 8 rows |
| CHAT-07 | 05-02 | Response includes updated portfolio state | SATISFIED | `finish_turn` returns portfolio and watchlist |
| CHAT-08 | 05-02 | LLM failures graceful, execute nothing | SATISFIED | Repro malformed; `-k llm_failure` passes |
| CHAT-09 | 05-01, 05-02 | Deterministic mock, no network | SATISFIED | `mock.py`, tests with litellm blocked |
| PUI-05 | 05-03, 05-04, 05-05 | Collapsible panel, Enter, history restore, auto-scroll, loading | SATISFIED (visual check queued) | `ChatPanel.tsx` + tests |
| PUI-06 | 05-03, 05-04 | Inline actions/failures, views refresh from response | SATISFIED | `ChatActionLine`, `applyTrade`, `publish` |
| TEST-03 | 05-01, 05-02 | Backend pytest for LLM parsing, malformed, trade validation in chat flow | SATISFIED | `test_llm_schema.py`, `test_chat.py`, 323 passing; no test for the lone-surrogate request (the CR-01 hole) |

All 12 requirement IDs in the phase are claimed by plans and mapped to Phase 5 in REQUIREMENTS.md. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `backend/app/chat.py` | ~140-152 | Side effects before input is proven storable | BLOCKER | CR-01 (reproduced) |
| `backend/app/chat.py` | ~91-109 | Narrow except; batch aborts after commits | WARNING | WR-01 (Massive mode / DB lock) |
| `backend/app/chat_store.py` | 16, 25-29 | Order by request-start time | WARNING | WR-02: overlapping turns (two tabs) interleave in history and in the 20-message prompt window |
| `frontend/src/components/ChatPanel.tsx` | 19, 37 | `draft.length` vs server code-point rule | WARNING | WR-03: some valid messages blocked client-side (safe direction) |

No TBD/FIXME/XXX/TODO markers in the phase's source files. Info items IN-01..IN-04 (optimistic bubble on failed send, smoke script duplicating the call shape, local import, extra history refetch) are cosmetic.

### Human Verification Required

See frontmatter `human_verification`: real-key live smoke, real-model conversation, LLM_MOCK browser walkthrough with reload restore at 1920x1080, and the 1920/1536/1280/1024/768 layout check. None were performed by executors; the verifier cannot run them.

### Gaps Summary

One gap, one root cause family: the chat turn is not atomic with respect to its record. Trades are committed by `execute()` before `finish_turn` stores and returns anything, so any failure in between (a lone-surrogate message today, an unexpected market-source or DB exception in Massive mode) leaves money moved with a 500 and no chat rows. CR-01 is reproduced and trivial to close (validate UTF-8 encodability up front, add a 400 test); WR-01 should be closed in the same plan by converting per-action unexpected exceptions into failed actions. WR-02 and WR-03 are worth fixing in the same pass (ORDER BY rowid; code-point length on the client) but do not block the goal on their own. After the fix, the phase should re-verify to `human_needed` pending the live and visual checks above.

---

_Verified: 2026-10-09T19:10:00Z_
_Verifier: Claude (gsd-verifier)_
