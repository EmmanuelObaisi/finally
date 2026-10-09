---
phase: 04-charts-portfolio-visualizations
verified: 2026-10-09T10:15:00Z
status: human_needed
score: 4/4 roadmap success criteria verified (all plan truths verified; 0 failed)
covered_files:
  - .planning/phases/04-charts-portfolio-visualizations/04-01-PLAN.md
  - .planning/phases/04-charts-portfolio-visualizations/04-01-SUMMARY.md
  - .planning/phases/04-charts-portfolio-visualizations/04-02-PLAN.md
  - .planning/phases/04-charts-portfolio-visualizations/04-02-SUMMARY.md
  - .planning/phases/04-charts-portfolio-visualizations/04-03-PLAN.md
  - .planning/phases/04-charts-portfolio-visualizations/04-03-SUMMARY.md
  - .planning/phases/04-charts-portfolio-visualizations/04-04-PLAN.md
  - .planning/phases/04-charts-portfolio-visualizations/04-04-SUMMARY.md
  - backend/app/history.py
  - frontend/src/components/HeatmapPanel.tsx
  - frontend/src/components/HeatmapTile.tsx
  - frontend/src/components/MainChartPanel.tsx
  - frontend/src/components/PnlChartPanel.tsx
  - frontend/src/lib/chartTheme.ts
  - frontend/src/lib/heatmap.ts
  - frontend/src/lib/historyStore.ts
  - frontend/src/lib/pnlSeries.ts
  - frontend/src/lib/selectionStore.ts
  - frontend/src/lib/useElementSize.ts
covered_digest: "v3:sha256:4561d141b98bd404cd669d58fb8ec8d4694f686479d894fab0700ee96cdef5bf"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Main chart (04-02 D5): load the app, hover the main chart, click through several tickers"
    expected: "Crosshair labels show local HH:mm:ss, axis in local 24-hour time, TradingView logo visible on the main chart only, layout is not clipped"
    why_human: "Canvas rendering; jsdom tests only assert the options passed to the mocked lightweight-charts"
  - test: "P&L chart (04-03 D7): make a trade and look at the portfolio value panel"
    expected: "Area chart looks right, HH:mm / Oct 9 axis labels, crosshair label like 'Oct 9 14:30:05', no TradingView logo, delta color green/red/neutral"
    why_human: "Canvas rendering and visual judgment"
  - test: "Heatmap (04-04 D6): hold several positions, watch live prices, resize to 1920x1080, 1280x800, 1024x768, 768x1024"
    expected: "Tint and text legible on dark panel, 300 ms glide when tiles re-layout, no overlap or clipping at each size"
    why_human: "Visual legibility, animation feel, responsive layout"
  - test: "Prohibition (04-04): npm install did not weaken TLS"
    expected: "No strict-ssl off / NODE_TLS_REJECT_UNAUTHORIZED=0 used; only NODE_EXTRA_CA_CERTS"
    why_human: "Process prohibition with no wired test. Inspection found no such setting in the repo and the lockfile's d3-hierarchy entries resolve over https from registry.npmjs.org, but past shell sessions cannot be re-audited. Flagged unverified-prohibition, advisory."
---

# Phase 04: Charts & Portfolio Visualizations Verification Report

**Phase Goal:** A user can see the selected ticker and their portfolio at a glance: a main price chart, a P&L heatmap and a portfolio value history chart
**Verified:** 2026-10-09T10:15:00Z
**Status:** human_needed
**Re-verification:** No, initial verification

All automated evidence supports the goal; the only open items are the visual judgments the executors deferred (canvas look, legibility, animation, breakpoints), plus one process prohibition that no test can enforce.

## Goal Achievement

