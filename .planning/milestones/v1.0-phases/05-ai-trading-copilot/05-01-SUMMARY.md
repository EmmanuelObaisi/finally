---
phase: 05-ai-trading-copilot
plan: 01
subsystem: api
tags: [litellm, openrouter, cerebras, pydantic, structured-output, mock-llm, prompt, tracer, pypi-approval]

requires:
  - phase: 03-trading-and-watchlist
    provides: "qty_text, build_portfolio and build_watchlist shapes that the prompt context is built from"
provides:
  - "app.llm.schema: TradeOrder, WatchlistChange, ChatReply (strict-schema friendly)"
  - "app.llm.client: complete(settings, messages), LLMUnavailable, MODEL, PROVIDER, TIMEOUT_SECONDS, MAX_TOKENS, NOT_CONFIGURED"
  - "app.llm.mock: mock_complete(messages) deterministic keyword rules"
  - "app.llm.prompt: HISTORY_LIMIT, SYSTEM_PROMPT, build_context, action_line, build_messages"
  - "litellm==1.104.0 pinned and locked"
  - "backend/tests/live_smoke.py manual check against the real Cerebras route"
affects: [05-02-chat-turn, 06-e2e]

actuals:
  tokens: 7300
  tasks: 3
  commits: 3

tech-stack:
  added: [litellm 1.104.0 (plus 59 transitive packages)]
  patterns:
    - "One complete() seam: mock and real differ only in where the raw JSON text comes from"
    - "litellm imported lazily inside the real branch; module import never pulls it"
    - "Own missing-key check before LiteLLM (an empty api_key silently falls back to the ambient env key)"
    - "Value rules (ticker format, quantity > 0, cash, shares) stay in the trading services; the reply schema stays tiny"

key-files:
  created:
    - backend/app/llm/__init__.py
    - backend/app/llm/schema.py
    - backend/app/llm/mock.py
    - backend/app/llm/client.py
    - backend/app/llm/prompt.py
    - backend/tests/test_llm_mock.py
    - backend/tests/test_llm_schema.py
    - backend/tests/test_llm_client.py
    - backend/tests/test_llm_prompt.py
    - backend/tests/live_smoke.py
  modified:
    - backend/pyproject.toml
    - backend/uv.lock

key-decisions:
  - "Mock keyword precedence is malformed, broke, add|remove TICKER, buy, sell, plain; quantities are fixed (D-10, D-11)"
  - "Provider is pinned to Cerebras with allow_fallbacks False and require_parameters True, asserted by a kwargs test (D-05)"
  - "SYSTEM_PROMPT keeps the D-01 sentence on one source line so it can be grepped verbatim"
  - "live_smoke.py polls the OpenRouter generation record for up to 20 s because the record lags more than the planned 5 s"

requirements-completed: [CHAT-02, CHAT-03, CHAT-09, TEST-03]

coverage:
  - id: D1
    description: "ChatReply schema parses the structured reply and rejects every malformed shape (unknown keys, bad enums, NaN/Infinity, None, empty, fenced, lone surrogate); the JSON schema avoids Cerebras-unsupported keywords"
    requirement: "CHAT-03"
    verification:
      - kind: unit
        ref: "backend/tests/test_llm_schema.py (uv run --directory backend python -m pytest)"
        status: pass
    human_judgment: false
  - id: D2
    description: "complete() seam: mock branch never imports litellm; real branch awaits acompletion once with the pinned provider, timeout 30, no retries, max_tokens 2000; errors propagate; missing key raises LLMUnavailable before any call"
    requirement: "CHAT-03"
    verification:
      - kind: unit
        ref: "backend/tests/test_llm_client.py and backend/tests/test_llm_mock.py#test_mock_complete_round_trips_through_chat_reply"
        status: pass
    human_judgment: false
  - id: D3
    description: "Deterministic keyword mock with the decided precedence, pure and thread safe"
    requirement: "CHAT-09"
    verification:
      - kind: unit
        ref: "backend/tests/test_llm_mock.py"
        status: pass
    human_judgment: false
  - id: D4
    description: "Prompt builder: system rules, context with precomputed weights, outcome-annotated history, stored rows not mutated"
    requirement: "CHAT-02"
    verification:
      - kind: unit
        ref: "backend/tests/test_llm_prompt.py"
        status: pass
    human_judgment: false
  - id: D5
    description: "Prompt wording makes the model refuse actions for questions, hypotheticals and injected instructions (T-05-01); the real route is served by Cerebras"
    requirement: "CHAT-02"
    verification:
      - kind: other
        ref: "uv run --directory backend python tests/live_smoke.py (manual: provider Cerebras, hypothetical gave no trades)"
        status: pass
    human_judgment: true
    rationale: "Model behavior is probabilistic and unit tests do not call the real model; the live probe passed once, the server-side validation in plan 05-02 is the actual safety net"

