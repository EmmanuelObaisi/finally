---
phase: "5"
slug: "ai-trading-copilot"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-09"
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: `05-RESEARCH.md` § Validation Architecture, reconciled by the planner against CONTEXT decisions D-01..D-13 (CONTEXT is newer than the research: D-05/D-06 pin num_retries 0 and strict provider pinning, D-07/D-08 add the action cap, D-10/D-11 fix the mock precedence and quantities, D-13 adds the 2000-character 400 and the contract clarifications).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Backend: pytest 9.1.1 + pytest-asyncio 1.4.0, httpx `TestClient`. Frontend: Vitest 5.0.3 + React Testing Library 16.3.3 + jsdom 30.1.2 |
| **Config file** | `backend/pyproject.toml` `[tool.pytest.ini_options]`; `frontend/vitest.config.ts`, `frontend/vitest.setup.ts` |
| **Quick run command** | Backend: `uv run --directory backend python -m pytest -q tests/test_chat.py tests/test_chat_store.py tests/test_llm_schema.py tests/test_llm_prompt.py tests/test_llm_client.py tests/test_llm_mock.py`. Frontend: `npm --prefix frontend test -- ChatPanel chatStore watchlistStore chatActions Header WatchlistPanel api` |
| **Full suite command** | `uv run --directory backend python -m pytest -q` (must print no "warnings summary") and `npm --prefix frontend test`; build and browser regression: `npm --prefix frontend run build && npm --prefix test run smoke` |
| **Estimated runtime** | ~30 seconds (backend ~15 s, frontend ~8 s, plus the smoke run) |

---

## Sampling Rate

