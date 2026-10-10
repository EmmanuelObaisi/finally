---
phase: 06-one-command-launch-full-verification
verified: 2026-10-10T04:45:00Z
status: human_needed
score: 4/4 roadmap success criteria verified by automation (1 has a manual-only tail); 12/12 plan truths verified
covered_files:
  - ".planning/phases/06-one-command-launch-full-verification/06-01-PLAN.md"
  - ".planning/phases/06-one-command-launch-full-verification/06-01-SUMMARY.md"
  - ".planning/phases/06-one-command-launch-full-verification/06-02-PLAN.md"
  - ".planning/phases/06-one-command-launch-full-verification/06-02-SUMMARY.md"
  - ".planning/phases/06-one-command-launch-full-verification/06-03-PLAN.md"
  - ".planning/phases/06-one-command-launch-full-verification/06-03-SUMMARY.md"
  - ".planning/phases/06-one-command-launch-full-verification/06-04-PLAN.md"
  - ".planning/phases/06-one-command-launch-full-verification/06-04-SUMMARY.md"
  - ".planning/phases/06-one-command-launch-full-verification/06-05-PLAN.md"
  - ".planning/phases/06-one-command-launch-full-verification/06-05-SUMMARY.md"
  - "README.md"
  - "backend/tests/test_chat.py"
  - "backend/tests/test_history.py"
  - "docker-compose.yml"
  - "scripts/start_mac.sh"
  - "scripts/start_windows.ps1"
  - "scripts/stop_mac.sh"
  - "scripts/stop_windows.ps1"
  - "test/compose.e2e.yml"
  - "test/e2e.mjs"
  - "test/persist.mjs"
  - "test/portfolio-charts.spec.ts"
  - "test/trade-chat.spec.ts"
  - "test/trade-sell.spec.ts"
  - "test/zz-reconnect.spec.ts"
covered_digest: "v3:sha256:ee3323d5ad246668417d9a81025b5a937e3cafd38d70bc38f59f840990edeed0"
behavior_unverified: 0
overrides_applied: 0
re_verification: false
human_verification:
  - test: "On Windows PowerShell at the repo root with nothing else on port 8000, run `.\\scripts\\start_windows.ps1 -Build`, then `.\\scripts\\start_windows.ps1` again, buy one share, run `.\\scripts\\stop_windows.ps1`, run `docker volume ls`, then start again."
    expected: "First start builds, prints 'FinAlly is running at http://localhost:8000' and opens the default browser on the live terminal (prices streaming, dot green). Second start prints the same URL with no restart. After stop, `finally_finally-data` is still listed. After the last start the bought position and cash are unchanged."
    why_human: "Opens a desktop browser on the user's own default project and port, which automated checks must never touch (D-01, D-11). Browser auto-open (PKG-04) and the default-port path are the only parts not exercised."
  - test: "(Optional) Run scripts/start_mac.sh and stop_mac.sh on real macOS or Linux."
    expected: "Same behavior as the Windows pair, including `open`/`xdg-open`."
    why_human: "The .sh pair was exercised only through Git Bash on Windows (06-04-SUMMARY assumption A5). Real macOS/Linux behavior is not available here."
gaps: []
advisory:
  - finding: "backend/tests/test_chat.py::test_llm_failure_no_leak_in_body_or_log is intermittently red"
    category: other
    reason: "Failed once in four full backend runs by this verifier (329 passed on the three other runs and in isolation). Its assertion `\"401\" not in response.text` scans the whole chat body, which includes watchlist `timestamp` floats from time.time(); a 3-digit '401' can occur by chance. Cause inferred from code, not reproduced. The test predates Phase 6 (added in 05-02)."
    evidence_status: "one observed failure; cause not proven"
---

# Phase 6: One-Command Launch & Full Verification Report

**Phase Goal:** A user launches FinAlly with one command, and every PLAN.md section 12 unit and E2E scenario passes against the running container.
**Verified:** 2026-10-10
**Status:** human_needed
**Re-verification:** No (initial verification)

