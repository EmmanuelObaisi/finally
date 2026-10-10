# Phase 4 — UI Review

**Audited:** 2026-10-09
**Baseline:** UI-SPEC.md (approved design contract)
**Screenshots:** NOT captured (dev server process management restrictions; code-only audit)
**Interaction captures:** off

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | All required copy strings present in correct states with proper placeholders |
| 2. Visuals | 4/4 | Correct layout, focal point hierarchy, state overlays, and interaction patterns |
| 3. Color | 4/4 | Color tokens exact to spec; heatmap tile fills match RGB values and alpha calculations |
| 4. Typography | 4/4 | Only 2 weights (400, 600) and 4 sizes (12, 14, 16, 20px) used throughout |
| 5. Spacing | 4/4 | All spacing adheres to 4px scale; no off-scale arbitrary values in component spacing |
| 6. Experience Design | 4/4 | Complete state matrix (12 explicit states), correct selection rules, motion animations |

**Overall: 24/24**

---

## Top 3 Priority Fixes

**None identified.** The implementation is complete and correct against the UI-SPEC.md contract. All 6 pillars meet or exceed the design specification.

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)

**PASS: All copywriting contract fulfilled**

- **Main chart states (4 overlays):** "Price chart" (empty), "Chart unavailable" (error), "No ticker selected" (empty list), "Collecting prices for {TICKER}" (waiting). Copy files: `MainChartPanel.tsx` lines 27, 117-118, 126-127, 135-136.
- **Heatmap states (3 overlays):** "Portfolio heatmap" (title), "No positions to map" (empty), "Heatmap unavailable" (error). Copy files: `HeatmapPanel.tsx` lines 24, 63-64, 52-53.
- **P&L chart states (3 overlays):** "Portfolio value" (title), "No portfolio history yet" (empty), "Portfolio value unavailable" (error). Copy files: `PnlChartPanel.tsx` lines 88, 135-136, 124-125.
- **Interactive labels:** Select button `aria-label="Show {TICKER} chart"` (`WatchlistRow.tsx` line 40), Retry button text `"Retry"` (`ChartOverlay.tsx` line 36).
- **Sub-labels and hints:** "Since page load" (`MainChartPanel.tsx` line 92), "Size = value, color = P&L %" (`HeatmapPanel.tsx` line 25), "since start" (`PnlChartPanel.tsx` line 99, hidden below 640px via `hidden sm:inline`).
- **Missing value:** `"--"` used consistently across panels when data unavailable (`format.ts` line 2: `MISSING = "--"`).
- **Tile labels:** Heatmap tiles carry full-sentence aria-labels with ticker, value, weight %, and signed P&L (`HeatmapTile.tsx` lines 6-16).

### Pillar 2: Visuals (4/4)

**PASS: Visual hierarchy and layout correct**

- **Focal point:** Main price chart is the primary focal point—largest panel (top of workspace, 5fr row), occupies full width above other charts, contains ticker headline as its own title bar.
- **Secondary & tertiary foci:** Portfolio heatmap and P&L chart are equal secondary/tertiary, side-by-side in a mid row with 50/50 split below the main chart.
- **Layout structure:** Workspace grid is 4-row at >= 1024px: `grid-rows-[minmax(0,5fr)_minmax(0,4fr)_auto_minmax(0,4fr)]` (main chart / mid-row heatmap+P&L / trade bar / positions table). Mid-row is 2-column grid: `grid-cols-1 lg:grid-cols-2`. Below 1024px: single-column flow with fixed panel heights (`h-80` main, `h-64` heatmap and P&L). Files: `page.tsx` lines 19-25.
- **Panels:** All three chart panels follow an identical structure: title bar (h-10, 40px) with heading and metadata, then a relative container with an always-mounted chart/tiles box and an absolute-positioned overlay. Files: `MainChartPanel.tsx` lines 65-67, `HeatmapPanel.tsx` lines 22-23, `PnlChartPanel.tsx` lines 86-87.
- **State overlays:** ChartOverlay component provides skeleton (aria-busy, pulsing bg-raised), heading/body pairs, and optional Retry button. States correctly map: loading → skeleton, error → overlay with Retry, empty → overlay without Retry, populated → null overlay (chart shows). Verified across all three panels with testid contracts (main-chart-loading, heatmap-error, pnl-empty, etc.). Files: `ChartOverlay.tsx` lines 17-41.
- **Title bars:** Consistent 40px height, flex with gap-4 between groups, px-4 horizontal padding, border-b separator. Main chart title is the selected ticker (or "Price chart"), right side shows numeric values and sub-labels. Heatmap and P&L titles show left heading and right group of metadata. Watchlist rows have the same h-10 title bar structure. Files: `MainChartPanel.tsx` lines 67-92, `HeatmapPanel.tsx` lines 23-25, `PnlChartPanel.tsx` lines 87-99.
- **Interaction patterns:** Watchlist rows are fully clickable (onClick row, stopPropagation on remove). Select buttons have aria-current and aria-label. Heatmap tiles are not interactive (no click, focus, or hover). Chart boxes are read-only (crosshair only, no pan/zoom). Retry buttons are the only new interactive elements.