- **After every task commit:** Run the quick run command for the side being edited
- **After every plan wave:** Run both full suites (baselines before this phase: 196 backend, 254 frontend, all green)
- **Before `/gsd-verify-work`:** Both full suites, the export build and the browser smoke green, then the human-checks (live smoke and the browser walkthroughs in plan 05-05)
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-T2 | 05-01 | 1 | CHAT-09, D-10, D-11, D-12 | T-05-04 | Mock replies come from the `complete()` seam, never import `litellm`, first match wins in the order malformed, broke, add/remove TICKER, buy, sell, plain | unit | `uv run --directory backend python -m pytest -q tests/test_llm_mock.py` | ✅ | ✅ green |
| 05-01-T3 | 05-01 | 1 | CHAT-02, D-01..D-04 | T-05-01 | System prompt carries the explicit-request rule; context pre-computes weights; history gets outcome lines | unit | `uv run --directory backend python -m pytest -q tests/test_llm_prompt.py` | ✅ | ✅ green |
| 05-01-T3 | 05-01 | 1 | CHAT-03, D-05, D-06 | T-05-02, T-05-03 | `acompletion` called with MODEL, `response_format=ChatReply`, `reasoning_effort="low"`, pinned provider block, timeout 30, `num_retries=0`, `max_tokens=2000`, explicit key; schema has no `oneOf/allOf/not/pattern/format/minItems/maxItems/nullable/anyOf`, `additionalProperties: false` | unit | `uv run --directory backend python -m pytest -q tests/test_llm_client.py tests/test_llm_schema.py` | ✅ | ✅ green |
| 05-02-T1 | 05-02 | 2 | CHAT-01, D-12 | T-05-08 | `POST /api/chat` returns `{message, actions, portfolio, watchlist}`; empty message and over-2000-character message are 400 | integration | `uv run --directory backend python -m pytest -q tests/test_chat.py -k "response_shape or empty_message or too_long or tracer"` | ✅ | ✅ green |
| 05-02-T2 | 05-02 | 2 | CHAT-04, D-07, D-08, D-09 | T-05-05, T-05-10 | AI actions pass the same validation as manual ones; a failed action changes nothing and never blocks the next; cap of 10 trades and 10 watchlist changes with over-cap failures | integration | `uv run --directory backend python -m pytest -q tests/test_chat.py -k "execute or failure or tracking or cap or adjacency or ordering or parallel"` | ✅ | ✅ green |
| 05-02-T2 | 05-02 | 2 | CHAT-05 | T-05-09 | Exactly two rows per turn in one transaction; user actions NULL; assistant actions JSON list; user row uses the time taken before the model call | integration | `uv run --directory backend python -m pytest -q tests/test_chat.py tests/test_chat_store.py -k persist` | ✅ | ✅ green |
| 05-02-T2 | 05-02 | 2 | CHAT-06 | — | History oldest first with same-second ties by rowid, cap 100, `actions: null` for user rows, `{"messages": []}` when empty | integration | `uv run --directory backend python -m pytest -q tests/test_chat.py tests/test_chat_store.py -k history` | ✅ | ✅ green |
| 05-02-T2 | 05-02 | 2 | CHAT-07 | — | Response `portfolio` and `watchlist` equal `GET /api/portfolio` and `GET /api/watchlist`, also on LLM failure | integration | `uv run --directory backend python -m pytest -q tests/test_chat.py -k fresh_state` | ✅ | ✅ green |
| 05-02-T2 | 05-02 | 2 | CHAT-08 | T-05-06 | Missing key, timeout, provider exception, non-JSON, fenced JSON, None, empty, NaN, wrong enum, extra key, lone surrogate -> 200, fixed assistant text, `actions []`, nothing executed; key and provider text never leak | integration | `uv run --directory backend python -m pytest -q tests/test_chat.py -k llm_failure` | ✅ | ✅ green |
| 05-02-T2 | 05-02 | 2 | CHAT-09 (route level) | T-05-04 | Mock-mode routes run the real parse, execute and persist path with `litellm` blocked | integration | `uv run --directory backend python -m pytest -q tests/test_chat.py -k mock` | ✅ | ✅ green |
| 05-02-T3 | 05-02 | 2 | D-13 (contract) | — | Contract records D-07, D-08, D-10, D-11 and the D-13 clarifications | doc check | grep checks in plan 05-02 Task 3 verify | ✅ | ✅ green |
| 05-01-T3, 05-02-T2 | 05-01, 05-02 | 1-2 | TEST-03 | — | Structured-output parsing, malformed responses, trade validation in the chat flow | unit+integration | the backend files above | ✅ | ✅ green |
| 05-03-T1, 05-03-T2 | 05-03 | 1 | PUI-06 | T-05-11, T-05-12 | A reply applies `portfolio` through `applyTrade` and publishes `watchlist`; panel rows change; one request per send, no retry | component+store | `npm --prefix frontend test -- chatStore watchlistStore chatActions api WatchlistPanel` | ✅ | ✅ green |
| 05-04-T1, 05-04-T2 | 05-04 | 2 | PUI-05 | T-05-14, T-05-15 | Panel, Enter to send, loading row, auto-scroll, action lines, toggle and page placement | component | `npm --prefix frontend test -- ChatPanel Header` | ✅ | ✅ green |
| 05-05-T2, 05-05-T3 | 05-05 | 3 | PUI-05 | T-05-16, T-05-17, T-05-18 | History states, composer limits, slow reply, request-failure row, focus and Escape | component | `npm --prefix frontend test -- ChatPanel` | ✅ | ✅ green |
| 05-05-T1 | 05-05 | 3 | CHAT-01..09 end to end | — | Built page plus live mock-mode backend answer buy, sell, add, broke and malformed turns | live check | see plan 05-05 Task 1 verify (port 8770) | n/a | ✅ green (05-05 run, port 8770) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `backend/tests/test_llm_schema.py` — parsing and schema-keyword contract (CHAT-03, TEST-03)
- [x] `backend/tests/test_llm_prompt.py` — context, outcome lines (CHAT-02)
- [x] `backend/tests/test_llm_client.py` — kwargs and failure mapping with a fake `litellm` module (CHAT-03, CHAT-08)
- [x] `backend/tests/test_llm_mock.py` — keyword table and precedence (CHAT-09)
- [x] `backend/tests/test_chat.py`, `backend/tests/test_chat_store.py` — route integration (CHAT-01, CHAT-04..08)
- [x] `backend/tests/live_smoke.py` — manual live check (not collected by pytest)
- [x] `frontend/src/lib/chatStore.test.ts`, `watchlistStore.test.ts`, `chatActions.test.ts`, `frontend/src/components/ChatPanel.test.tsx`, `ChatPanel.states.test.tsx`, `ChatPanel.composer.test.tsx` (PUI-05, PUI-06)
- [x] Package install: `litellm==1.104.0` only, behind a blocking-human checkpoint (plan 05-01 Task 1); no test-framework installs

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real model reply is schema-valid and served by Cerebras | CHAT-03 | Needs the real OpenRouter key and network; tests never call the live API | `uv run --directory backend python tests/live_smoke.py`; expect a schema-valid reply, `provider_name == "Cerebras"` and no trades for the hypothetical probe |
| Real model grounding, explicit-request rule, size conversion, wording | CHAT-02, D-01, D-03, D-04 | Model behavior can only be judged against the real model | Plan 05-05 Task 3 human-check: portfolio question, hypothetical, buy, "sell half" |
| Chat panel look and feel (dock vs overlay, loading, auto-scroll, inline action lines, cross-panel refresh) | PUI-05, PUI-06 | Visual judgement against the UI-SPEC | Plan 05-04 Task 2 and plan 05-05 Task 3 human-checks: send buy / sell / watchlist / analysis messages in mock mode, reload and confirm history restores; 768px header fit |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-10-09 (validate-phase audit: 0 gaps)

## Validation Audit 2026-10-09

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
