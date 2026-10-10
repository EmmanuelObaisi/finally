---
phase: 06-one-command-launch-full-verification
reviewed: 2026-10-10T00:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - README.md
  - backend/tests/test_chat.py
  - backend/tests/test_history.py
  - docker-compose.yml
  - scripts/start_mac.sh
  - scripts/start_windows.ps1
  - scripts/stop_mac.sh
  - scripts/stop_windows.ps1
  - test/compose.broken.yml
  - test/compose.e2e.yml
  - test/e2e.mjs
  - test/package.json
  - test/persist.mjs
  - test/portfolio-charts.spec.ts
  - test/trade-chat.spec.ts
  - test/trade-sell.spec.ts
  - test/zz-reconnect.spec.ts
findings:
  critical: 0
  warning: 3
  info: 5
  total: 8
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-10-10
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

Reviewed the compose file, the four start/stop scripts, the e2e and persistence drivers, the new Playwright specs and the two added backend contract tests. Cross-checked against `Dockerfile`, `.dockerignore`, `backend/app/config.py`, `backend/app/trading.py`, `backend/app/market/cache.py`, `backend/app/llm/mock.py` and `frontend/src/components/TradeBar.tsx`.

No security problems found: the port is published on 127.0.0.1 only, `.env` is excluded from the build context by `.dockerignore`, the image runs as a non-root user, no TLS verification is disabled, and test teardown is scoped to private compose projects (`finally-test`, `finally-persist`) so the user's `finally` project and volume are never touched.

Points that looked risky but hold up: trade prices are rounded to 2 decimals in the cache, so the `trade-sell` proceeds arithmetic matches the backend. The trade bar sets a `pending` message before each request, so the success-attribute waits are not satisfied by a stale message. `SIM_SEED=not-a-number` does raise in `Settings.from_env`, so `compose.broken.yml` makes the container exit.

The defects are in test robustness: one spec is not re-runnable, and one persistence check can pass without proving what it claims.

## Warnings

### WR-01: `trade-chat.spec.ts` is not re-runnable against a persistent database

**File:** `test/trade-chat.spec.ts:44`
**Issue:** After the reload the spec asserts `chat-action` filtered by "Bought 1 AAPL at" has count exactly 1. That only holds on an empty chat history. `portfolio-charts.spec.ts` guards its pristine-DB assumptions with `test.skip(BASE_URL && !E2E_FRESH_DB)`, but this spec has no guard. Running `BASE_URL=http://localhost:8000 npx playwright test` twice against a long-lived app (history persists in the volume) fails on the second run with count 2, or later counts. Official `e2e` (fresh volume) and `smoke` (temp DB) are unaffected, which is why this is not a blocker.
**Fix:** Measure the delta instead of the absolute count:
```ts
const prior = await page.getByTestId("chat-action").filter({ hasText: "Bought 1 AAPL at" }).count();
// ... send "please buy some apple" ...
// after reload and opening the panel:
await expect(page.getByTestId("chat-action").filter({ hasText: "Bought 1 AAPL at" })).toHaveCount(prior + 1);
```
Take `prior` after the first `chat-toggle` click so the loaded history is already rendered. Alternatively add the same `test.skip` guard as in `portfolio-charts.spec.ts`.

### WR-02: Broken-start check can pass vacuously and does not prove the cause

**File:** `test/persist.mjs:59-63, 117-124`
**Issue:** `runScript` ignores `run.error`. If the shell cannot be spawned (missing `bash`/`powershell`), `spawnSync` returns `status: null` and `stdout: null`. `check(run.status !== 0, ...)` then passes because `null !== 0`, and the "no URL printed" check passes on an empty string. The check also passes for any non-zero exit, for example Docker stopped or a build failure, not only the "cannot become healthy" case that `compose.broken.yml` exists to prove. The earlier checks (`first.status === 0`) would normally fail first on a missing shell, so the practical risk is a weak assertion rather than a false pass in the common path.
**Fix:** Fail loudly on spawn errors in `runScript`, and tie the broken-start check to the container state:
```js
const run = spawnSync(cmd, args, { cwd: ROOT, env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
if (run.error) throw new Error(`persist: cannot run ${cmd}: ${run.error.message}`);
```
and in `assertBrokenStartFails`, additionally assert the service is not running healthy, for example `compose(["ps", "--status", "running", "-q"]).stdout.trim() === ""` (the container exits on the bad `SIM_SEED`).