Automated evidence is complete and green. The one remaining item is the plan's own end-of-phase human check: the real launch on the default project and port 8000, which opens a desktop browser on the user's own app and was deliberately kept out of automation.

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Start script or `docker compose up` builds the image if needed, starts the container, prints `http://localhost:8000`; running again is harmless | VERIFIED (browser open is manual) | `scripts/start_windows.ps1` and `scripts/start_mac.sh` run `docker compose up -d --wait` (+`--build` on flag), read the real port with `docker compose port finally 8000`, print `FinAlly is running at http://localhost:<port>`. `npm --prefix test run persist` (re-run by this verifier, both `powershell` and `bash`) asserted the printed URL, `/api/health` 200, second start keeps the same container id and URL, and a broken start exits non-zero with no URL. Default port is 8000 via `${FINALLY_PORT:-8000}`. |
| 2 | Trades, positions and chat history survive stop/start; stop removes the container, keeps the volume; `.env` reaches the container | VERIFIED | `docker-compose.yml` mounts `finally-data:/app/db`, pins `DB_PATH: /app/db/finally.db`, `env_file` (optional). `persist.mjs` (re-run, both shells): cash, per-ticker quantities and every chat message id identical after real stop/start; `finally-persist_finally-data` still present after stop; second stop exits 0; `OPENROUTER_API_KEY` present in container iff in root `.env` (boolean only). Stop scripts run `docker compose down` with no `-v`. |
| 3 | Host Playwright against the container with `LLM_MOCK=true` passes every section 12 scenario via stable `data-testid` hooks | VERIFIED | `npm --prefix test run e2e` re-run by this verifier: "e2e summary: passed 20, skipped 0, failed 0, flaky 0", exit 0, clean teardown. Wrapper proves `LLM_MOCK=true` and empty `MASSIVE_API_KEY` inside the container first. Scenario-to-spec map in 06-TEST-AUDIT.md matches the specs I read (fresh start, add/remove, buy, sell, heatmap colour and area ratio, P&L chart points, mock chat buy/failed/restored history/sell back, real `docker restart` reconnect). Hook audit: 54 distinct ids, none missing. |
| 4 | Backend API route tests and frontend unit tests all pass | VERIFIED with a flaky-test advisory | Frontend: `npx vitest run` 345 passed (26 files). Backend: `uv run python -m pytest -q` 329 passed on 3 of 4 full runs; one run had 1 failure (see Advisory). TEST-04 matrix covers every endpoint plus 404/400/500 rules; TEST-05 matrix maps each section 12 frontend bullet to named tests. |

**Score:** 4/4 success criteria verified (criterion 1 retains a manual browser-open tail). 0 truths PRESENT_BEHAVIOR_UNVERIFIED.

### Plan must-haves spot-checked against code