### Pillar 3: Color (4/4)

**PASS: Color tokens and heatmap fills exact to spec**

- **Base palette:** `primary: "#209dd7"`, `muted: "#8b949e"`, `border: "#30363d"`, `raised: "#1c2128"` all imported from `chartTheme.ts` and match UI-SPEC exactly. File: `chartTheme.ts` line 5.
- **Chart colors:** `baseChartOptions()` applies transparent background, `textColor: muted`, horizontal gridlines in `border`, vertical gridlines hidden, crosshair lines in `muted` dashed with `raised` label background. Main chart series is `primary` 2px line. P&L chart series is `primary` area with gradient `rgb(32 157 215 / 0.28)` to `rgb(32 157 215 / 0)`. Files: `chartTheme.ts` lines 17-33, `MainChartPanel.tsx` lines 43-48, `PnlChartPanel.tsx` lines 63-71.
- **Heatmap tile fill:** `tileFill(pnlPercent)` returns:
  - Up (profit): `rgb(63 185 80 / alpha)` — exact match to `#3fb950` (UI-SPEC "up")
  - Down (loss): `rgb(248 81 73 / alpha)` — exact match to `#f85149` (UI-SPEC "down")
  - Flat (0.00%): `var(--color-raised)` — neutral
  - Alpha formula: `0.15 + 0.35 * min(|pnl_percent| / 10, 1)` — saturates at 0.50 (matching UI-SPEC 60/30/10 for 10% thresholds). File: `heatmap.ts` lines 26-32.
- **Contrast:** Green text on green tint and red text on red tint is avoided—text is always `fg` (light gray), direction is communicated by the tile fill tint color plus explicit aria-label sentence plus P&L % text (shown on larger tiles). Calculated contrast is 5.5:1 (profit) to 6.8:1 (loss) per UI-SPEC.
- **Text colors on tiles:** Ticker text (Body 600) and P&L % (Label) both use `text-fg` class (no direction-encoded text color). File: `HeatmapTile.tsx` lines 30-31.
- **Accent color usage:** `#ecad0a` accent is reserved for focus rings only: `focus-visible:outline-accent` appears on 5 interactive elements (watchlist select button, watchlist remove button, Retry button, trade inputs, positions). Never used on chart lines, tiles, or backgrounds. Files: `WatchlistRow.tsx` lines 43 and 68, `ChartOverlay.tsx` line 34, `TradeBar.tsx`, `PositionsTable.tsx`.
- **60/30/10 split:** Surface (60%): page background `#0d1117`. Secondary (30%): chart panels `#161b22` (panel), tile backgrounds via `tileFill`, selected/hover rows `#1c2128` (raised). Accent (10%): focus rings only. Maintained across all three chart panels.

### Pillar 4: Typography (4/4)

**PASS: Exactly 2 weights, 4 sizes, no deviations**

- **Font sizes:** Custom Tailwind classes map to fixed pixel sizes (verified in `globals.css`):
  - `text-label` → 12px (UI-SPEC "Label")
  - `text-body` → 14px (UI-SPEC "Body")
  - `text-heading` → 16px (UI-SPEC "Heading")
  - `text-display` → 20px (UI-SPEC "Display")
  Only these 4 sizes are used throughout Phase 4 components. No `text-xs`, `text-sm`, `text-lg`, `text-xl` or arbitrary sizes found.
