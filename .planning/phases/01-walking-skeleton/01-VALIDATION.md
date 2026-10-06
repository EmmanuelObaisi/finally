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

Requirement-level commands mapped to plan tasks. The exact `<automated>` commands and their `<fails_when>` statements live in each PLAN.md task.

| Requirement | Task(s) | Test Type | Automated Command (summary) | File Exists | Status |
|-------------|---------|-----------|-----------------------------|-------------|--------|
| FND-01 | 01-01 T1, T2 | shell | `git ls-files` of the four artifact trees is empty; `git check-ignore` on build paths; `frontend/src/lib/api.ts` not ignored; `git check-attr eol` reports `eol: lf` for each of the three paths; second untrack is a no-op | ❌ W0 | ⬜ pending |
| FND-02 | 01-03 T2, T3 | unit | `uv run --directory backend python -m pytest -q` (no warning section) | ❌ W0 `tests/test_health.py` | ⬜ pending |
| FND-03 | 01-04 T2, T3 | build | `npm --prefix frontend run build`; `frontend/out/index.html` has `app-title`; built CSS has `0d1117`, `ecad0a`, `209dd7`; tsconfig stable across rebuilds | ❌ W0 | ⬜ pending |
| FND-04 | 01-02 T1, T2 | grep | every endpoint path, `change_percent`, `session_start_price` present in `planning/API_CONTRACT.md`; no legacy field names under `planning/` | ❌ W0 | ⬜ pending |
| FND-05 | 01-03 T3 (01-01 T2 for `.env.example`) | unit | `uv run --directory backend python -m pytest -q` (includes `tests/test_config.py`) | ❌ W0 `tests/test_config.py` | ⬜ pending |
| FND-06 | 01-02 T2 (CLAUDE.md), 01-05 T3 (README.md) | grep | stale-claim greps on CLAUDE.md and README.md are empty; README names `uv run python -m pytest`, the smoke command, `docker build`, the contract | n/a | ⬜ pending |
| PORT-08 | 01-03 T2; 01-05 T3 | unit + live | `tests/test_health.py`; live uvicorn on :8765 answers `{"status":"ok"}`; container health status `healthy` | ❌ W0 | ⬜ pending |
| PKG-01 | 01-05 T2, T3 | docker | image Cmd has `"--workers","1"`, Env has `DB_PATH`; no verification-disabling token in Dockerfile; container serves page + health, one uvicorn process; no Avast material or `.env` in the image | ❌ W0 `Dockerfile`, `.dockerignore` | ⬜ pending |
| SC4 smoke | 01-05 T1 (local), T3 (container) | e2e | `npm --prefix test run smoke`; `BASE_URL=http://localhost:8000 npm --prefix test run smoke` | ❌ W0 `playwright.config.ts`, `smoke.spec.ts` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/pyproject.toml`, `uv.lock`, `backend/app/`, `backend/tests/test_health.py`, `backend/tests/test_config.py`
- [ ] `frontend/` scaffold (package.json, lockfile, next/postcss/tsconfig, `src/app/*`)
- [ ] `test/package.json` + lockfile + `playwright.config.ts` + `smoke.spec.ts`
- [ ] `Dockerfile`, `.dockerignore`, `.env.example`, `.gitattributes`, `db/.gitkeep`, `planning/API_CONTRACT.md`
- [ ] Docker Desktop running before 01-05 Task 2 (per CONTEXT D-04 the user starts it; no checkpoint, the task `<precondition>` halts if `docker info` fails)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Docker Desktop running | PKG-01 | Starting the daemon is a human action (CONTEXT D-04: done before execution, no checkpoint) | 01-05 Task 2 `<precondition>`: `docker info` exits 0 with a "Server Version" line |
| Approve new third-party packages | FND-02, FND-03 | Package legitimacy flagged several as SUS (too new) | Blocking-human checkpoints 01-03 Task 1 (PyPI) and 01-04 Task 1 (npm), one per ecosystem |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