| Truth (plan) | Status | Evidence |
|--------------|--------|----------|
| Loopback-only publish (06-01 prohibition) | VERIFIED | `docker-compose.yml` single port entry `127.0.0.1:${FINALLY_PORT:-8000}:8000` |
| Literal DB_PATH beats empty `.env` value | VERIFIED | `environment: DB_PATH: /app/db/finally.db`; persistence across restart proven |
| Mock pins override shell and `.env`; separate image tag | VERIFIED | `test/compose.e2e.yml` literals + `image: finally-e2e`; in-container proof in both drivers |
| Docker-not-running message and non-zero exit | VERIFIED by reading | Both start scripts print the exact message and exit 1; not run (Docker is up) |
| e2e wrapper always tears down, fails on skipped/flaky/failed/zero-passed | VERIFIED | `test/e2e.mjs` `finally { down -v }` and exit rule at the summary line; observed clean teardown |
| Reconnect against a real server drop (behavior-dependent) | VERIFIED | `zz-reconnect.spec.ts` ran green in the container: MutationObserver sees a non-connected status, final `connected`, window marker intact (no reload), `/api/portfolio` refetch awaited, AAPL ticks again, cash/total unchanged. Behavioral test exists and passed, so not PRESENT_BEHAVIOR_UNVERIFIED. |
| Prohibition: never touch the user's data/images | VERIFIED (test-tier, evidence) | Image id list (`finally:*`) and volume list identical before and after my e2e + persist (both shells) runs; every teardown uses explicit `-p finally-test` / `finally-persist`. |
| Prohibition: no real OpenRouter/Massive call in automated runs | VERIFIED (test-tier, evidence) | Pins asserted inside container before any chat call in e2e and persist; backend chat tests use `mock_client`. |
| README Run and Testing sections | VERIFIED | README documents `--no-open`/`-NoOpen`, `FINALLY_PORT`, optional `.env`, `docker compose down -v`, `Unblock-File` |
| Scripts are executable and LF | VERIFIED | git mode 100755 for both `.sh` files |

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `docker-compose.yml` | VERIFIED | Substantive, wired by all four scripts and both drivers |
| `test/compose.e2e.yml`, `test/compose.broken.yml` | VERIFIED | Layered by e2e/persist; broken override exercised (non-zero exit, no URL) |
| `scripts/start_*.{ps1,sh}`, `scripts/stop_*.{ps1,sh}` | VERIFIED | Real implementations, driven by persist.mjs |
| `test/e2e.mjs`, `test/persist.mjs`, `test/package.json` scripts | VERIFIED | Ran green |
| `test/zz-reconnect.spec.ts`, `trade-sell.spec.ts`, `trade-chat.spec.ts`, `portfolio-charts.spec.ts` | VERIFIED | Substantive assertions (deltas, colour channel check, restored history) |
| `backend/tests/test_chat.py`, `test_history.py` shape tests | VERIFIED | In the green 329 |
| `06-TEST-AUDIT.md` | VERIFIED | TEST-04, TEST-05, TEST-06, PUI-08 sections present |

### Key Links

| From | To | Status |
|------|----|--------|
| start scripts to `docker-compose.yml` | WIRED (`docker compose up -d --wait`, `compose port finally 8000`) |
| `compose.e2e.yml` to base compose | WIRED (layered by `-f` in e2e.mjs, `COMPOSE_FILE` in persist.mjs) |
| `e2e.mjs` to Playwright | WIRED (`BASE_URL`, `E2E_FRESH_DB`, `E2E_CONTAINER`, JSON stats gate) |
| `zz-reconnect.spec.ts` to `E2E_CONTAINER` | WIRED (`docker restart` of that id only; spec skipped without it) |
| `persist.mjs` to real scripts and API | WIRED (spawns the real scripts; fetches portfolio and chat history) |

### Data-Flow Trace (Level 4)

Not applicable to new artifacts (scripts, compose, tests). Data flow of the UI was verified in Phases 2-5; the E2E run exercises it end to end against real container data (trade to cash to position to heatmap).

### Behavioral Spot-Checks and Probes

| Behavior | Command (run by verifier) | Result | Status |
|----------|---------------------------|--------|--------|
| Container E2E, section 12 scenarios | `npm --prefix test run e2e` | passed 20, skipped 0, failed 0, flaky 0 | PASS |
| Persistence and launch, PowerShell | `npm --prefix test run persist` | all checks passed (powershell) | PASS |
| Persistence and launch, bash | `PERSIST_SHELL=bash npm --prefix test run persist` | all checks passed (bash) | PASS |
| Frontend units | `npx vitest run` (frontend/) | 345 passed | PASS |
| Backend units | `uv run python -m pytest -q` (backend/), 4 runs | 329 passed x3; 1 failed + 328 passed x1 | PASS with advisory |
| User state untouched | image ids and volume list diffed before/after | identical | PASS |

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|-------------|-------------|--------|----------|
| PKG-02 (named volume at /app/db; `.env` reaches container) | 06-01, 06-04 | SATISFIED | Volume mount + literal DB_PATH; persist proves data survives; env_file delivery checked. Implemented via compose `env_file` rather than the literal `--env-file` flag; REQUIREMENTS wording is met in effect. |
| PKG-03 (compose + four idempotent wrappers) | 06-01, 06-04 | SATISFIED | All four scripts exist; second start/stop proven harmless; volume kept |
| PKG-04 (one command, open localhost:8000) | 06-01, 06-04 | SATISFIED for launch/URL; browser auto-open needs human check | See Human Verification |
| PUI-08 (stable data-testid hooks for E2E) | 06-03 | SATISFIED | 54 hook ids used by specs, none missing in `frontend/src`; E2E green |
| TEST-04 (backend API route tests) | 06-05 | SATISFIED | TEST-04 matrix, shape tests added, suite green |
| TEST-05 (frontend unit tests) | 06-05 | SATISFIED | TEST-05 matrix, 345 passing tests |
| TEST-06 (Playwright E2E against container, LLM_MOCK=true) | 06-02, 06-03 | SATISFIED | 20/20, 0 skipped |