### WR-03: `zz-reconnect` leaves a possibly-rejecting `waitForRequest` promise unattended

**File:** `test/zz-reconnect.spec.ts:47-54`
**Issue:** `refetch` is created before `docker restart` and only awaited after `expect(dot)...connected` (up to 30 s). Its own timeout is also 30 s and starts earlier. If no `/api/portfolio` refetch happens, the promise can reject while the test is still awaiting the dot, which is an unhandled rejection. Playwright may report it as a confusing secondary error that masks the real failure (stream never reconnected vs. no refetch).
**Fix:** Attach a handler immediately, or await both together:
```ts
await Promise.all([refetch, expect(dot).toHaveAttribute("data-status", "connected", { timeout: 30_000 })]);
```

## Info

### IN-01: PowerShell scripts change the caller's working directory

**File:** `scripts/start_windows.ps1:3`, `scripts/stop_windows.ps1:1`
**Issue:** `Set-Location` is session state, not script-scoped. Running `.\scripts\start_windows.ps1` from an interactive prompt leaves the user's shell in the repo root afterwards. The bash scripts do not have this effect because they run in a subshell.
**Fix:** Wrap in `Push-Location (Split-Path -Parent $PSScriptRoot)` ... `Pop-Location` (use `try/finally` so the location is restored on `exit`), or use `docker compose --project-directory`.

### IN-02: Start-script inconsistencies between platforms

**File:** `scripts/start_mac.sh:16, 22`, `scripts/start_windows.ps1:16`
**Issue:** The mac script takes the first line of `docker compose port` (`head -n1`), while the PowerShell script applies `-replace` to the whole output. If compose ever prints more than one binding, PowerShell yields an array and a malformed URL. The mac usage error is printed to stdout rather than stderr.
**Fix:** In PowerShell use `(docker compose port finally 8000 | Select-Object -First 1)`; send the usage text to stderr with `>&2`.

### IN-03: `hostHasKey` can disagree with compose's `.env` parsing

**File:** `test/persist.mjs:99-103`
**Issue:** `^OPENROUTER_API_KEY=\s*\S` treats `OPENROUTER_API_KEY=""` or `=''` as set, whereas compose parses it as empty. `assertEnvDelivery` would then fail with a misleading "disagree" message. It also ignores an `export ` prefix.
**Fix:** Strip optional quotes: `/^(?:export\s+)?OPENROUTER_API_KEY=\s*(["']?)\s*\S/m`, ensuring the first non-space char after the quote is not the closing quote, or just document the plain `KEY=value` assumption in the comment.

### IN-04: Heatmap colour assertion depends on `rgb()` computed values

**File:** `test/portfolio-charts.spec.ts:118`
**Issue:** `backgroundColor.match(/[\d.]+/g)` assumes `rgb(r, g, b)` ordering. If a theme colour is ever expressed as `oklch(...)`, `color(srgb ...)` or `color-mix(...)`, Chromium returns that form and `[r, g]` become unrelated numbers, making the check wrong or flaky. A transient `null` match would also throw on `!`.
**Fix:** Read the colour through a canvas or `page.evaluate` that normalises to rgb, or assert on a data attribute or CSS class that the component already sets for the up/down state.

### IN-05: Duplicated helpers and a Windows `bash` ambiguity in the e2e drivers

**File:** `test/e2e.mjs:16-34`, `test/persist.mjs:22-25, 91-96`, `test/persist.mjs:11, 46`
**Issue:** `assertMockPins`, the `compose` wrapper and the SIGINT/SIGTERM handling are near-copies in both drivers; a change to one (for example the pin list) must be repeated in the other. Separately, on Windows `spawnSync("bash")` resolves via `PATH`, and `C:\Windows\System32\bash.exe` (WSL) often precedes Git Bash, so `PERSIST_SHELL=bash` may run the `.sh` scripts in a WSL distro that has no Docker. The README only says "through Git Bash".
**Fix:** Extract the shared pieces into `test/lib.mjs`. For bash, allow an explicit path (`PERSIST_BASH=C:\Program Files\Git\bin\bash.exe`) or document the PATH requirement in the README.

---

_Reviewed: 2026-10-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
