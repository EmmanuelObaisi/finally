---
phase: 05-ai-trading-copilot
reviewed: 2026-10-09T00:00:00Z
depth: standard
files_reviewed: 40
files_reviewed_list:
  - backend/app/chat.py
  - backend/app/chat_store.py
  - backend/app/llm/__init__.py
  - backend/app/llm/client.py
  - backend/app/llm/mock.py
  - backend/app/llm/prompt.py
  - backend/app/llm/schema.py
  - backend/app/main.py
  - backend/pyproject.toml
  - backend/tests/live_smoke.py
  - backend/tests/test_chat.py
  - backend/tests/test_chat_store.py
  - backend/tests/test_llm_client.py
  - backend/tests/test_llm_mock.py
  - backend/tests/test_llm_prompt.py
  - backend/tests/test_llm_schema.py
  - frontend/src/app/page.tsx
  - frontend/src/components/ChatActionLine.tsx
  - frontend/src/components/ChatMessageRow.tsx
  - frontend/src/components/ChatPanel.composer.test.tsx
  - frontend/src/components/ChatPanel.states.test.tsx
  - frontend/src/components/ChatPanel.test.tsx
  - frontend/src/components/ChatPanel.tsx
  - frontend/src/components/ChatToggle.tsx
  - frontend/src/components/Header.test.tsx
  - frontend/src/components/Header.tsx
  - frontend/src/components/WatchlistPanel.test.tsx
  - frontend/src/components/WatchlistPanel.tsx
  - frontend/src/lib/api.test.ts
  - frontend/src/lib/api.ts
  - frontend/src/lib/chatActions.test.ts
  - frontend/src/lib/chatActions.ts
  - frontend/src/lib/chatStore.test.ts
  - frontend/src/lib/chatStore.ts
  - frontend/src/lib/types.ts
  - frontend/src/lib/watchlistStore.test.ts
  - frontend/src/lib/watchlistStore.ts
  - frontend/vitest.setup.ts
  - planning/API_CONTRACT.md
  - README.md
findings:
  critical: 1
  warning: 3
  info: 4
  total: 8
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-10-09
**Depth:** standard
**Files Reviewed:** 40
**Status:** issues_found

## Summary

The chat turn is well structured: the LLM seam is isolated, parse failures degrade to the fixed texts, actions run through the same trading services as the manual endpoints, and the frontend store has a clean single-pending-reply lifecycle. The key is redacted from logs and the LLM error text never reaches the client. The main defect is a persistence gap that I reproduced: a chat message that cannot be encoded as UTF-8 executes its trades and then returns a 500 without recording the turn. The same shape of failure (an exception after actions have committed) can also come from the market source in Massive mode. The remaining items are ordering, client/server limit mismatches and small quality points.

## Critical Issues

### CR-01: A message containing a lone surrogate executes trades, then returns 500 and stores nothing

**File:** `backend/app/chat.py:140-152` (also `backend/app/chat_store.py:16`)
**Issue:** `ChatRequest.message: str` accepts a JSON body such as `{"message": "buy \ud800"}`, because Python's `json` produces a str containing a lone surrogate. `run_turn` strips and length-checks it, calls the model, and executes the actions. `finish_turn` then fails in `save_turn` with `UnicodeEncodeError: surrogates not allowed` (sqlite3 cannot bind the string). I reproduced this through `TestClient` with `LLM_MOCK=true`. The response was `500 {"error":"Internal server error"}`, the portfolio cash dropped from 10000.0 to 9900.0 (the buy filled), and `GET /api/chat/history` returned `[]`. The user sees an error, money moved, and no chat record exists. This breaks the contract rule that actions are reported in the response and the turn is stored. With a real model the same text also goes to the provider, but the trade-then-500 path is already proven in mock mode.
**Fix:** Reject unencodable text before any side effect, in the same place as the other message checks.
```python
    if len(text) > MAX_MESSAGE_CHARS:
        raise DomainError("Message is too long")
    try:
        text.encode("utf-8")
    except UnicodeEncodeError:
        raise DomainError("Message contains invalid characters")
```
(Add a matching 400 case to `test_chat.py`.)

## Warnings

### WR-01: Any non-DomainError during an action aborts the whole turn after earlier actions committed

**File:** `backend/app/chat.py:91-109`
**Issue:** `run_trade` and `run_watchlist` catch only `DomainError`. `place_trade` and `add_to_watchlist` call `state.source.add_ticker(...)`, which in Massive mode runs `_poll()` and can raise (network error, rate limit, `BadResponse`; see `massive_client.py:76-84, 108-122`). `sqlite3.OperationalError` ("database is locked") is also possible. Such an exception propagates out of `execute`, so trades 1..n-1 stay committed, `finish_turn` never runs, and the client gets a 500 with no chat record and no action list. This contradicts "a failed action never blocks the next" and the rule that the server reports the real outcome. The manual endpoints fail atomically per request, but a chat batch does not.
**Fix:** Convert an unexpected exception into a failed action with a fixed, non-leaking error text, and log it. For example, in `execute` wrap each call:
```python
async def safe(run, state, item, fail):
    try:
        return await run(state, item)
    except Exception:
        logger.exception("chat action failed")
        return fail(item, False, "Action could not be completed")
```
and use it for both loops (`trade_action` / `watchlist_action` as `fail`).

