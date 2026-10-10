---
phase: "3"
slug: "trading-watchlist-management"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
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
| 03-01-01 | 01 | 1 | PORT-02..PORT-06 | T-03-01, T-03-02, T-03-03 | Strict quantity model; fill inside BEGIN IMMEDIATE | live API | live uvicorn check on :8766 (03-01 Task 1) + `uv run --directory backend python -m pytest -q` | ✅ | ✅ green |
| 03-01-02 | 01 | 1 | TEST-02, PORT-02..PORT-05 | T-03-01, T-03-02 | Every rejection changes nothing; one winner among concurrent unaffordable buys | unit + API | `uv run --directory backend python -m pytest -q tests/test_trading.py` | ✅ | ✅ green |
| 03-01-03 | 01 | 1 | MKT-08 | T-03-05 | Failed buy of an unwatched ticker untracks it | API | `uv run --directory backend python -m pytest -q tests/test_tracking.py tests/test_trading.py` | ✅ | ✅ green |
| 03-02-01 | 02 | 2 | WL-02, MKT-08 | T-03-08, T-03-09 | ASCII + fullmatch ticker check; unknown ticker untracked | live API | live uvicorn check on :8767 (03-02 Task 1) + `uv run --directory backend python -m pytest -q tests/test_watchlist.py` | ✅ | ✅ green |
| 03-02-02 | 02 | 2 | WL-03, MKT-08 | T-03-10 | Held ticker stays tracked and priced after removal | API | `uv run --directory backend python -m pytest -q tests/test_watchlist.py tests/test_tracking.py` | ✅ | ✅ green |
| 03-03-01 | 03 | 2 | PUI-01 | T-03-12, T-03-13 | Server text as React text node; buttons type=button | e2e | `npm --prefix frontend run build && npm --prefix test run smoke -- trade.spec.ts` | ✅ | ✅ green |
| 03-03-02 | 03 | 2 | PUI-01 | T-03-14 | Ticket guard: stale GET never overwrites a trade result | unit + e2e | `npm --prefix frontend test -- portfolioStore Header` | ✅ | ✅ green |
| 03-03-03 | 03 | 2 | PUI-01 | T-03-13, T-03-15 | No implicit submit; GET helpers never echo bodies | unit | `npm --prefix frontend test -- TradeBar api` | ✅ | ✅ green |
| 03-04-01 | 04 | 3 | PUI-02, MKT-08 | — | — | e2e | `npm --prefix frontend run build && npm --prefix test run smoke -- trade.spec.ts` | ✅ | ✅ green |
| 03-04-02 | 04 | 3 | PUI-02 | T-03-16 | Live cells dim while disconnected | unit + human-check | `npm --prefix frontend test -- PositionsTable positions` | ✅ | ✅ green |
| 03-05-01 | 05 | 4 | UI-06 | T-03-18 | Server text as React text node | e2e | `npm --prefix frontend run build && npm --prefix test run smoke -- watchlist.spec.ts` | ✅ | ✅ green |
| 03-05-02 | 05 | 4 | UI-06, WL-03 | T-03-19, T-03-20 | Panel locked while a mutation is in flight; encoded DELETE path | unit + e2e | `npm --prefix frontend test -- WatchlistPanel` then `npm --prefix test run smoke` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `backend/tests/conftest.py` — `FixedPriceSource`, `client` fixture, shared DB/position seeding
- [x] `backend/tests/test_trading.py`, `backend/tests/test_tracking.py` — new
- [x] `frontend/src/lib/portfolioStore.test.ts`, `positions.test.ts`, `api.test.ts`; `components/TradeBar.test.tsx`, `PositionsTable.test.tsx` — new; `WatchlistPanel.test.tsx`, `Header.test.tsx` updated
- [x] `test/trade.spec.ts` — optional tracer E2E

Framework install: none.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Price flash and live P&L feel in the positions table | PUI-02 | Visual timing | Buy a ticker, watch the row update for ~10s |
| Live price, P&L and P&L % cells dim while disconnected | PUI-02 | The dim class is unit-tested, not its look | Stop the backend with a position open; the three live cells dim, qty and avg cost do not |
| No document scroll; add block and remove column fit | PUI-02, UI-06 | jsdom and E2E do not assert layout | Check 1920x1080, 1280x800, 768x1024 and 480px widths |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-08 (validate-phase: 0 gaps; backend 178, frontend 160, build, E2E 12/12 green)

## Validation Audit 2026-10-08

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
