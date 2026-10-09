---
phase: "4"
slug: "charts-portfolio-visualizations"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-09"
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Backend: pytest 9.1.1 + pytest-asyncio 1.4.0. Frontend: Vitest 5.0.3 + RTL 16.3.3 + jsdom 30.1.2. E2E: Playwright 1.63.0 on the host |
| **Config file** | `backend/pyproject.toml`, `frontend/vitest.config.ts` (+ `vitest.setup.ts`), `test/playwright.config.ts` |
| **Quick run command** | Backend: `cd backend && uv run python -m pytest tests/test_history.py -q`. Frontend: `cd frontend && npx vitest run <touched test files> && npx tsc --noEmit` |
| **Full suite command** | `cd backend && uv run python -m pytest -q` and `cd frontend && npx vitest run && npx tsc --noEmit && npm run build` |
| **Estimated runtime** | ~20 seconds (backend ~12 s, Vitest ~4 s, tsc ~2 s); build and Playwright extra at wave and phase gates |

---

## Sampling Rate

- **After every task commit:** Run the quick command for the touched area (backend test file or the named Vitest files, plus `npx tsc --noEmit` for frontend tasks)
- **After every plan wave:** Run the full backend and frontend suites, `npx tsc --noEmit`, and `npm run build` after the d3 install and after the page re-slot
- **Before `/gsd-verify-work`:** Full suites green, `npm run build` green, `test/portfolio-charts.spec.ts` and the whole Playwright run green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

Filled in by the planner and executor per task. Requirement-level map (from 04-RESEARCH.md § Validation Architecture):

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | PORT-07 | — | History is read-only, capped at 2000 rows; request-time snapshot only after the min interval AND when the total value changed (no table flooding) | unit (pytest) | `cd backend && uv run python -m pytest tests/test_history.py -q` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PORT-07 | — | N/A | unit (vitest) | `cd frontend && npx vitest run src/lib/api.test.ts src/lib/historyStore.test.ts` | ❌ W0 (historyStore) | ⬜ pending |
| TBD | TBD | TBD | UI-07 | — | N/A | unit (vitest) | `cd frontend && npx vitest run src/lib/selectionStore.test.ts src/components/WatchlistPanel.test.tsx src/components/MainChartPanel.test.tsx` | ❌ W0 (new files) | ⬜ pending |
| TBD | TBD | TBD | PUI-03 | — | N/A | unit (vitest) | `cd frontend && npx vitest run src/lib/heatmap.test.ts src/components/HeatmapPanel.test.tsx` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PUI-04 | — | N/A | unit (vitest) | `cd frontend && npx vitest run src/lib/pnlSeries.test.ts src/components/PnlChartPanel.test.tsx` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PUI-07 | — | N/A | unit (vitest) | panel tests above (heatmap and P&L empty overlays) | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | UI-07, PUI-03, PUI-04, PUI-07 | — | N/A | e2e (playwright) | `cd frontend && npm run build && cd ../test && npx playwright test portfolio-charts.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_history.py` — PORT-07 (seed point, ascending, 2000 cap, interval and unchanged-value guard, trade adds a point)
- [ ] `frontend/src/test/fakeResizeObserver.ts` + `vitest.setup.ts` registration (jsdom has no ResizeObserver)
- [ ] `frontend/src/lib/{heatmap,pnlSeries,selectionStore,historyStore}.test.ts`
- [ ] `frontend/src/components/{MainChartPanel,HeatmapPanel,PnlChartPanel}.test.tsx` using the `importOriginal` partial mock of `lightweight-charts`
- [ ] `test/portfolio-charts.spec.ts` (name sorts after `connection.spec.ts`)
- [ ] Package install after the human approval gate: `d3-hierarchy@3.1.2`, `@types/d3-hierarchy@3.1.7` (exact pins)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Chart canvases look right (line, area fill, axis labels, crosshair readout) | UI-07, PUI-04 | Canvas pixels cannot be asserted in jsdom or by DOM queries; `data-points` proves data, not rendering | Open the app, hover both charts, confirm local-time axis labels and crosshair price/time labels |
| Heatmap tile colors and glide transition read correctly | PUI-03 | Visual judgment of tint strength and motion | Buy two tickers, watch tiles recolor and resize as prices move |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
