---
phase: 01-walking-skeleton
verified: 2026-10-07T23:30:00Z
status: gaps_found
score: 6/7 must-haves verified
covered_files:
  - ".dockerignore"
  - ".env.example"
  - ".gitattributes"
  - ".gitignore"
  - ".planning/phases/01-walking-skeleton/01-01-PLAN.md"
  - ".planning/phases/01-walking-skeleton/01-01-SUMMARY.md"
  - ".planning/phases/01-walking-skeleton/01-02-PLAN.md"
  - ".planning/phases/01-walking-skeleton/01-02-SUMMARY.md"
  - ".planning/phases/01-walking-skeleton/01-03-PLAN.md"
  - ".planning/phases/01-walking-skeleton/01-03-SUMMARY.md"
  - ".planning/phases/01-walking-skeleton/01-04-PLAN.md"
  - ".planning/phases/01-walking-skeleton/01-04-SUMMARY.md"
  - ".planning/phases/01-walking-skeleton/01-05-PLAN.md"
  - ".planning/phases/01-walking-skeleton/01-05-SUMMARY.md"
  - "CLAUDE.md"
  - "Dockerfile"
  - "README.md"
  - "backend/app/config.py"
  - "backend/app/errors.py"
  - "backend/app/main.py"
  - "frontend/next.config.ts"
  - "frontend/src/app/page.tsx"
  - "frontend/src/lib/api.ts"
  - "planning/API_CONTRACT.md"
  - "test/playwright.config.ts"
  - "test/smoke.spec.ts"
covered_digest: "v3:sha256:ea4219b8e6c27ab79927de8ca3c706c63a0c4dfefb7ff8c540c44376b71fe9c4"
behavior_unverified: 1
overrides_applied: 0
gaps:
  - truth: "SC2 / FND-05: the backend reads config from env and the project-root .env (SIM_EVENT_PROBABILITY and the rest) and the app starts and answers GET /api/health with 200"
    status: failed
    reason: "The committed .env.example ships `SIM_EVENT_PROBABILITY=` (empty). python-dotenv and Docker -e/--env-file set it to the empty string, os.environ.get's default is then not applied, and float('') raises ValueError in Settings.from_env(), so the app never starts. Reproduced twice: dotenv-loading .env.example then Settings.from_env(), and inside the built image with `-e SIM_EVENT_PROBABILITY=` (ValueError: could not convert string to float: ''). The other empty-by-default variables (SIM_SEED, DB_PATH, STATIC_DIR) are handled; only this one is not. The 9 passing tests miss it because clean_env deletes the variable instead of setting it to ''."
    artifacts:
      - path: "backend/app/config.py"
        issue: "line 33: float(os.environ.get('SIM_EVENT_PROBABILITY', '0.001')) crashes on empty string"
      - path: ".env.example"
        issue: "line 6 `SIM_EVENT_PROBABILITY=` is the trigger; PLAN.md documents .env.example as the committed template for .env"
    missing:
      - "Treat empty SIM_EVENT_PROBABILITY as the default: float(os.environ.get('SIM_EVENT_PROBABILITY', '').strip() or '0.001')"
      - "Test that sets SIM_EVENT_PROBABILITY, SIM_SEED, DB_PATH to '' and asserts defaults (regression for CR-01)"
deferred: []
behavior_unverified_items:
  - truth: "An interrupted docker build can be re-run without manual cleanup and yields an image that passes the same checks, with no CA material baked in (backstop, insufficient_spec)"
    test: "Start `docker build -t finally:int .` and kill it mid-build (e.g. during the uv sync or npm ci step), then re-run the same command"
    expected: "Second build completes with exit 0 with no manual cleanup; resulting image passes /api/health and has no CA material (docker history has no extra_ca/avast/BEGIN CERTIFICATE)"
    why_human: "Not exercised by any test or by the executor (recorded human_judgment: true in 01-05-SUMMARY). My re-build was fully cached (10s) and so is not evidence of interrupt recovery."
human_verification:
  - test: "Interrupt a docker build mid-way and re-run it"
    expected: "Re-run succeeds and image is clean"
    why_human: "Backstop truth; no test exercises it"
  - test: "Judgment prohibitions (see Prohibitions table): confirm no interception root is committed/baked, TLS verification never disabled, README makes no unbuilt claims"
    expected: "Confirm the LLM-judge verdicts below (all non-authoritative)"
    why_human: "Judgment-tier prohibitions are NON-AUTHORITATIVE; unverified-prohibition - human review recommended"
