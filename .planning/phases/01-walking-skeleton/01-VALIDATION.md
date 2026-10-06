---
phase: "1"
slug: "walking-skeleton"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-06"
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.1.1 (backend), `next build` (frontend), @playwright/test 1.63.0 (host smoke), shell/git/grep checks |
| **Config file** | `backend/pyproject.toml`, `test/playwright.config.ts` (none yet; Wave 0 creates them) |
| **Quick run command** | `cd backend && uv run python -m pytest -q` |
| **Full suite command** | quick run + `cd frontend && npm run build` + Docker verification block (01-RESEARCH.md Docker section) + `cd test && BASE_URL=http://localhost:8000 npx playwright test` |
| **Estimated runtime** | ~10 seconds quick; ~3-5 minutes full (Docker build dominates) |

---

## Sampling Rate

- **After every task commit:** Run the single command for the touched area (pytest, `npm run build`, or the FND-01/04/06 shell checks)
- **After every plan wave:** Backend pytest + frontend build + FND-01/04/06 shell checks
- **Before `/gsd-verify-work`:** Full suite must be green, including the Docker block and the Playwright smoke test
- **Max feedback latency:** 30 seconds (excluding Docker build)

---

## Per-Task Verification Map

Task IDs are filled in by the planner. Requirement-level commands:

| Requirement | Test Type | Automated Command | File Exists | Status |
|-------------|-----------|-------------------|-------------|--------|
| FND-01 | shell | `test -z "$(git ls-files backend/static test/node_modules test/playwright-report test/test-results)" && git check-ignore -q backend/static/x && git check-ignore -q test/node_modules/x && ! git check-ignore -q frontend/src/lib/api.ts` plus `git check-attr eol -- scripts/start_mac.sh Dockerfile .env.example` showing `eol: lf` x3 | ❌ W0 | ⬜ pending |
| FND-02 | unit | `cd backend && uv run python -m pytest -q` | ❌ W0 `tests/test_health.py` | ⬜ pending |
| FND-03 | build | `cd frontend && npm ci && npm run build && test -f out/index.html` | ❌ W0 | ⬜ pending |
| FND-04 | grep | every endpoint path + `change_percent` present in `planning/API_CONTRACT.md`; `! grep -rn "day_change_percent\|reference_price" planning backend/app frontend/src` | ❌ W0 | ⬜ pending |
| FND-05 | unit | `cd backend && uv run python -m pytest -q tests/test_config.py` | ❌ W0 `tests/test_config.py` | ⬜ pending |
| FND-06 | grep | `! grep -n -i -E "market_data_demo\|MARKET_DATA_SUMMARY\|planning/archive" README.md CLAUDE.md` | n/a | ⬜ pending |
| PORT-08 | unit + live | `cd backend && uv run python -m pytest -q tests/test_health.py`; `curl -fsS localhost:8000/api/health` | ❌ W0 | ⬜ pending |
| PKG-01 | docker | `docker build -t finally .` then `docker run -d -p 8000:8000 finally`, `curl -fsS localhost:8000/api/health`, `curl -fsS localhost:8000/ \| grep -q app-title`, `docker history finally \| grep -ci avast` = 0 | ❌ W0 `Dockerfile`, `.dockerignore` | ⬜ pending |
| SC4 smoke | e2e | `cd test && BASE_URL=http://localhost:8000 npx playwright test` | ❌ W0 `playwright.config.ts`, `smoke.spec.ts` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/pyproject.toml`, `uv.lock`, `backend/app/`, `backend/tests/test_health.py`, `backend/tests/test_config.py`
- [ ] `frontend/` scaffold (package.json, lockfile, next/postcss/tsconfig, `src/app/*`)
- [ ] `test/package.json` + lockfile + `playwright.config.ts` + `smoke.spec.ts`
- [ ] `Dockerfile`, `.dockerignore`, `.env.example`, `.gitattributes`, `db/.gitkeep`, `planning/API_CONTRACT.md`
- [ ] Docker Desktop started (human action) before any PKG-01 task

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Docker Desktop running | PKG-01 | Daemon is not started; starting it is a human action | Start Docker Desktop, confirm `docker version` shows a Server section |
| Approve new third-party packages | FND-02, FND-03 | Package legitimacy flagged several as SUS (too new) | Review the batched package list at the human-verify checkpoint before first install |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
