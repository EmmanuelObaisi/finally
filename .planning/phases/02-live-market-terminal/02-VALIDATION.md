---
phase: "2"
slug: "live-market-terminal"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-08"
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Backend: pytest 9.1.1 + pytest-asyncio 1.4.0 (`asyncio_mode = "auto"`). Frontend: Vitest 5.0.3 + RTL 16.3.3 + jsdom 30.1.2. E2E: Playwright 1.63.0 on the host |
| **Config file** | `backend/pyproject.toml` `[tool.pytest.ini_options]` (exists); `frontend/vitest.config.ts` + `frontend/vitest.setup.ts` (Wave 0 installs); `test/playwright.config.ts` (exists) |
| **Quick run command** | `uv run --directory backend python -m pytest tests/market -q` / `npm --prefix frontend test` |
| **Full suite command** | `uv run --directory backend python -m pytest -q && npm --prefix frontend test && npm --prefix frontend run build && npm --prefix test run smoke` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run the matching quick command (`tests/market -q` or `npm --prefix frontend test`)
- **After every plan wave:** Run the full backend suite + full frontend suite
- **Before `/gsd-verify-work`:** Full suite must be green (backend, frontend, build, smoke)
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

Seeded from RESEARCH.md; task IDs are bound when plans are created.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | MKT-01, MKT-02, MKT-03 | — | N/A | unit | `uv run --directory backend python -m pytest tests/market/test_simulator.py -q` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | MKT-04, MKT-06 | — | N/A | unit | `uv run --directory backend python -m pytest tests/market/test_simulator.py tests/market/test_factory.py -q` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | MKT-05 | — | API key never logged or returned | unit | `uv run --directory backend python -m pytest tests/market/test_massive.py -q` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | MKT-07 | — | N/A | unit | `uv run --directory backend python -m pytest tests/market/test_cache.py -q` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | MKT-09 | — | N/A | unit + integration | `uv run --directory backend python -m pytest tests/market/test_stream.py -q` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | MKT-10 | — | No SSE hang on shutdown | integration | `uv run --directory backend python -m pytest tests/market/test_shutdown.py -q` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DB-01, DB-02, DB-03 | — | Parameterized SQL only | unit | `uv run --directory backend python -m pytest tests/test_db.py -q` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | WL-01 | — | N/A | API | `uv run --directory backend python -m pytest tests/test_watchlist.py -q` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PORT-01 | — | N/A | API | `uv run --directory backend python -m pytest tests/test_portfolio.py -q` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | UI-02, UI-03, UI-04, UI-05, UI-08 | — | N/A | unit | `npm --prefix frontend test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | UI-01, UI-02, UI-03, UI-04 | — | N/A | e2e | `npm --prefix test run smoke` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | TEST-01 | — | N/A | suite | `uv run --directory backend python -m pytest tests/market -q` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/market/` test files: `test_simulator.py`, `test_factory.py`, `test_massive.py`, `test_cache.py`, `test_stream.py`, `test_shutdown.py` (unique basenames)
- [ ] `backend/tests/test_db.py`, `test_watchlist.py`, `test_portfolio.py`
- [ ] `pytest-asyncio` install + `asyncio_mode = "auto"` in `backend/pyproject.toml`
- [ ] `frontend/vitest.config.ts`, `frontend/vitest.setup.ts` (FakeEventSource, jest-dom), `"test": "vitest run"` script
- [ ] Replace `test/smoke.spec.ts`; retire or rewrite `test/health-status.spec.ts`; add `DB_PATH`/`SIM_SEED`/`SIM_EVENT_PROBABILITY` and `--timeout-graceful-shutdown` to `test/playwright.config.ts` `webServer`
- [ ] Remove or rewrite `test_health_is_side_effect_free`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Connection dot cycles green → yellow → red → green across a backend kill and restart | UI-03 | Spawning/killing a server from Playwright on Windows is brittle; Phase 6 owns the automated SSE-reconnection scenario | Open the app, stop the backend, watch the dot go yellow then red within ~5 s, restart the backend, dot returns green and prices resume |
| Live Massive data feeds the same UI | MKT-05 | Requires a real `MASSIVE_API_KEY` | Set the key in `.env`, start the app, confirm watchlist prices populate with no frontend change |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