plan_head_before: cf43b44545bb480235d31b2314f4e6308ec838fd
plan_head_after: 4825c9ca09ab2a9e6388ddaa391164c9b63efa25
commits: 3
duration: 6min
completed: 2026-10-09
status: complete
---

# Phase 5 Plan 01: LLM Layer Summary

**Pinned LiteLLM 1.104.0 behind a single `complete()` seam (deterministic keyword mock or Cerebras-pinned `acompletion`), a tiny strict ChatReply schema, and a prompt builder that precomputes portfolio weights and appends server outcome lines to history.**

## Approved packages

Task 1 (package legitimacy, `gate="blocking-human"`) was presented to the user by the orchestrator before dispatch and approved on 2026-10-09 ("approved", no replacement version named).

PyPI:

| Package | Version | Kind | Installed by |
|---------|---------|------|--------------|
| litellm | 1.104.0 | dependency | 05-01 Task 2 |

litellm 1.104.0 - approved by user. Registry evidence gathered by the orchestrator: name `litellm`, repository github.com/BerriAI/litellm, uploaded 2026-10-03T22:43Z, 7 wheels (cp310-abi3) plus sdist, none yanked. Only this package was added by name; `uv add` resolved 59 transitive packages. Executor checks after install: `backend/pyproject.toml` pins `"litellm==1.104.0"`, `backend/uv.lock` resolves exactly 1.104.0, `uv lock --check` exits 0, and the installed `litellm-1.104.0.dist-info/RECORD` lists no `.pth` file (the vector of the compromised 1.82.7/1.82.8 releases). TLS verification stayed on (`UV_SYSTEM_CERTS=1`).

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-09T17:25:48Z
- **Completed:** 2026-10-09T17:32:00Z
- **Tasks:** 3 (Task 1 resolved by the orchestrator before this run)
- **Files modified:** 12 (10 created, 2 modified)

## Accomplishments

- `app.llm.schema`: `TradeOrder`, `WatchlistChange`, `ChatReply` with `extra="forbid"`, Literal enums and `allow_inf_nan=False`; no value constraints, so the JSON schema has none of oneOf/allOf/not/pattern/format/minItems/maxItems/nullable/anyOf and every object has `additionalProperties: false`.
- `app.llm.mock.mock_complete`: first-match keyword rules (malformed returns `not json`, broke buys 1,000,000 AAPL, add/remove TICKER, buy 1 AAPL, sell 1 AAPL, plain), pure, no module state.
- `app.llm.client.complete`: mock branch never imports litellm (tracer test runs with `sys.modules["litellm"] = None`); real branch checks the key itself, then lazily imports litellm and awaits `acompletion` with the Cerebras-pinned provider block, `timeout=30`, `num_retries=0`, `max_tokens=2000`, `reasoning_effort="low"`, `response_format=ChatReply`.
- `app.llm.prompt`: system prompt with the D-01..D-04 rules, `build_context` with `weight_percent`/`cash_percent` (0.0 for an empty portfolio), `action_line` outcome records, `build_messages` ordering system, history, new user text.
- `backend/tests/live_smoke.py` (manual): real call returned a schema-valid reply (`finish: stop`), OpenRouter's generation record shows `provider_name: Cerebras`, and "What if I bought 100 TSLA?" produced no trades.
- 66 new tests; full backend suite 262 passed, no warnings summary.

## Task Commits

