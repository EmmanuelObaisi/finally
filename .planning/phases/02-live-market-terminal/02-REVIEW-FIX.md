---
phase: 02-live-market-terminal
fixed_at: 2026-10-08T00:00:00Z
review_path: .planning/phases/02-live-market-terminal/02-REVIEW.md
iteration: 2
findings_in_scope: 7
fixed: 6
skipped: 1
status: partial
---

# Phase 02: Code Review Fix Report

**Fixed at:** 2026-10-08
**Source review:** .planning/phases/02-live-market-terminal/02-REVIEW.md
**Iteration:** 2

**Summary:**
- Findings in scope: 7 (0 critical, 7 warning; Info excluded by `fix_scope: critical_warning`)
- Fixed: 6 (WR-01 to WR-04, WR-06 in iteration 1; WR-07 in iteration 2)
- Skipped: 1 (WR-05, reverted)

## Fixed Issues

### WR-01: Sparkline chart accumulates points beyond the 300-point store cap

**Files modified:** `frontend/src/components/Sparkline.tsx`, `frontend/src/components/Sparkline.test.tsx`
**Commit:** aa0178d
**Applied fix:** The buffer effect now re-seeds the series with `setData(toData(buffer))` instead of `update(newest)`, so the chart always mirrors the capped store window. The existing "updates with the newest point" test was rewritten to expect `setData`, and a new test asserts the series never holds more than `SPARK_CAP` points.

### WR-02: "sparklines draw from the stream" E2E test passes with an empty chart

**Files modified:** `test/motion.spec.ts`
**Commit:** 7f86d0a
**Applied fix:** The test now polls the sparkline canvases and requires at least one non-transparent pixel. Adapted from the review snippet: lightweight-charts creates four canvases per chart, so it checks all of them (`some`) rather than only the first. Verified the assertion can fail: a throwaway probe with the SSE route aborted showed all four canvases blank, and the real run draws within the timeout.

### WR-03: E2E backend is not isolated from the developer's shell environment and `.env`

**Files modified:** `test/playwright.config.ts`
**Commit:** 94d5fcb
**Applied fix:** `webServer.env` now sets `MASSIVE_API_KEY: ""` and `LLM_MOCK: "true"`. Verified by running `MASSIVE_API_KEY=bogus npm --prefix test run smoke`: all 6 tests pass (an unpinned bogus key would fail startup).

### WR-04: A transient Massive error at startup aborts the whole app

**Files modified:** `backend/app/market/massive_client.py`, `backend/tests/market/test_massive.py`
**Commit:** a5e9b2e
**Applied fix:** `start()` re-raises only when the error text contains "Unknown API Key" (the existing rejected-key test still passes); any other initial-poll error is logged and the background loop retries it. `BadResponse` carries only the response body (no status), so the rejected-key check is by message, as the review suggested. A single `except Exception` replaces the review's two clauses. New test: a `RuntimeError` on the first poll does not abort `start()` and the loop later fills the cache.

### WR-06: `change_percent` can raise ZeroDivisionError and kill the whole stream

**Files modified:** `backend/app/market/cache.py`, `backend/tests/market/test_cache.py`
**Commit:** ce98581
**Applied fix:** `PriceCache.update` now returns `None` (and does not store or bump the version) when the rounded price is `<= 0`, fixing it at the write boundary so no `session_start_price` of zero can exist. Return type is `PriceUpdate | None`; no caller uses the return value. New test covers a `0.004` price. Status: fixed, requires human verification (logic change: a sub-cent quote is now treated as unpriced).

### WR-07: After a transient startup error on a free plan, prices stay empty for 15 minutes

