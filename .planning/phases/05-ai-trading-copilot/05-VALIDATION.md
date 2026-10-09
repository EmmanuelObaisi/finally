---
phase: "5"
slug: "ai-trading-copilot"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-09"
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: `05-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Backend: pytest 9.1.1 + pytest-asyncio 1.4.0, httpx `TestClient`. Frontend: Vitest 5.0.3 + React Testing Library 16.3.3 + jsdom 30.1.2 |
| **Config file** | `backend/pyproject.toml` `[tool.pytest.ini_options]`; `frontend/vitest.config.ts`, `frontend/vitest.setup.ts` |
| **Quick run command** | Backend: `cd backend && uv run python -m pytest tests/test_chat.py tests/test_llm_schema.py tests/test_llm_prompt.py tests/test_llm_client.py tests/test_llm_mock.py -x -q`. Frontend: `cd frontend && npx vitest run src/components/ChatPanel.test.tsx src/lib/chatStore.test.ts src/lib/watchlistStore.test.ts` |
| **Full suite command** | `cd backend && uv run python -m pytest -q` and `cd frontend && npx vitest run` |
| **Estimated runtime** | ~20 seconds (backend ~13 s, frontend ~6 s today) |

---

## Sampling Rate

- **After every task commit:** Run the quick run command for the side being edited
- **After every plan wave:** Run both full suites (baselines: 196 backend, 254 frontend, all green)
- **Before `/gsd-verify-work`:** Both full suites green, then the manual live smoke
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

Task IDs are assigned by the planner; each row below must map to at least one task.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | CHAT-01 | — | Empty or whitespace message -> 400 `{"error": ...}` | integration | `uv run python -m pytest tests/test_chat.py -k "response_shape or empty_message" -x` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | CHAT-02 | — | N/A | unit | `uv run python -m pytest tests/test_llm_prompt.py -x` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | CHAT-03 | — | Schema has no `oneOf/allOf/not/pattern/format/minItems/maxItems/nullable`; `additionalProperties: false` | unit | `uv run python -m pytest tests/test_llm_client.py tests/test_llm_schema.py -x` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | CHAT-04 | — | AI actions pass the same validation as manual ones; a failed action changes nothing | integration | `uv run python -m pytest tests/test_chat.py -k "execute or failure or tracking" -x` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | CHAT-05 | — | N/A | integration | `uv run python -m pytest tests/test_chat.py -k persist -x` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | CHAT-06 | — | N/A | integration | `uv run python -m pytest tests/test_chat.py -k history -x` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | CHAT-07 | — | N/A | integration | `uv run python -m pytest tests/test_chat.py -k fresh_state -x` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | CHAT-08 | — | Missing key, timeout, malformed / NaN / schema-invalid output -> graceful error, nothing executed | integration | `uv run python -m pytest tests/test_chat.py -k llm_failure -x` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | CHAT-09 | — | Mock mode makes no network call and never imports `litellm` | unit+integration | `uv run python -m pytest tests/test_llm_mock.py -x` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | TEST-03 | — | N/A | unit+integration | the backend files above | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PUI-05 | — | N/A | component | `npx vitest run src/components/ChatPanel.test.tsx` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PUI-06 | — | N/A | component+store | `npx vitest run src/lib/chatStore.test.ts src/lib/watchlistStore.test.ts src/components/ChatPanel.test.tsx src/components/WatchlistPanel.test.tsx` | ⚠️ partial (WatchlistPanel.test.tsx exists) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_llm_schema.py` — parsing and schema-keyword contract (CHAT-03, TEST-03)
- [ ] `backend/tests/test_llm_prompt.py` — context, history window, outcome lines (CHAT-02)
- [ ] `backend/tests/test_llm_client.py` — kwargs and failure mapping with monkeypatched `litellm.acompletion` (CHAT-03, CHAT-08)
- [ ] `backend/tests/test_llm_mock.py` — keyword table and precedence (CHAT-09)
- [ ] `backend/tests/test_chat.py` — route integration (CHAT-01, CHAT-04..08)
- [ ] `backend/tests/live_smoke.py` — manual live check (not collected by pytest)
- [ ] `frontend/src/lib/chatStore.test.ts`, `frontend/src/lib/watchlistStore.test.ts`, `frontend/src/components/ChatPanel.test.tsx` (PUI-05, PUI-06)
- [ ] Package install: `litellm==1.104.0` only, behind a human-verify checkpoint; no test-framework installs

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real model reply is schema-valid and served by Cerebras | CHAT-03 | Needs the real OpenRouter key and network; tests never call the live API | `cd backend && uv run python tests/live_smoke.py`; expect a schema-valid reply and `provider_name == "Cerebras"` from the generation endpoint |
| Chat panel look and feel (dock vs overlay, loading, auto-scroll, inline action lines) | PUI-05, PUI-06 | Visual judgement against the UI-SPEC | Run the app, send buy / sell / watchlist / analysis messages, reload and confirm history restores |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
