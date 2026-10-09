---
phase: "6"
slug: "one-command-launch-full-verification"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| (filled by planner) | | | PKG-02 | — | Volume persists trades, positions, chat across stop/start | script | `npm --prefix test run persist` | ❌ W0 | ⬜ pending |
| (filled by planner) | | | PKG-03 | — | Scripts idempotent; compose file valid | script | `docker compose config -q` + `npm --prefix test run persist` | ❌ W0 | ⬜ pending |
| (filled by planner) | | | PKG-04 | loopback publish | One command prints and serves the URL on 127.0.0.1 | script | `npm --prefix test run persist` | ❌ W0 | ⬜ pending |
| (filled by planner) | | | PUI-08 | — | Every hook the specs use resolves | E2E | `npm --prefix test run e2e` | ❌ W0 | ⬜ pending |
| (filled by planner) | | | TEST-04 | — | API route status codes, shapes, errors | unit | `uv run --directory backend python -m pytest -q` | ✅ | ⬜ pending |
| (filled by planner) | | | TEST-05 | — | Frontend §12 unit bullets | unit | `npm --prefix frontend test` | ✅ | ⬜ pending |
| (filled by planner) | | | TEST-06 | mock pinned | Every §12 E2E scenario against the container, LLM_MOCK=true | E2E | `npm --prefix test run e2e` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `docker-compose.yml`, `scripts/start_mac.sh`, `scripts/stop_mac.sh`, `scripts/start_windows.ps1`, `scripts/stop_windows.ps1` — PKG-02/03/04
- [ ] `test/compose.e2e.yml`, `test/e2e.mjs`, `test/package.json` scripts `e2e` and `persist` — TEST-06
- [ ] `test/persist.mjs` — PKG-02 persistence across stop/start
- [ ] `test/portfolio-charts.spec.ts` — lift the two `BASE_URL` skips when `E2E_FRESH_DB` is set
- [ ] `test/trade-sell.spec.ts`, `test/trade-chat.spec.ts`, `test/zz-reconnect.spec.ts`, optional `test/hooks.spec.ts`
- [ ] TEST-04 / TEST-05 audit matrix; tests only for rows proven uncovered
- Framework install: none needed

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Browser auto-open from start script | PKG-04 | Opens a desktop browser window | Run `scripts/start_windows.ps1` without `-NoOpen`; confirm a browser opens at the printed URL |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