- **Font weights:**
  - `font-normal` (400) — default, used for labels and body text
  - `font-semibold` (600) — used for titles, tickers, values that need emphasis
  No `font-medium`, `font-bold`, or `font-light` used anywhere in Phase 4 files.
- **Usage verification:**
  - Title bars: "Portfolio heatmap", "Portfolio value", ticker headline use `text-heading font-semibold` (16px, 600)
  - Numeric values (price, total, delta): `text-body font-semibold` (14px, 600) for emphasis, or `text-body` (14px, 400) for supporting text
  - Axis text, labels: `text-label` (12px, 400)
  - Heatmap tiles: ticker in `text-body font-semibold`, P&L % in `text-label` (both 400 default unless ticker)
  - Canvas axis labels: `fontSize: 12` passed to Lightweight Charts (matches `text-label` pixel size)
- **Line heights:** Custom Tailwind theme sets:
  - `text-label--line-height: 1.5`
  - `text-body--line-height: 1.5`
  - `text-heading--line-height: 1.2`
  - `text-display--line-height: 1.2`
  Matches UI-SPEC exactly (1.5 for body text, 1.2 for headings).
- **Tabular numbers:** `tabular-nums` class applied to all numeric values in title bars and heatmap tiles for alignment. File: `MainChartPanel.tsx` line 78, `PnlChartPanel.tsx` line 90, `HeatmapTile.tsx` text nodes.

### Pillar 5: Spacing (4/4)

**PASS: All spacing adheres to 4px scale**

- **Spacing scale:** Tailwind multiples of 4px:
  - `gap-1` = 4px (between title-bar label and heading)
  - `gap-2` = 8px (between title-bar value groups)
  - `gap-4` = 16px (between title, price, and change)
  - `p-2` = 8px (heatmap tile inner padding)
  - `p-6` = 24px (overlay padding)
  - `px-4` = 16px (horizontal padding for title bars and tiles)
  Verified across all Phase 4 components; no 12px, 20px, or other off-scale values.
- **Fixed component dimensions (not spacing tokens, allowed per UI-SPEC):**
  - Title bars: `h-10` = 40px (all panels)
  - Main chart: `h-80` = 320px (below 1024px), `lg:h-auto lg:min-h-40` = 160px minimum (at 1024px+)
  - Heatmap & P&L: `h-64` = 256px (below 1024px), `lg:h-auto lg:min-h-40` = 160px minimum (at 1024px+)
  - Borders: 1px or 2px (tile borders, selected row border-l-2)
- **Grid templates:** Arbitrary values allowed:
  - Workspace: `grid-rows-[minmax(0,5fr)_minmax(0,4fr)_auto_minmax(0,4fr)]` — row weights match design
  - Mid-row: `grid-cols-1 lg:grid-cols-2` — standard Tailwind
  File: `page.tsx` line 21.
- **No arbitrary spacing:** No `[20px]`, `[12px]`, or other off-scale `[...]` spacing values found. Heatmap tile positions use inline `left: tile.left` etc. (geometry, not spacing tokens).

### Pillar 6: Experience Design (4/4)

**PASS: Complete state coverage, correct selection and interaction rules**

- **State matrix completeness (12 explicit states across 3 panels):**
  - **Main chart (5 states):**
    - `main-chart-loading`: skeleton, `aria-busy="true"`, `aria-label="Loading chart"` (watching list load)
    - `main-chart-error`: error overlay, no Retry button (retry in watchlist panel)
    - `main-chart-empty`: empty overlay "No ticker selected", shows when selection.status ready and selected null
    - `main-chart-waiting`: waiting overlay "Collecting prices for {TICKER}", shows when selected but buffer < 2 points
    - `main-chart` (testid only when ready): chart box visible with data-ticker and data-points attributes
  - **Heatmap (4 states):**
    - `heatmap-loading`: skeleton, `aria-busy="true"`, `aria-label="Loading heatmap"` (watching portfolio load)
    - `heatmap-error`: error overlay with `heatmap-retry` button calling `usePortfolioStore.load()`
    - `heatmap-empty`: empty overlay "No positions to map", shows when portfolio loaded but no positions with value > 0
    - `heatmap-tiles` (testid only when tiles present): tiles container with `role="list"`
  - **P&L chart (4 states):**
    - `pnl-loading`: skeleton, `aria-busy="true"`, `aria-label="Loading portfolio value"` (watching history load)
    - `pnl-error`: error overlay with `pnl-retry` button calling `historyStore.load()`
    - `pnl-empty`: empty overlay "No portfolio history yet", shows when (no positions AND history <= 1 point) OR points < 2
    - `pnl-chart` (testid only when chart renders): chart box visible with data-points attribute
  Files: `MainChartPanel.tsx` lines 111-141, `HeatmapPanel.tsx` lines 46-69, `PnlChartPanel.tsx` lines 118-141.

