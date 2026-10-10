---
phase: 05-ai-trading-copilot
fixed_at: 2026-10-09T22:30:00Z
review_path: .planning/phases/05-ai-trading-copilot/05-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 5: Code Review Fix Report

**Fixed at:** 2026-10-09
**Source review:** .planning/phases/05-ai-trading-copilot/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (CR-01, WR-01, WR-02, WR-03; Info findings out of scope)
- Fixed: 4
- Skipped: 0

Each fix was reproduced first with a failing test, then fixed, then committed on its own.

## Fixed Issues

### CR-01: A message containing a lone surrogate executes trades, then returns 500 and stores nothing

**Files modified:** `backend/app/chat.py`, `backend/tests/test_chat.py`, `planning/API_CONTRACT.md`
**Commit:** a79890a
**Reproduction:** `test_unencodable_text_is_400_with_no_side_effects` failed with `UnicodeEncodeError` raised from `save_turn` after the buy had filled. The test sends the raw JSON escape `\ud800`, because httpx cannot encode a lone surrogate itself.
**Applied fix:** New `check_message` in `chat.py` (empty, length, then UTF-8 encodability) runs at the top of `run_turn`, before any model call or action. Unencodable text raises `DomainError("Message contains invalid characters")`, a 400. The test asserts the 400 body, cash still 10000.0, zero trades and an empty chat history. The 400 is documented in `API_CONTRACT.md`.

### WR-01: Any non-DomainError during an action aborts the whole turn after earlier actions committed

**Files modified:** `backend/app/chat.py`, `backend/tests/test_chat.py`, `planning/API_CONTRACT.md`
**Commit:** 04a706a
**Status:** fixed: requires human verification (error-handling semantics)
**Reproduction:** Two tests make the market source's `add_ticker` raise a provider-style `RuntimeError` for one ticker. Both failed with that exception escaping the batch (trade test: MSFT filled, PYPL raised; watchlist test the same).
**Applied fix:** New `guarded(run, state, item, failed)` wraps each action in `execute`. An unexpected `Exception` is logged with `logger.exception` and becomes a failed action with the fixed text "Action could not be completed". `CancelledError` still propagates. The tests assert later actions still run, the provider text does not appear in the response, the exception is logged, and the user and assistant rows are stored with the same actions as the response. The contract's action rules now describe this.

### WR-02: Chat history order depends on request-start time, so overlapping turns interleave

**Files modified:** `backend/app/chat_store.py`, `backend/tests/test_chat_store.py`, `planning/API_CONTRACT.md`
**Commit:** 670ce60
**Reproduction:** `test_overlapping_turns_keep_each_question_with_its_reply` saved turn A (asked t0, replied t20) then turn B (asked t10, replied t30) and got `[uA, uB, aA, aB]`.
**Applied fix:** `load_recent` now orders by `rowid DESC` only. `created_at` stays as display data, so the user row keeps the ask time. `save_turn` writes each pair adjacently in one transaction, so insertion order keeps pairs together. Existing ordering tests (same-second turns, 100-row cap, prompt window) still pass. The contract's history section states the ordering.

### WR-03: Client length limit differs from the server rule, so valid messages are blocked

**Files modified:** `frontend/src/components/ChatPanel.tsx`, `frontend/src/components/ChatPanel.composer.test.tsx`
**Commit:** 9a38d36
**Reproduction:** Two new composer tests failed: 2000 emoji (4000 UTF-16 units) disabled Send, and 2000 characters padded with spaces disabled Send.
**Applied fix:** `tooLong` now uses `codePoints(draft) > MAX_DRAFT`, with `codePoints = (text) => Array.from(text.trim()).length`, matching the server (code points after trimming). The existing test "counts UTF-16 units: 1000 emoji pass, 1001 blocked" pinned the old behavior and was replaced by "2000 emoji pass, 2001 blocked", plus a new trimmed-draft test that also checks the request is sent.

## Verification

Gates ran in the main checkout after the fast-forward, so the numbers are reproducible from the tree you see:
- Backend: `uv run --directory backend python -m pytest -q` gives 327 passed (baseline 323, plus 4 new tests).
- Frontend: `npx vitest run` gives 345 passed (baseline 344, plus 1 net: one test replaced, one added). `npx tsc --noEmit` was clean in the worktree run.
- The same suites also passed inside the isolated worktree before merging.

Notes:
- `.claude/worktrees/` is not gitignored in this repo (it showed as untracked while the worktree existed). The worktree is removed now, so nothing is left behind.
- `.planning/config.json`, `.planning/milestone.lock` and `.planning/state.json` were not touched.
- No real LLM calls were made and no servers or watchers were left running.

---

_Fixed: 2026-10-09_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