### Observable Truths (ROADMAP contract)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A default ticker shows in the main chart on load; clicking any watchlist ticker switches the line | VERIFIED | `selectionStore.sync` picks `tickers[0]` when ready (selectionStore.ts); `WatchlistPanel` effect calls `sync`, rows call `select` via `onSelect` (WatchlistPanel.tsx:49,173; WatchlistRow.tsx:33); `MainChartPanel` reads `s.spark[selected]` and `setData` on `[selected, buffer]`; `<MainChartPanel/>` first child of workspace in page.tsx. Vitest (selectionStore, WatchlistPanel removal fallback, MainChartPanel) and Playwright tests 1-2 (default selection, row click, Enter) pass |
| 2 | Heatmap: one rectangle per position sized by weight, green/red by P&L, updates with live prices | VERIFIED | `heatmap.ts` builds d3-hierarchy `treemapSquarify` over `livePosition` values (live price else `current_price`), `tileFill` per P&L %; `HeatmapPanel` recomputes `buildTiles` from the `prices` store each render. Tests: squarify weights, no overlap/full coverage, "recolors a tile when a price frame drops the position below its cost"; Playwright test 4 passes in a real browser |
| 3 | P&L chart from snapshots, seeded $10,000 start, 30s refetch, live "now" point, trade adds a point, no snapshot flooding | VERIFIED | Backend `history.py`: `record_if_due` under `transaction(conn)`, 10 s + value-changed guard, newest 2000 ascending; `trading.py:92` records a snapshot per trade; `db.py:104` seeds the first point. Frontend: `historyStore` ticket-guarded load, `PnlChartPanel` loads on mount/portfolio identity change/30 s unless in flight, `buildPnlSeries` appends display-only live point = `liveTotals(...).total`. 11 backend history tests pass (boundary 9 s/10 s, one-cent, concurrency, cap, ordering, POST 404); panel test "fetches on mount, every 30 s unless in flight, on portfolio change" passes; Playwright test 3 (trade adds points) passes |
| 4 | Watchlist, positions table, heatmap, P&L chart each show an explicit empty state | VERIFIED | `watchlist-empty`, `positions-empty` pre-existing from Phase 3; this phase adds `main-chart-empty`, `heatmap-empty`, `pnl-empty` overlays (ChartOverlay). Playwright test 5 "every panel shows its empty state" passes against the live app; unit tests cover each overlay including loading/error/Retry |

### Plan-level truths (spot-checked beyond the roadmap SCs)

| Truth | Status | Evidence |
|-------|--------|----------|
| History guard named in API_CONTRACT.md | VERIFIED | `MIN_INTERVAL_SECONDS` at planning/API_CONTRACT.md:152 |
| POST /api/portfolio/history is a JSON 404 | VERIFIED | `test_post_to_history_is_a_json_404` passes; router defines GET only |
| Snapshot value is server valuation, equality on rounded total | VERIFIED | history.py uses `build_portfolio(conn, cache)["total_value"]`; `test_one_cent_change_records_and_identical_total_does_not` |
| Main chart shares sparkline per-second buffer; precision 2, fitContent, autoSize | VERIFIED | MainChartPanel.tsx: `toData(buffer)`, `priceFormat precision 2 minMove 0.01`, `fitContent` after `setData`; logo left default |
| P&L chart hides logo, local time ticks, `fmtDateTime` crosshair | VERIFIED (config level) | PnlChartPanel.tsx `attributionLogo: false`, `tickMarkFormatter`, `timeFormatter`; unit test asserts the options. Real rendering is a human item |
| P&L empty only when no positions AND history <= 1; chart stays after full sell | VERIFIED | `neverTraded` in PnlChartPanel.tsx; test "keeps the chart for closed-out history of two points and no positions" |
| Tiles ordered by cost basis, squarify, paddingInner 0, round | VERIFIED | heatmap.ts `heatmapLeaves` sort + `treemap().tile(treemapSquarify)...paddingInner(0).round(true)` |
| Tile text rules (48x24 ticker, 48 high for %), label always carries signed P&L % | VERIFIED | HeatmapTile.tsx `showTicker`/`showPct`, `title`/`aria-label` always set; HeatmapPanel tests for ticker-only, no-text, accessible sentence |
| d3-hierarchy 3.1.2 / @types 3.1.7 exact pins | VERIFIED | frontend/package.json:13,25; lockfile resolved over https from registry.npmjs.org; matches user approval recorded in 04-01-SUMMARY.md |
| ResizeObserver stub wired for tests | VERIFIED | vitest.setup.ts:8 `vi.stubGlobal("ResizeObserver", FakeResizeObserver)` |

**Score:** 4/4 roadmap truths verified; all 04-01..04-04 must-have truths verified; 0 present-but-behavior-unverified.

### Prohibitions

| Prohibition | Tier | Status | Evidence |
|-------------|------|--------|----------|
| No client-computed/synthetic values written to history (04-03) | test | Enforced | Only `fetch("/api/portfolio/history")` GET exists in frontend (api.ts:18, asserted in api.test.ts:56); backend POST returns 404 (test). Live point is display-only in `buildPnlSeries` |
| No weight distortion in heatmap (04-04) | test | Enforced | Tests: weights by value, no overlap/full coverage, tiny position kept; no min-size code in heatmap.ts |
| Not color alone (04-04) | test | Enforced | `title`/`aria-label` always carry signed P&L %; visible text when >= 48x48; component tests |
| No TLS weakening for npm install (04-04) | test (process) | UNVERIFIED, flagged | No wired enforcement possible; no strict-ssl/NODE_TLS_REJECT_UNAUTHORIZED in repo, lockfile https. Recorded as unverified-prohibition, human review recommended (advisory) |

### Required Artifacts