1. **Task 1: Verify litellm 1.104.0** - resolved by the orchestrator (no commit)
2. **Task 2: Mock chat reply end to end (tracer)** - `52190a0` (feat)
3. **Task 3: Prompt builder and pinned contracts (TDD)**
   - RED `3553988` (test): 15 prompt tests failed on assertions against an empty stub
   - GREEN `4825c9c` (feat)

**Plan metadata:** recorded in the docs commit that follows this summary.

## TDD Gate Compliance

- RED: `test(05-01)` `3553988`. The target tests in `test_llm_prompt.py` executed and failed on the planned assertions (for example `assert 0 == 20` for `HISTORY_LIMIT`, `IndexError` on the empty message list); one vacuous test (no mutation of input rows) passed against the stub. Semantic assessment: failures came from missing behavior, not import, syntax or fixture faults, because a signature-only stub was committed alongside the tests. `workflow.tdd_mode` is not enabled, so `check tdd-red-evidence` was not run.
- GREEN: `feat(05-01)` `4825c9c`; `test_llm_schema.py` and `test_llm_client.py` were written in the same RED commit and passed immediately because schema.py and client.py already existed from Task 2 (they pin existing behavior, not new behavior).
- REFACTOR: none needed.

## Files Created/Modified

- `backend/app/llm/schema.py` - reply models
- `backend/app/llm/mock.py` - keyword mock
- `backend/app/llm/client.py` - the `complete()` seam and constants
- `backend/app/llm/prompt.py` - system prompt, context, outcome lines, message assembly
- `backend/app/llm/__init__.py` - package docstring
- `backend/tests/test_llm_{mock,schema,client,prompt}.py` - unit tests
- `backend/tests/live_smoke.py` - manual live check, not collected by pytest
- `backend/pyproject.toml`, `backend/uv.lock` - litellm 1.104.0 pin

## Decisions Made

- Followed the plan's decisions D-01..D-06, D-10..D-12 as written.
- Kept the D-01 sentence on a single source line (long line) rather than wrapping it, so the acceptance grep matches it verbatim.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Generation-record poll in live_smoke.py too short**
- **Found during:** Task 3 (manual live run)
- **Issue:** the plan specified 5 attempts 1 s apart; the first live run failed with "generation record not found" because OpenRouter's record appeared after more than 8 s (confirmed by polling the same id: 200 with `Cerebras` a few seconds later)
- **Fix:** 10 attempts 2 s apart
- **Files modified:** backend/tests/live_smoke.py
- **Verification:** rerun printed `provider: Cerebras` and "hypothetical produced no trades"
- **Committed in:** 4825c9c

**2. [Rule 1 - Bug] D-01 sentence wrapped across two source lines**
- **Found during:** Task 3 acceptance criteria
- **Issue:** the verbatim-grep acceptance criterion returned 0 because the sentence was split by line wrapping
- **Fix:** put the sentence on one source line
- **Files modified:** backend/app/llm/prompt.py
- **Committed in:** 4825c9c

---

**Total deviations:** 2 auto-fixed (2 Rule 1)
**Impact on plan:** no scope change.

## Issues Encountered

- One live attempt returned an upstream 429 ("openai/gpt-oss-120b is temporarily rate-limited upstream", shared Cerebras pool). It is an example of the failure that plan 05-02 must turn into the graceful assistant error; a retry a few seconds later succeeded.
- The acceptance line `grep -n 'name = "litellm"' backend/uv.lock prints 1 line` prints 3 lines (the package entry plus two dependency references); the package entry itself is one line (`name = "litellm"` at line 934), so the intent holds.
- The `.planning/config.json`, `.planning/milestone.lock` and `.planning/state.json` changes pre-dated this run and were left untouched.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required beyond the `OPENROUTER_API_KEY` already in `.env`.

## Next Phase Readiness

- Plan 05-02 can build `run_turn` on `complete()`, `ChatReply` and `build_messages` as specified in the plan interfaces.
- Carried risk for Phase 6: `uv sync --locked` in the Docker build with litellm's 59 transitive packages is untested.

## Self-Check: PASSED

All created files exist; commits 52190a0, 3553988 and 4825c9c are ancestors of HEAD; full backend suite re-run green (262 passed, no warnings summary); `uv lock --check` exits 0; litellm 1.104.0 RECORD has no `.pth`.
