---
phase: "6"
slug: "one-command-launch-full-verification"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-09"
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.1.1 (backend), Vitest 5.0.3 + RTL (frontend), @playwright/test 1.63.0 (E2E) |
| **Config file** | `backend/pyproject.toml`, `frontend/vitest.config.ts`, `test/playwright.config.ts` |
| **Quick run command** | `uv run --directory backend python -m pytest -q` / `npm --prefix frontend test` / `npm --prefix test run smoke` |
| **Full suite command** | the three quick commands plus `npm --prefix test run e2e` plus `npm --prefix test run persist` |
| **Estimated runtime** | ~32 s backend, ~11 s frontend, ~20 s local E2E; container E2E and persist add image build + `--wait` |

---

## Sampling Rate

- **After every task commit:** Run the narrow command for the touched area (one pytest file, one Vitest file, or `npm --prefix test run smoke` for spec edits)
- **After every plan wave:** Run backend + frontend suites + `npm --prefix test run smoke`
- **Before `/gsd-verify-work`:** `npm --prefix test run e2e` green with zero skipped tests, `npm --prefix test run persist` green, backend and frontend suites green
- **Max feedback latency:** 60 seconds for per-task commands

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-T1 | 01 | 1 | PKG-02, PKG-03, PKG-04 | T-06-01, T-06-03, T-06-04 | Loopback-only publish; mock pins beat a hostile shell and .env; missing .env does not block; user volumes and images unchanged | script | `docker compose config` checks + live start/stop of `start_windows.ps1`/`stop_windows.ps1` under project finally-probe06 on :8011 | ✅ | ✅ green |
| 06-01-T2 | 01 | 1 | PKG-03 | T-06-04 | bash pair: second start keeps the container, second stop harmless, volume kept; mode 100755 LF | script | `bash scripts/start_mac.sh --no-open` x2 + `stop_mac.sh` x2 under finally-probe06 on :8012 | ✅ | ✅ green |
| 06-01-T3 | 01 | 1 | PKG-04 | — | README Run section; no test trades suggested against the user's app | doc | grep checks on README.md | ✅ | ✅ green |
| 06-05-T1 | 05 | 1 | TEST-04 | T-06-13 | Route matrix complete; chat history and portfolio history key sets asserted over HTTP; no db/ residue | unit | `uv run --directory backend python -m pytest -q` | ✅ | ✅ green |
| 06-05-T2 | 05 | 1 | TEST-05 | — | Frontend §12 matrix with rounding and threshold tests cited | unit | `npm --prefix frontend test` | ✅ | ✅ green |
| 06-02-T1 | 02 | 2 | TEST-06 | T-06-05, T-06-06, T-06-07 | LLM_MOCK=true and empty MASSIVE_API_KEY proven inside the container; 17 passed, 0 skipped; no leftovers; user data unchanged | E2E | `npm --prefix test run e2e` + `npm --prefix test run smoke` | ✅ | ✅ green |
| 06-02-T2 | 02 | 2 | TEST-06 | T-06-05 | Failed startup (port taken) exits non-zero with nothing left; dirty leftover project cleaned by pre-clean | script | e2e with 127.0.0.1:8001 occupied; e2e after a dirty finally-test project | ✅ | ✅ green |
| 06-03-T1 | 03 | 3 | TEST-06 | T-06-08 | Real `docker restart` of E2E_CONTAINER only; reconnect without reload; data intact | E2E | `npm --prefix test run e2e` + `npm --prefix test run smoke` | ✅ | ✅ green |
| 06-03-T2 | 03 | 3 | TEST-06 | T-06-09 | Sell cash delta; heatmap hue follows P&L | E2E | `npm --prefix test run smoke` | ✅ | ✅ green |
| 06-03-T3 | 03 | 3 | TEST-06, PUI-08 | T-06-08 | Mocked chat with inline trade; every spec hook exists; user data unchanged | E2E | hook audit (`node -e ...`) + `npm --prefix test run e2e` + `npm --prefix test run smoke` | ✅ | ✅ green |
| 06-04-T1 | 04 | 4 | PKG-02, PKG-04 | T-06-10, T-06-12 | Trade, chat and cash survive real stop/start; private project; user data unchanged | script | `npm --prefix test run persist` | ✅ | ✅ green |
| 06-04-T2 | 04 | 4 | PKG-02, PKG-03 | T-06-11 | Idempotent wrappers; .env delivery checked without printing the key; broken start exits non-zero | script | `npm --prefix test run persist` + `PERSIST_SHELL=bash npm --prefix test run persist` | ✅ | ✅ green |
| 06-04-T3 | 04 | 4 | all phase requirements | — | Full phase gate | gate | backend suite, frontend suite + build + smoke, e2e, persist (both shells) | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `docker-compose.yml`, `scripts/start_mac.sh`, `scripts/stop_mac.sh`, `scripts/start_windows.ps1`, `scripts/stop_windows.ps1` — PKG-02/03/04
- [x] `test/compose.e2e.yml`, `test/e2e.mjs`, `test/package.json` scripts `e2e` and `persist` — TEST-06
- [x] `test/persist.mjs` — PKG-02 persistence across stop/start
- [x] `test/portfolio-charts.spec.ts` — lift the two `BASE_URL` skips when `E2E_FRESH_DB` is set
- [x] `test/trade-sell.spec.ts`, `test/trade-chat.spec.ts`, `test/zz-reconnect.spec.ts`, optional `test/hooks.spec.ts`
- [x] TEST-04 / TEST-05 audit matrix; tests only for rows proven uncovered
- Framework install: none needed

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Browser auto-open and real launch on the default project and port | PKG-04 | Opens a desktop browser on the user's own app, which automated checks must never touch | Plan 06-04 Task 3 human-check: `.\scripts\start_windows.ps1 -Build`, start again, buy a share, stop, `docker volume ls` shows finally_finally-data, start again and the position is still there |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-10 (validate-phase audit: backend 329 passed, frontend 345 passed, e2e 20 passed 0 skipped, persist passed)

## Validation Audit 2026-10-10

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