All 17 artifacts declared across the four plans exist, are substantive and wired: `backend/app/history.py`, `backend/tests/test_history.py`, `planning/API_CONTRACT.md` (guard sentence), `selectionStore.ts`, `MainChartPanel.tsx`, `ChartOverlay.tsx`, `chartTheme.ts`, `test/portfolio-charts.spec.ts`, `PnlChartPanel.tsx`, `historyStore.ts`, `pnlSeries.ts`, `api.ts` (`getPortfolioHistory`), `heatmap.ts`, `HeatmapPanel.tsx`, `HeatmapTile.tsx`, `useElementSize.ts`, `fakeResizeObserver.ts`.

### Key Link Verification

| From | To | Status |
|------|----|--------|
| main.py -> history.router (`include_router(history.router)`, main.py:48) | WIRED |
| history.py -> `build_portfolio(conn, cache)` and `with transaction(conn)` | WIRED |
| WatchlistPanel -> selectionStore `.sync(` / row `onSelect(` | WIRED |
| MainChartPanel -> store `s.spark[...]` | WIRED |
| historyStore -> `getPortfolioHistory(` ; PnlChartPanel -> `buildPnlSeries(`, `usePortfolioStore(` | WIRED |
| HeatmapPanel -> `buildTiles(`, `useElementSize`; heatmap.ts -> `livePosition(` | WIRED |
| page.tsx renders `<MainChartPanel/>`, `<HeatmapPanel/>`, `<PnlChartPanel/>` | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| MainChartPanel | spark buffer, price, change | SSE market store | Yes | FLOWING |
| PnlChartPanel | history | GET /api/portfolio/history -> SQLite snapshots | Yes | FLOWING |
| PnlChartPanel | live total | portfolio store + live prices (`liveTotals`) | Yes | FLOWING |
| HeatmapPanel | positions, prices | GET /api/portfolio + SSE | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| History guard, cap, ordering, concurrency, 404 | `uv run python -m pytest -q tests/test_history.py` | 11 passed | PASS |
| Frontend suite | `npx vitest run` | 254 passed | PASS |
| Types | `npx tsc --noEmit` | clean | PASS |
| Real-browser phase scenarios | `npx playwright test portfolio-charts.spec.ts` | 5 passed | PASS |

Orchestrator additionally reported backend 196 passed, `npm run build` exit 0 and E2E 17/17.

### Probe Execution

No probes declared by this phase. SKIPPED.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| UI-07 | 04-02 | Clicking a ticker shows it in main chart; default selected on load | SATISFIED | Truth 1 |
| PORT-07 | 04-01 | History endpoint, guarded snapshot on request | SATISFIED | Truth 3, backend tests |
| PUI-03 | 04-04 | Heatmap sized by weight, colored by P&L | SATISFIED | Truth 2 |
| PUI-04 | 04-03 | P&L chart from snapshots, 30 s refetch, live point | SATISFIED | Truth 3 |
| PUI-07 | 04-02/04-03/04-04 | Explicit empty states for watchlist, positions, heatmap, P&L | SATISFIED | Truth 4 |

All five IDs appear in REQUIREMENTS.md (marked Complete, mapped to Phase 4) and in ROADMAP. No orphaned requirements: no other ID maps to Phase 4.

### Anti-Patterns Found

None blocking. No TBD/FIXME/XXX/TODO/HACK in the phase's implementation files. Open advisory review items (04-REVIEW-DISPOSITION.md, 0 critical): WR-01 racy selection tests, WR-02 portfolio-charts.spec tests assume a pristine DB, IN-01..IN-05 (pre-phase DBs lack seed snapshot, duplicate startup history fetch, live point dropped if browser clock behind server, no REST fallback for change %, fetch-stub leakage). These are non-blocking and do not affect any truth.

### Deferred Items

None.

### Human Verification Required

1. **Main chart visuals (04-02 D5)** - hover crosshair, local HH:mm:ss labels, logo on main chart only, layout. Why human: canvas not rendered in jsdom.
2. **P&L chart visuals (04-03 D7)** - area look, axis labels, crosshair label, no logo, delta color. Why human: canvas and visual judgment.
3. **Heatmap visuals (04-04 D6)** - tint/text legibility, 300 ms glide, layouts at 1920x1080, 1280x800, 1024x768, 768x1024. Why human: legibility, animation, responsive layout.
4. **TLS prohibition (04-04)** - confirm no verification was disabled during npm install. Why human: process-only, no wired enforcement.

### Gaps Summary

No gaps. Every roadmap success criterion and plan must-have is backed by code that exists, is wired, receives real data, and is exercised by passing unit and real-browser tests. Status is `human_needed` solely because of the executor-recorded visual items and the unenforceable process prohibition.

---

_Verified: 2026-10-09T10:15:00Z_
_Verifier: Claude (gsd-verifier)_