### WR-02: Chat history order depends on request-start time, so overlapping turns interleave

**File:** `backend/app/chat_store.py:16, 25-29`; `backend/app/chat.py:147`
**Issue:** The user row is stamped with `asked_at` (taken before the model call, up to about 30 s earlier) and rows are read with `ORDER BY created_at DESC, rowid DESC`. For two overlapping turns A (starts t0, ends t2) and B (starts t1, ends t3), the rows are inserted as A_user(t0), A_asst(t2), B_user(t1), B_asst(t3) and sort as A_user, B_user, A_asst, B_asst. Both `GET /api/chat/history` and the 20-message window sent to the LLM then show two user messages followed by two assistant messages, so replies appear under the wrong question after a reload. The UI blocks overlap within one tab, but two tabs or direct API use trigger it, and `test_parallel_turns_cannot_overspend` already exercises overlapping turns without checking the stored order. The test `test_persist_times_user_row_uses_time_before_the_model_call` pins the current behavior, so this was a deliberate choice that has an ordering side effect.
**Fix:** Order by insertion (`ORDER BY rowid DESC`) and keep `created_at` as display-only, or stamp the user row at save time. `save_turn` already writes the pair adjacently in one transaction, so `rowid` alone gives the correct pairing.

### WR-03: Client length limit differs from the server rule, so valid messages are blocked

**File:** `frontend/src/components/ChatPanel.tsx:19, 37, 70, 217`
**Issue:** The server counts Unicode code points after trimming (`API_CONTRACT.md`, `chat.py:145`). The client computes `draft.length > 2000`, which counts UTF-16 code units on the untrimmed draft. A message of 1200 emoji (2400 units, 1200 code points) is accepted by the server but the Send button is disabled and the hint shows "Message is too long". A 2000-character message with trailing whitespace is likewise blocked. The error is in the safe direction (no bad request is sent), but valid input cannot be submitted.
**Fix:**
```ts
const tooLong = [...draft.trim()].length > MAX_DRAFT;
```

## Info

### IN-01: A failed send leaves the optimistic user bubble and restores the draft, so a resend shows the message twice

**File:** `frontend/src/lib/chatStore.ts:50-57, 71-75`; `frontend/src/components/ChatPanel.tsx:73-74`
**Issue:** On failure the user message stays in `messages` and `ChatPanel.submit` puts the same text back in the composer. Resending appends a second identical bubble, and a reload (`loadHistory`) drops the first because the server never stored it. For the network case the "may not have been processed" note explains it, but for a 400 the transcript shows a message the server rejected.
**Fix:** Remove the optimistic user row when the failure is a definite server rejection (non-network), or mark the row as unsent and replace it on resend.

### IN-02: `live_smoke.py` duplicates the `acompletion` call instead of using `complete()`

**File:** `backend/tests/live_smoke.py:23-33`
**Issue:** The script re-types the argument list from `app/llm/client.py:26-30`. If `complete()` changes (new provider option, token limit), the smoke check keeps passing against a call shape production no longer uses. It also needs the raw response for `finish_reason` and `id`, which is why it cannot call `complete()` today.
**Fix:** Move the argument dict into a shared `call_kwargs(settings, messages)` helper in `client.py` and use it in both places.

### IN-03: Needless function-local import of `ChatReply` in the real branch

**File:** `backend/app/llm/client.py:24`
**Issue:** `from .schema import ChatReply` is inside `complete()`, but `schema.py` imports only pydantic and cannot create a cycle or load litellm. The local import adds noise next to the one that is deliberate (`litellm`, `mock`).
**Fix:** Import `ChatReply` at module level.

### IN-04: Every chat reply replaces the portfolio object and so refetches portfolio history

**File:** `frontend/src/lib/chatStore.ts:60`; `frontend/src/components/PnlChartPanel.tsx:28`
**Issue:** `applyTrade(reply.portfolio)` always installs a new object, and the P&L panel reloads history whenever `portfolio` changes. A chat message with no actions (`actions: []`) triggers a history GET that cannot return new data (no snapshot is written without a trade).
**Fix:** Call `applyTrade` only when `reply.actions.some((a) => a.type === "trade" && a.ok)`, and still publish the watchlist.

---

_Reviewed: 2026-10-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