**Files modified:** `backend/app/market/massive_client.py`, `backend/tests/market/test_massive.py`
**Commit:** dfe4268 (iteration 2)
**Root cause (proved first):** `start()` swallows a transient error (WR-04), but `eod_mode` is already `True` with `_eod_closes == {}`, so `_run` slept `eod_interval` (900 s). A new test (snapshot `NOT_AUTHORIZED`, first Grouped Daily call raises `RuntimeError`, then returns a bar) failed against that code: the cache was still empty after the polling deadline.
**Applied fix:** New `retry_interval` constructor argument (default 60 s, under the free-plan 5 calls per minute) and a small `_delay()` method used by `_run`: `interval` outside EOD mode, `eod_interval` once closes exist, `retry_interval` in EOD mode with no closes. A constructor argument rather than the review's module constant so the test can shorten it, matching `interval` and `eod_interval`. WR-04 behaviour is unchanged (rejected key still fails fast; other errors retry). Status: fixed, requires human verification (loop timing logic; the test covers the retry path).

## Skipped Issues

### WR-05: Massive path has no OS-trust-store opt-in on the target machine

**Files modified:** `backend/app/market/massive_client.py`, `backend/pyproject.toml`, `backend/uv.lock`
**Commit:** 5b3431b
**Applied fix:** Added `truststore==0.10.4` and call `truststore.inject_into_ssl()` once at import in `massive_client.py`. TLS verification stays on; only the source of roots changes. `massive` builds its urllib3 pool with `cert_reqs="CERT_REQUIRED"` and `ca_certs=certifi.where()`; the truststore `SSLContext` patch means the OS store is used.

**New package check (not in the approved Phase 2 list):** queried `https://pypi.org/pypi/truststore/json`: latest version 0.10.4 (uploaded 2025-08-12), requires Python >=3.10, project Source URL `https://github.com/sethmlarson/truststore`. This matches the version in the project STACK notes and the expected repository. Added with `UV_SYSTEM_CERTS=1 uv add "truststore==0.10.4"` (exact pin, like the other dependencies).

**Not reproduced:** the reviewer's premise (Massive hits `CERTIFICATE_VERIFY_FAILED` here) did not reproduce. A real `RESTClient(api_key="bogus").get_grouped_daily_aggs(...)` call returned the API's `Unknown API Key` response both without and with the injection, so TLS verified in both cases in this shell (`NODE_EXTRA_CA_CERTS` is set, no other cert env). The change follows the project's documented requirement and does not break the path (verified with the same call after injection). Marked for human verification as a precaution because the benefit depends on the machine's trust setup.

**Reverted:** commit 5b3431b was reverted in 32a4eef at the user's request. The predicted failure did not reproduce and phase research (02-RESEARCH.md) found certifi reaches api.massive.com on this machine. Add truststore only if CERTIFICATE_VERIFY_FAILED actually appears.

Info findings (IN-01 to IN-07) were out of scope for this run.

## Verification

- Environment: all gates ran in the **main checkout**, not an isolated worktree (see deviation below).
- Backend: `UV_SYSTEM_CERTS=1 uv run python -m pytest -q` from `backend/`: 111 passed (baseline 109 + 2 new tests) after the last iteration 1 fix; 112 passed after WR-07 (iteration 2, +1 test, run in the main checkout).
- Frontend: `npm --prefix frontend test`: 8 files, 87 tests passed after WR-01; `npm --prefix frontend run build` succeeded.
- E2E: `npm --prefix test run smoke`: 6 passed (after WR-02 and again after WR-03, the second time with `MASSIVE_API_KEY=bogus` in the shell).

**Deviation from the worktree protocol:** `workflow.use_worktrees` is unset (default true), but a fresh worktree has no `node_modules` or Playwright setup, so the required frontend and E2E gates could not run there. The calling agent was blocked on this run, so no foreground session raced the checkout. Fixes were edited and committed directly on `finally-gsd`, each with an explicit pathspec so the unrelated uncommitted files (`.planning/config.json`, `.planning/milestone.lock`, `.planning/state.json`) were never staged. No worktree, temp branch or recovery sentinel was created.

---

_Fixed: 2026-10-08_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