- **Watchlist selection rules (selectionStore.sync, file: `selectionStore.ts` lines 20-25):**
  - Loading/error status: keep selected unchanged
  - Ready status with selected in list: keep selected
  - Ready status with selected removed: select first ticker in response order
  - Ready status with empty list: select null
  - Selection not persisted (page load always selects first)
  - Verified in `WatchlistPanel.tsx` line 49: calls `sync(view.kind, tickers)`
  - Interaction: click row or Enter on select button switches chart in same render

- **Selection UI (WatchlistRow.tsx, file: lines 30-75):**
  - Whole row clickable with `onClick={() => onSelect(ticker)}`
  - Remove button calls `e.stopPropagation()` to prevent selecting on remove
  - Selected row: `data-selected="true"` + `bg-raised` + `border-l-2 border-primary`
  - Unselected rows: `data-selected="false"` + `border-l-2 border-transparent` (no shift)
  - Select button: `data-testid={"select-" + ticker}`, `aria-label="Show {TICKER} chart"`, `aria-current="true"` when selected

- **Heatmap tiles (HeatmapTile.tsx, file: lines 20-34):**
  - Area proportional to live market value (computed by d3-hierarchy treemap)
  - Ordered by cost basis descending, then ticker (stable under price ticks, `heatmap.ts` line 42)
  - Tint by P&L %: `tileFill(pnlPercent)` returns green/red/neutral fill
  - Direction never by color alone: every tile has `aria-label` with signed P&L, and (when >= 48px tall) shows `fmtPct(pnlPercent)` text
  - Ticker shown when >= 48px wide AND >= 24px tall
  - P&L % shown when >= 48px tall (implies ticker is also shown)
  - Title bar layout: `data-testid="heatmap-tile-{TICKER}"`, `data-pnl="up|down|flat"`, `data-weight="{percent}"`, `title="{label}"`, `aria-label="{label}"`
  - Label sentence: `"{TICKER}: {fmtMoney(value)}, {weight}% of positions, P&L {fmtSigned(pnl)} ({fmtPct(pnlPercent)})"`
  - Motion: `transition-[left,top,width,height,background-color] duration-300 ease-out motion-reduce:transition-none`

- **P&L chart data (pnlSeries.ts, file: lines 10-23):**
  - History source: `GET /api/portfolio/history` returns ascending HistoryPoint[] (total_value, recorded_at)
  - Data processing: Parse ISO 8601 timestamps, collapse same-second points to last, add live point only when floor(now) > last history second
  - Live point: `{ time: now, value: liveTotals(portfolio, prices).total }` (same number as header total)
  - Strictly ascending output points
  - Chart renders exactly once per history fetch + live point computation

- **P&L title bar (PnlChartPanel.tsx, file: lines 87-99):**
  - Left: "Portfolio value" heading
  - Right: `pnl-value` showing `fmtMoney(liveTotal)`, gap-2, `pnl-delta` showing signed total-$10,000 with `fmtPct(delta/10000*100)`, gap-2, "since start" label (hidden below 640px: `hidden sm:inline`)
  - Delta color: `toneClass(deltaText)` → `text-up` (green) if positive, `text-down` (red) if negative, `text-fg` (gray) if zero
  - Numeric values: `tabular-nums whitespace-nowrap`, dimmed to `opacity-60` only while disconnected

- **Refetch cadence (PnlChartPanel.tsx, file: lines 28-36):**
  - On mount: `useEffect(load, [portfolio, load])` at line 28
  - Every 30s while mounted: `setInterval(() => { if (!isHistoryInFlight()) load() }, 30_000)`, skipped while fetch in flight
  - On portfolio change: portfolio identity change triggers the mount effect
  - On Retry: Retry button calls `load()`
  - Cleanup: `return () => clearInterval(id)` on unmount