---

# Phase 1: Walking Skeleton Verification Report

**Phase Goal:** A developer can build and run an end-to-end skeleton of FinAlly on this machine (local and in Docker) against one frozen API/SSE contract
**Verified:** 2026-10-07T23:30:00Z
**Status:** gaps_found
**Re-verification:** No - initial verification

## Goal Achievement

The skeleton builds and runs locally and in Docker, and the contract exists. One real defect defeats the "picks up the project-root .env" half of Success Criterion 2 for the project's own template (CR-01); it is a one-line fix. Everything else in the five roadmap Success Criteria is verified by direct execution.

### Observable Truths (ROADMAP Success Criteria are the contract)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: `backend/static/` and `test/node_modules/` gone from git and ignored; `.gitattributes` forces LF for `.sh`, Dockerfile, env files; README/CLAUDE.md describe the real state | VERIFIED | `git ls-files backend/static test/node_modules test/playwright-report test/test-results` = 0 entries; `git check-ignore -v` matches .gitignore:205/198/208/209; `git check-attr eol` = lf for scripts/start_mac.sh, Dockerfile, .env.example, .dockerignore; `.gitattributes` has `*.sh`, `Dockerfile`, `.env*`, `*.env` eol=lf; second `git rm --cached --ignore-unmatch -n` rc 0 and stages nothing; `frontend/src/lib/api.ts` not ignored (check-ignore rc 1); README Status lists only what exists and "Not built yet" for the rest; CLAUDE.md has no "has been completed" claim and points to API_CONTRACT.md. `.env` is ignored and untracked. |
| 2 | SC2: `uv run python -m pytest` passes in `backend/`; running locally picks up project-root `.env` (+ DB_PATH, LLM_MOCK, SIM_SEED etc.) and answers `GET /api/health` 200 | FAILED (partial) | Pytest: 9 passed. Live `uvicorn --factory app.main:create_app` on :8765 returned 200 `{"status":"ok"}`; unknown `/api/nope` returned 404 `{"error":"Not found"}`. BUT starting from the committed `.env.example` (empty `SIM_EVENT_PROBABILITY=`) crashes with ValueError (reproduced locally and in the image). See Gaps. The machine's real `.env` works only because it omits that key. |
| 3 | SC3: frontend builds a static export (`output: 'export'`) of a Tailwind dark placeholder page | VERIFIED | `npm run build` succeeded (routes `/` and `/_not-found` static); `frontend/out/index.html` has `data-testid` app-title and api-status and `bg-surface`; built CSS contains the `#0d1117`/`#ecad0a`/`#209dd7` tokens; built JS references `/api/health`. `next.config.ts` uses `output: "export"` for non-dev builds. |
| 4 | SC4: `docker build` succeeds with TLS verification on; container serves page and `/api/health` on :8000 with one worker; host Playwright smoke passes against it (or fallback recorded) | VERIFIED | `docker build` rc 0 (fully cached rebuild; summary records a cold build rc 0). Container: `/api/health` 200, `/` serves app-title/api-status, unknown `/api/zzz` 404 JSON, Docker health `healthy`, CMD has `--workers 1`, exactly one uvicorn process in /proc. Host `BASE_URL=http://localhost:8000 npm --prefix test run smoke` = 1 passed (no Playwright container needed). Local full-stack smoke (`npm --prefix test run smoke`) = 1 passed. No TLS-disabling tokens anywhere in Dockerfile/README/test/backend/frontend. |
| 5 | SC5: one API/SSE contract doc in `planning/` defines every endpoint, field names, `{"error"}` format, status codes, SSE payload (`change_percent` from session-start price) and `GET /api/chat/history`; backend and frontend reference it | VERIFIED | `planning/API_CONTRACT.md` (218 lines): conventions, PriceUpdate (`change_percent = round((price/session_start_price - 1)*100, 4)`), SSE wire format, all ten endpoints incl. `GET /api/chat/history`, error format and status codes, shared shapes, mock LLM table, empty/null cases. No legacy `day_change_percent`/`reference_price` left under `planning/`. Referenced from `backend/app/main.py`, `frontend/src/lib/api.ts`, CLAUDE.md. |

