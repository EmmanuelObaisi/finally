---
phase: 02-live-market-terminal
reviewed: 2026-10-08T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - backend/app/market/cache.py
  - backend/app/market/massive_client.py
  - backend/tests/market/test_cache.py
  - backend/tests/market/test_massive.py
  - frontend/src/components/Sparkline.test.tsx
  - frontend/src/components/Sparkline.tsx
  - test/motion.spec.ts
  - test/playwright.config.ts
findings:
  critical: 0
  warning: 1
  info: 5
  total: 6
status: issues_found
---

# Phase 2: Code Review Report (incremental re-review of fix commits)

**Reviewed:** 2026-10-08
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Incremental re-review of the fixes for WR-01, WR-02, WR-03, WR-04 and WR-06 (WR-05 was reverted at
the user's request and is not re-raised). I diffed against `642eef7` and read the full current
files plus `store.ts`, the config and the cache callers.

Verified resolved: WR-01 (the sparkline now re-seeds from the capped, strictly ascending store
buffer, so chart and store agree), WR-02 (the E2E test now requires drawn pixels), WR-03
(`MASSIVE_API_KEY` and `LLM_MOCK` are pinned in `webServer.env`; Playwright merges the values over
`process.env` and `load_dotenv(override=False)` leaves a present-but-empty variable alone), and
WR-06 (a price that rounds to zero is rejected at the write boundary; no caller uses the return
value, so the `None` return is safe).

WR-04 is fixed as specified, but it introduces one new failure mode on the free plan (WR-07).
No security issues were found. No structural findings (fallow) were provided.

## Warnings

### WR-07: After a transient startup error on a free plan, prices stay empty for 15 minutes

**File:** `backend/app/market/massive_client.py:58-64`, `:94`, `:112-113` (introduced by the WR-04 fix)
**Issue:** `_poll` sets `self.eod_mode = True` when the snapshot call returns `NOT_AUTHORIZED`,
and only then calls `_fetch_latest_closes`. If that grouped-daily call fails transiently (429 is
likely on the 5-calls-per-minute free tier, since the failed snapshot already used one call),
`start()` now swallows the error. `eod_mode` stays `True` with `_eod_closes == {}`, so `_run`
sleeps `eod_interval` (900 s) before the first retry. The cache is empty for 15 minutes, no ticker
has a price, and the only signal is one logged traceback. Before WR-04 this aborted startup
visibly. The same sleep applies to any grouped-daily failure inside the loop, but startup is where
the window is longest and most visible.
**Fix:** Retry quickly while there are no closes, with a delay that respects the rate limit:
```python
RETRY_DELAY = 60.0  # no prices yet; stay under the free-plan 5 calls per minute

async def _run(self) -> None:
    while True:
        if self.eod_mode and self._eod_closes:
            delay = self.eod_interval
        elif self.eod_mode:
            delay = RETRY_DELAY
        else:
            delay = self.interval
        await asyncio.sleep(delay)
        ...
```
Add a test: snapshot raises `NOT_AUTHORIZED`, the first grouped call raises `RuntimeError`, and
the loop fills the cache after the shortened delay.

## Info

### IN-03: Interface docs say `remove_ticker` evicts from the cache unconditionally (carried over, unchanged)

**File:** `backend/app/market/massive_client.py:84-86`
**Issue:** Still present. The caller (Phase 3 DELETE route) must guard held tickers before calling
`remove_ticker`. See `02-REVIEW.md` history for details.
**Fix:** Document the caller's duty or add the guard in Phase 3.

### IN-04: Free-plan startup can exceed 5 calls per minute; `_eod_closes` is overwritten with `{}` (carried over, unchanged)

**File:** `backend/app/market/massive_client.py:16`, `:113`, `:128-136`
**Issue:** Still present. One failed snapshot call plus up to 5 grouped calls can exceed 5 per
minute, and `_poll` replaces good closes with `{}` when the lookback finds no data.
**Fix:** Cap the lookback at 4 in EOD entry, or keep the previous `_eod_closes` when the new
result is empty.

### IN-06: Minor quality items (carried over, reduced to the files in this scope)

**Files:** `test/playwright.config.ts:26`, `frontend/src/components/Sparkline.tsx:28`
**Issue:** `DB_PATH` uses `Date.now()` and the `finally-e2e-*.db` files (plus `-wal` and `-shm`)
are never removed. `attributionLogo: false` deviates from the project note to keep the default
logo (the footer compensates), and the decision is not recorded.
**Fix:** Delete the temp DB in a global teardown, and record the attribution decision.

### IN-07: Timing-based backend test may be flaky under load (carried over, unchanged)

**File:** `backend/tests/market/test_massive.py:233-244`
**Issue:** Needs three polls inside a fixed `sleep(0.1)`. The new
`test_a_transient_error_at_start...` (`:220-231`) correctly polls with a deadline, which is the
pattern to copy.
**Fix:** Replace the fixed sleep with a deadline loop on `cache.version`.

### IN-08: WR-04 fix relies on error-message text, and the new test can leak a task

**File:** `backend/app/market/massive_client.py:61`, `backend/tests/market/test_massive.py:220-231`
**Issue:** `"Unknown API Key" in str(e)` is the only thing separating "fail fast on a bad key" from
"retry forever". If Massive rewords the response, a rejected key no longer stops startup: the app
runs with no prices and logs a full traceback every `interval` seconds. The check also runs
against every `Exception`, not only `BadResponse`. In the new test, an assertion failure before
`await source.stop()` leaves the poll task running (pending-task warnings that mask the real
failure).
**Fix:** Narrow to `except BadResponse as e` for the auth check, and wrap the test body in
`try/finally: await source.stop()`.

---

_Reviewed: 2026-10-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
