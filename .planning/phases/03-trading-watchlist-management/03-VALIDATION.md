---
phase: "3"
slug: "trading-watchlist-management"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-08"
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Backend: pytest 9.1.1 + pytest-asyncio 1.4.0 (`asyncio_mode = "auto"`). Frontend: Vitest 5.0.3 + RTL 16.3.3 + jsdom 30.1.2. E2E: Playwright 1.63.0 on the host |
| **Config file** | `backend/pyproject.toml`; `frontend/vitest.config.ts` + `frontend/vitest.setup.ts`; `test/playwright.config.ts` (all exist) |
| **Quick run command** | `uv run --directory backend python -m pytest tests/test_trading.py tests/test_tracking.py tests/test_watchlist.py -q` / `npm --prefix frontend test -- <name>` |
| **Full suite command** | `uv run --directory backend python -m pytest -q && npm --prefix frontend test && npm --prefix frontend run build && npm --prefix test run smoke` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run the matching quick command (backend test file or `npm --prefix frontend test -- <name>`)
- **After every plan wave:** Run the full backend suite + full frontend suite
- **Before `/gsd-verify-work`:** Full suite must be green (backend, frontend, build, smoke)
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 3-xx-xx | TBD | TBD | See 03-RESEARCH.md "Phase Requirements -> Test Map" | — | — | — | filled in by planner/executor | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/conftest.py` — `FixedPriceSource`, `client` fixture, shared DB/position seeding
- [ ] `backend/tests/test_trading.py`, `backend/tests/test_tracking.py` — new
- [ ] `frontend/src/lib/portfolioStore.test.ts`, `positions.test.ts`, `api.test.ts`; `components/TradeBar.test.tsx`, `PositionsTable.test.tsx` — new; `WatchlistPanel.test.tsx`, `Header.test.tsx` updated
- [ ] `test/trade.spec.ts` — optional tracer E2E

Framework install: none.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Price flash and live P&L feel in the positions table | PUI-02 | Visual timing | Buy a ticker, watch the row update for ~10s |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