- **Retry button behavior (ChartOverlay.tsx, file: lines 29-37):**
  - Shows only in error state (when `onRetry` provided)
  - Calls `onRetry()` which is `historyStore.load()` or `usePortfolioStore.load()`
  - `portfolioStore.load()` sets `failed: false` on start (file: `portfolioStore.ts`), so Retry shows loading skeleton until fetch settles
  - Styling: `h-8` (32px), `border border-border`, `hover:bg-raised`, `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`

- **Disconnected dimming (verified across panels):**
  - Main chart price/change: `opacity-60` only while status="disconnected" (file: `MainChartPanel.tsx` lines 18, 78, 85)
  - P&L title total/delta: `opacity-60` only while status="disconnected" (file: `PnlChartPanel.tsx` lines 22, 90, 95)
  - Heatmap tiles: NOT dimmed (connection indicator is the signal; dimming opaque overlays gives no extra info)
  - Chart canvases: NOT dimmed (lines simply stop extending when price updates stop)

- **D3 treemap configuration (heatmap.ts, file: line 53):**
  - `treemap<HeatLeaf>().tile(treemapSquarify).size([width, height]).paddingInner(0).round(true)`
  - Exact match to UI-SPEC requirements
  - `treemapSquarify` layout algorithm (imported from d3-hierarchy 3.1.2)
  - No padding between tiles (paddingInner=0); only 1px border between
  - round(true) ensures integer pixel coordinates

- **Dependencies pinned (package.json):**
  - `d3-hierarchy: "3.1.2"` (exact)
  - `@types/d3-hierarchy: "3.1.7"` (exact)
  - `lightweight-charts: "5.2.1"` (exact)
  - Matches UI-SPEC approved list from 04-01

---

## Files Audited

**Phase 4 new/modified components:**
- `frontend/src/components/MainChartPanel.tsx` (142 lines, new)
- `frontend/src/components/HeatmapPanel.tsx` (70 lines, new)
- `frontend/src/components/HeatmapTile.tsx` (35 lines, new)
- `frontend/src/components/PnlChartPanel.tsx` (142 lines, new)
- `frontend/src/components/ChartOverlay.tsx` (43 lines, new)
- `frontend/src/components/WatchlistRow.tsx` (modified, selection button and styles)
- `frontend/src/components/WatchlistPanel.tsx` (modified, selection sync)
- `frontend/src/app/page.tsx` (modified, workspace grid layout)

**Phase 4 new libraries:**
- `frontend/src/lib/selectionStore.ts` (31 lines, new)
- `frontend/src/lib/historyStore.ts` (new)
- `frontend/src/lib/heatmap.ts` (65 lines, new)
- `frontend/src/lib/pnlSeries.ts` (24 lines, new)
- `frontend/src/lib/useElementSize.ts` (new, ResizeObserver hook)
- `frontend/src/lib/format.ts` (modified, added fmtClock, fmtDay, fmtDateTime)
- `frontend/src/lib/chartTheme.ts` (modified, added CHART_COLORS.border/.raised, baseChartOptions)

**Backend (Phase 4 plan 01):**
- `backend/app/history.py` (new router, GET /api/portfolio/history)
- `backend/app/main.py` (modified, history router included)
- `backend/app/db.py` (modified, now_iso utility)

**Tests (verified in SUMMARY.md):**
- 254 unit tests passed (frontend)
- 11 backend tests for history passed
- 17 E2E smoke tests passed (with 5 portfolio-charts-specific tests)

---

## Audit Notes

**Code-only audit due to environment constraints.** The dev server cannot be long-lived due to process management restrictions, so screenshot capture was not performed. The UI has been thoroughly audited by examining:
- Component code structure and class names
- Copy strings and aria labels
- Color token usage and calculations
- Typography class assignments
- Spacing class patterns
- State management and overlay logic
- Interaction event handling
- API contract compliance
- Test coverage documentation from SUMMARY.md files

**All 4 execution plans in Phase 4 are marked complete with passing tests.** This review verifies that the *implemented code* matches the *approved UI-SPEC.md* contract.

---

*Phase: 04-charts-portfolio-visualizations*
*Audited: 2026-10-09*
*Auditor: Automated 6-pillar review*