All seven phase requirement IDs appear in plan frontmatter and in REQUIREMENTS.md (traceability rows marked Phase 6). No orphaned requirements.

### Anti-Patterns Found

No `TBD`/`FIXME`/`XXX` markers in any phase-modified file. No stubs. Code review (06-REVIEW.md): 0 critical, 3 warnings, 5 info. I weighed the warnings against the must-haves and none undermines one:

| Finding | Effect on must-haves |
|---------|----------------------|
| WR-01 trade-chat count assumes a fresh DB | Official `e2e` always starts from a fresh volume and `smoke` uses a temp DB, so TEST-06 holds. Would fail only if the spec is pointed at a long-lived app manually. Warning. |
| WR-02 broken-start check could pass vacuously if a shell cannot spawn | The earlier `first.status === 0` check would fail first; the check was observed to run properly in both shells. Warning (weak assertion). |
| WR-03 unattended `waitForRequest` promise | Possible confusing secondary error only on a failing run; passes reliably. Warning. |
| IN-01..IN-05 | Cosmetic or robustness; IN-01 (Set-Location leaves the caller's shell in the repo root) is harmless. |

All eight review dispositions are still `open` in 06-REVIEW-DISPOSITION.md.

### Deferred Items

None. No later milestone phase is relevant to any open item.

### Advisory (unevidenced, non-blocking)

| # | Finding | Why advisory |
|---|---------|--------------|
| 1 | `test_chat.py::test_llm_failure_no_leak_in_body_or_log` failed once in 4 full backend runs; passes in isolation and on the other full runs | The assertion `"401" not in response.text` checks a body that includes watchlist `timestamp` floats (`time.time()`); a chance '401' substring is the likely cause. Not reproduced and the exact failing assertion line was not captured. Test predates Phase 6. Suggested hardening: assert on the error message field, not the whole body. |

### Human Verification Required

#### 1. Real launch on the default project and port

**Test:** On Windows PowerShell at the repo root, with nothing else on port 8000: `.\scripts\start_windows.ps1 -Build`; run it again; buy one share in the trade bar; `.\scripts\stop_windows.ps1`; `docker volume ls`; start again.
**Expected:** The first start builds, prints `FinAlly is running at http://localhost:8000` and opens the browser on the live terminal. The second start prints the same URL. After stop, `finally_finally-data` is listed. After the last start the position and cash are unchanged.
**Why human:** It opens the user's desktop browser on their own default project and port, which automated checks must never touch.

#### 2. (Optional) Real macOS/Linux run of `start_mac.sh` / `stop_mac.sh`

**Test:** Run both scripts on a real macOS or Linux host.
**Expected:** Same behavior as Windows, including `open` / `xdg-open`.
**Why human:** Only exercised through Git Bash on Windows.

### Gaps Summary

No gaps. Every roadmap success criterion and every plan must-have was verified against the code and re-run evidence: 20/20 container E2E, persistence in both shells, 345 frontend tests, 329 backend tests (with one intermittent pre-existing flake noted above). Status is `human_needed` solely because of the plan's own deferred end-of-phase human check (real launch with browser auto-open on port 8000).

---

_Verified: 2026-10-10_
_Verifier: Claude (gsd-verifier)_