### Plan-level truths checked (beyond the roadmap SCs)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 6 | Image contains no CA material and no `.env`; history has no Avast reference (01-05) | VERIFIED | `docker history --no-trunc` has 0 matches for avast/extra_ca/BEGIN CERT; `grep -ri avast /app /etc/ssl` in image empty; no `.env*` in `/app`; `git grep` for BEGIN CERTIFICATE/avast outside planning only matches user note `.claude/CLAUDE.md` (text, no cert). |
| 7 | An interrupted docker build re-runs cleanly (backstop, 01-05) | PRESENT_BEHAVIOR_UNVERIFIED | Not exercised by any test or by the executor. Routed to human verification. |

**Score:** 6/7 truths verified (1 failed, plus 1 present-but-behavior-unverified counted under `behavior_unverified`; the 7th row is the backstop truth and the failed one is SC2). Roadmap SCs: 4 of 5 fully verified, SC2 partially failed.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.gitignore` / `.gitattributes` / `db/.gitkeep` | Ignore + LF + mount dir | VERIFIED | As above |
| `.env.example` | Six variable names, no secrets | STUB-ish / defective | Names present, no secrets, but `SIM_EVENT_PROBABILITY=` empty triggers CR-01 |
| `backend/app/{config,main,errors}.py`, `pyproject.toml`, `uv.lock` | uv project, factory, health, envelope | VERIFIED (config defect) | 9 tests pass; health, catch-all 404 and envelope confirmed live |
| `frontend/{next.config.ts,package.json,src/app/*,src/lib/api.ts}` | Static export + placeholder | VERIFIED | Built and inspected |
| `planning/API_CONTRACT.md` | Frozen contract | VERIFIED | Content checked |
| `Dockerfile`, `.dockerignore` | 3-stage image, 1 worker, healthcheck | VERIFIED (WR-01 warning) | Built and ran; see Warnings |
| `test/playwright.config.ts`, `test/smoke.spec.ts` | Host smoke local + container | VERIFIED | Both modes ran green |
| `README.md`, `CLAUDE.md` | Truthful status | VERIFIED | Content checked |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Dockerfile | frontend/out | `COPY --from=frontend /fe/out /app/static` | WIRED | Container serves page at `/` |
| Dockerfile | backend app | CMD `uvicorn --factory app.main:create_app --workers 1` | WIRED | Confirmed via inspect and /proc |
| Dockerfile | /api/health | HEALTHCHECK | WIRED | Status `healthy` |
| playwright.config.ts | backend | webServer uvicorn --factory + STATIC_DIR | WIRED | Local smoke passed |
| smoke.spec.ts | page.tsx | `app-title`, `api-status` test ids | WIRED | Smoke passed |
| frontend api.ts | /api/health | same-origin fetch | WIRED | Page renders `ok` in browser |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Real Data | Status |
|----------|---------------|--------|-----------|--------|
| `page.tsx` | `api` | `getHealth()` -> backend `/api/health` | Yes (smoke asserts text "ok") | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend tests | `uv run python -m pytest -q` | 9 passed | PASS |
| Local health | uvicorn :8765 + curl | 200 `{"status":"ok"}` | PASS |
| Unknown API path | curl `/api/nope` | 404 `{"error":"Not found"}` | PASS |
| Empty SIM_EVENT_PROBABILITY | dotenv(.env.example) + `Settings.from_env()` / container `-e SIM_EVENT_PROBABILITY=` | ValueError | FAIL |
| Frontend export | `npm run build` | success, `out/index.html` | PASS |
| Container health/page/404/one worker | docker run + curl + /proc | all pass | PASS |
| Smoke (local and container) | `npm --prefix test run smoke` / with BASE_URL | 1 passed each | PASS |

All servers/containers started were stopped (port 8765, 8000 free; no leftover containers; temp image `finally:verify` removed).

### Probe Execution

SKIPPED - no probe scripts declared or present.

### Requirements Coverage

All eight phase IDs are claimed by a plan and marked Complete in REQUIREMENTS.md; no orphaned Phase 1 requirement.

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| FND-01 | 01-01 | Build artifacts untracked/ignored, `.gitattributes` LF | SATISFIED | SC1 evidence |
| FND-02 | 01-03 | uv backend, factory, pytest via `uv run python -m pytest` | SATISFIED | 9 passed |
| FND-03 | 01-04 | Next TS static export + Tailwind | SATISFIED | Build verified |
| FND-04 | 01-02 | Contract in `planning/` | SATISFIED | API_CONTRACT.md |
| FND-05 | 01-03 | Env config incl. SIM_EVENT_PROBABILITY; local dev loads root .env | BLOCKED (partial) | Loads root `.env`, real env wins (tested); crashes on empty `SIM_EVENT_PROBABILITY` from the project's own template (CR-01) |
| FND-06 | 01-02, 01-05 | README/CLAUDE.md status lines accurate | SATISFIED | Content checked; README table marks OPENROUTER_API_KEY "Required: Yes" which is not enforced yet (cosmetic) |
| PORT-08 | 01-03 | `GET /api/health` | SATISFIED | 200 locally and in container |
| PKG-01 | 01-05 | Multi-stage Node 24 -> Python 3.12 + uv `--locked`, port 8000, one worker | SATISFIED (WR-01 caveat) | Built, ran; `--locked` is present but its failure is masked (WR-01) |

### Prohibitions (judgment-tier, NON-AUTHORITATIVE - unverified-prohibition, human review recommended)

| Prohibition | Verdict | Evidence |
|-------------|---------|----------|
| MUST NOT bake an interception root into the image or committed files | Holds (LLM-judge) | No Avast/cert strings in image history or filesystem; none in tracked files; secret mounted only in builder stages |
| MUST NOT disable/weaken TLS verification | Holds (LLM-judge) | No disabling tokens in Dockerfile/README/test/backend/frontend; build ran with verification on |
| MUST NOT claim unbuilt components in README | Holds (LLM-judge) | README "Not built yet" line lists market data, DB, trading, charts, chat, compose/scripts |

### Review Findings Weighed (01-REVIEW.md, all 9 still `open` in the disposition)

| ID | Effect on must-haves |
|----|----------------------|
| CR-01 | Defeats SC2 / FND-05 for the committed template. Gap (blocker). Independently reproduced. |
| WR-01 (Dockerfile masks failed `uv sync`) | Warning. Sound by reading (`RUN` status is the trailing `rm -f`, no `set -e`); it currently builds fine, but the `--locked` guard named in PKG-01 cannot fail the build. Fix before relying on the image. |
| WR-05 (OPTIONS on unknown `/api/*` returns 405 not the contract 404) | Warning. Confirmed live: OPTIONS `/api/nope` -> 405. Minor deviation from the frozen contract. |
| WR-02 (root user), WR-03 (test env leak; also why CR-01 slipped through), WR-04 (`getHealth` ignores `res.ok`), IN-01..03 | Do not defeat a must-have. Track for later phases. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/app/config.py` | 33 | float() on possibly-empty env value | Blocker | CR-01 |
| `Dockerfile` | 18-24 | Failure of `uv sync` masked by trailing `rm -f` | Warning | WR-01 |
| `backend/app/main.py` | 28 | Catch-all omits OPTIONS | Warning | WR-05 |
| `frontend/src/lib/api.ts` | 4-6 | `res.ok` unchecked | Warning | WR-04 |

No TBD/FIXME/XXX markers in phase files.

### Human Verification Required

1. **Interrupted docker build re-runs cleanly** (backstop truth)
   - Test: run `docker build -t finally:int .`, interrupt mid-step, re-run.
   - Expected: second build exits 0 with no manual cleanup; image healthy and free of CA material.
   - Why human: no test exists; executor did not simulate it.
2. **Confirm the three judgment-tier prohibition verdicts above** (non-authoritative).

### Gaps Summary

One blocker: `Settings.from_env()` crashes when `SIM_EVENT_PROBABILITY` is set to the empty string, which is exactly what the committed `.env.example` and Docker `--env-file` produce. Fix is a single expression in `backend/app/config.py` plus a regression test that sets the empty-by-default variables to `""` (WR-03 explains why the current tests are blind to it). Once fixed, SC2 and FND-05 are met and the phase goal holds. The remaining items are warnings (WR-01, WR-05, WR-04) and one human check (interrupted build).

The STATE.md UI safety-gate override (placeholder page only; run `/gsd-ui-phase 2` before Phase 2 UI) is recorded and does not affect any Phase 1 truth.

---

_Verified: 2026-10-07T23:30:00Z_
_Verifier: Claude (gsd-verifier)_
