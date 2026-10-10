# Phase 4: Charts & Portfolio Visualizations - Pattern Map

**Mapped:** 2026-10-09
**Files analyzed:** 33 new/modified
**Analogs found:** 31 / 33 (all analogs verified git-tracked via `git ls-files`)

Paths are relative to `C:/Users/shola/Projects/finally`. No CONTEXT.md; RESEARCH.md and UI-SPEC are the authority. Resolved Open Question 1: history request-time snapshot inserts only if age >= MIN_INTERVAL_SECONDS AND total value differs from the latest snapshot.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `backend/app/history.py` | route + service | CRUD (read + guarded write) | `backend/app/portfolio.py` (+ `trading.py` snapshot insert, `db.transaction`) | exact |
| `backend/app/main.py` (mod) | config | wiring | itself, lines 9, 44-47 | exact |
| `backend/tests/test_history.py` | test | request-response | `backend/tests/test_portfolio.py` + `conftest.py` `client` | exact |
| `planning/API_CONTRACT.md` (mod) | doc | n/a | itself, history section (lines ~148-152) | exact |
| `frontend/src/lib/historyStore.ts` | store | request-response | `frontend/src/lib/portfolioStore.ts` | exact |
| `frontend/src/lib/historyStore.test.ts` | test | request-response | `frontend/src/lib/portfolioStore.test.ts` | exact |
| `frontend/src/lib/selectionStore.ts` (+test) | store | event-driven | `portfolioStore.ts` (reset fn, initial state fn) | role-match |
| `frontend/src/lib/heatmap.ts` (+test) | utility | transform | `frontend/src/lib/positions.ts` (pure, `livePosition`) | role-match |
| `frontend/src/lib/pnlSeries.ts` (+test) | utility | transform | `frontend/src/lib/totals.ts` / `Sparkline.tsx` `toData` | role-match |
| `frontend/src/lib/useElementSize.ts` | hook | event-driven | `frontend/src/lib/useMarketStream.ts` | partial |
| `frontend/src/lib/chartTheme.ts` (mod) | config | n/a | itself | exact |
| `frontend/src/lib/format.ts` (mod, +test) | utility | transform | itself (Intl formatters, lines 1-40) | exact |
| `frontend/src/lib/totals.ts` (mod) | utility | transform | itself | exact |
| `frontend/src/lib/api.ts` / `types.ts` (mod, +test) | service | request-response | `getPortfolio` in `api.ts` lines 11-15 | exact |
| `frontend/src/components/MainChartPanel.tsx` (+test) | component | streaming | `Sparkline.tsx` + `PositionsTable.tsx` (panel shell) | role-match |
| `frontend/src/components/PnlChartPanel.tsx` (+test) | component | request-response + polling | `Sparkline.tsx` + `PositionsTable.tsx` + `Header.tsx` | role-match |
| `frontend/src/components/HeatmapPanel.tsx`, `HeatmapTile.tsx` (+test) | component | transform | `PositionsTable.tsx` / `PositionRow.tsx` | role-match |
| `frontend/src/components/ChartOverlay.tsx` | component | n/a | `PositionsTable.tsx` `ErrorState`/`EmptyState` (lines 63-88) | role-match |
| `frontend/src/components/Sparkline.tsx` (mod) | component | streaming | itself (only `toData` moves to `chartTheme.ts`) | exact |
| `frontend/src/components/WatchlistRow.tsx` (mod) | component | event-driven | itself | exact |
| `frontend/src/components/WatchlistPanel.tsx` (mod) | component | CRUD | itself | exact |
| `frontend/src/components/Footer.tsx` (mod) | component | static | itself (comment only) | exact |
| `frontend/src/app/page.tsx` (mod) | component | composition | itself | exact |
| `frontend/src/test/fakeResizeObserver.ts` | test util | event-driven | `frontend/src/test/fakeEventSource.ts` | exact |
| `frontend/vitest.setup.ts` (mod) | config | n/a | itself | exact |
| `test/portfolio-charts.spec.ts` | test (E2E) | request-response | `test/trade.spec.ts` | role-match |
| existing tests to extend: `WatchlistPanel.test.tsx`, `Sparkline.test.tsx` (leave), `format.test.ts`, `api.test.ts` | test | | themselves | exact |

## Pattern Assignments

### `backend/app/history.py` (route, read + guarded write)

**Analogs:** `backend/app/portfolio.py` (router shape), `backend/app/db.py` (`transaction`, `connect`, `now_iso`), `backend/app/trading.py:90-95` (snapshot insert).

**Router/imports/handler pattern** (`portfolio.py` 1-9, 47-51):
```python
"""Portfolio read: cash plus positions valued from one price-cache snapshot."""
import logging
from fastapi import APIRouter, Request
from .db import USER_ID, connect
router = APIRouter()

@router.get("/api/portfolio")
def get_portfolio(request: Request) -> dict:
    """Current cash, positions and totals."""
    with connect(request.app.state.settings.db_path) as conn:
        return build_portfolio(conn, request.app.state.cache)
```
Sync `def` route, `connect(request.app.state.settings.db_path)`, `request.app.state.cache`. `build_portfolio(conn, cache)["total_value"]` is the single valuation.

**Atomic write pattern** (`db.py` 75-83): `with transaction(conn):` does `BEGIN IMMEDIATE`, rollback on error, `COMMIT` after. Use it around read-latest + conditional insert. Snapshot insert columns: `(id, user_id, total_value, recorded_at)` with `str(uuid.uuid4())`, `USER_ID`, `now_iso()` (second resolution, `%Y-%m-%dT%H:%M:%SZ`).

**Core (use RESEARCH Pattern 1 sketch, lines 166-202)** with the resolved guard: return without insert when `age.total_seconds() < MIN_INTERVAL_SECONDS or total == last["total_value"]`. `MIN_INTERVAL_SECONDS = 10`, `MAX_POINTS = 2000`. Read newest 2000 `ORDER BY recorded_at DESC, rowid DESC LIMIT ?`, return `{"history": [dict(r) for r in reversed(rows)]}`. Verify `datetime.fromisoformat("...Z")` on 3.12 (A6; fallback `.replace("Z", "+00:00")`). Docstrings, no inline comment noise, no defensive try/except.

### `backend/app/main.py` (modify)
Line 9: `from . import portfolio, trading, watchlist` -> add `history`. After line 47 `app.include_router(trading.router)` add `app.include_router(history.router)`; must stay above the `/api/{path:path}` catch-all (line 52).

### `backend/tests/test_history.py` (test)
**Analog:** `backend/tests/test_portfolio.py` (helpers: `connect(path)`, `init_db`, `now_iso`; direct SQL inserts use `INSERT ... VALUES ('default', ...)`), and `conftest.py` `client` fixture (lines 92-100: `FixedPriceSource`, all default tickers at 100.0, `TestClient(create_app(settings))` as context manager; `settings.db_path`).
```python
def test_fresh_portfolio_is_cash_only(settings):
    with TestClient(create_app(settings)) as client:
        r = client.get("/api/portfolio")
    assert r.status_code == 200
```
Recipes (RESEARCH 415-419): fresh DB -> exactly one 10000.0 point; backdate with `UPDATE portfolio_snapshots SET recorded_at='2020-01-01T00:00:00Z'` through `connect(settings.db_path)`; unchanged value after interval inserts nothing (the resolved rule: a never-traded DB stays at 1 point even after the interval); changed value (insert a position row or trade at a different price) after interval inserts exactly one and a repeat call inserts none; cap: insert 2005 rows, expect 2000 ascending, oldest 5 absent; trade adds a point. Run: `cd backend && uv run python -m pytest tests/test_history.py -q`.

### `frontend/src/lib/historyStore.ts` (store, request-response)
**Analog:** `frontend/src/lib/portfolioStore.ts` (full file, 43 lines). Copy exactly: `initialXState()` fn, module-level `issued`/`applied` ticket counters, `load()` takes ticket at start, applies only if `ticket > applied`, `.catch` sets `failed` only `if (ticket > applied)`, `resetXStore()` zeroes counters and calls `setState(initial)`.
```ts
let issued = 0;
let applied = 0;
export const usePortfolioStore = create<PortfolioState & Actions>()((set) => ({
  ...initialPortfolioState(),
  load: () => {
    const ticket = ++issued;
    getPortfolio().then((portfolio) => {
        if (ticket <= applied) return;
        applied = ticket;
        set({ portfolio, failed: false });
      }).catch(() => { if (ticket > applied) set({ failed: true }); });
  },
```
Adaptations: state `{history: HistoryPoint[] | null, failed: boolean}`; no `applyTrade`; add an `inFlight` counter (increment on start, decrement in `.finally`) exposed so the 30 s interval can skip when a fetch is running (Retry/portfolio-change loads are never skipped). Export `resetHistoryStore()`.

### `frontend/src/lib/historyStore.test.ts`
**Analog:** `portfolioStore.test.ts`. Copy `manualFetch()` (hand-settled promises), `settle()`, `state()`, `beforeEach(() => resetXStore())`, and the cases: load applies; rejected load with no data sets failed; rejected load keeps existing data; later-started load wins; reset restores counters.

### `frontend/src/lib/selectionStore.ts` (+ test)
**Analog:** shape of `portfolioStore.ts` (initial-state function + `resetSelectionStore()`); implement `sync(status, tickers)` per UI-SPEC "Selection rules". No fetch; no tickets. `resetSelectionStore()` must be called in `beforeEach` of watchlist/main-chart tests.

### `frontend/src/lib/heatmap.ts` (utility, transform)
**Analog:** `frontend/src/lib/positions.ts` (pure function over `Position`, no React). Reuse `livePosition(p, price)` for value/pnl/pnlPercent; cost basis = `p.market_value - p.unrealized_pnl` (order leaves by cost basis desc, ties ticker). `tileFill` and `layout` code: RESEARCH lines 263-268 (guard empty/zero size before `hierarchy`) and 379-384. Price rule: `prices[ticker]?.price ?? position.current_price`. Skip `value <= 0`.

### `frontend/src/lib/pnlSeries.ts` (utility, transform)
**Analog:** `Sparkline.tsx` `toData` (lines 11-13) and `totals.ts`. Code: RESEARCH 390-402 (`buildPnlSeries`: dedupe same second keeping last, append live point only when `floor(now) > last.time`). Strictly ascending required by LWC `setData`.

### `frontend/src/lib/useElementSize.ts` (hook)
**Analog:** `frontend/src/lib/useMarketStream.ts` (effect-with-cleanup hook; not read in detail, mirror its `useEffect` + cleanup style). Code: RESEARCH 275-288. The ref'd element must be mounted on first render (Pitfall 7).

### `frontend/src/lib/chartTheme.ts` (modify)
Current entire file (line 2): `export const CHART_COLORS = { primary: "#209dd7", muted: "#8b949e" };`. Add `border: "#30363d"`, `raised: "#1c2128"`; add `baseChartOptions()` (no args; each chart spreads overrides) per RESEARCH 213-232 with `typeof t === "number"` narrowing; move `toData` here from `Sparkline.tsx` (lines 11-13) and have `Sparkline` import it. Do not change Sparkline's options (keeps old `vi.mock` factories valid, Pitfall 3).

### `frontend/src/lib/format.ts` (modify)
**Analog:** itself: module-level `new Intl.NumberFormat(...)` constants, functions take `Num`, `MISSING` constant. Add `fmtClock/fmtDay/fmtDateTime` with module-level `Intl.DateTimeFormat("en-US", {..., hourCycle: "h23"})`; `fmtDateTime = fmtDay(s) + " " + fmtClock(s)` (Pitfall 9). Tests pin `TZ` or compute with same Intl options.

### `frontend/src/lib/totals.ts` (modify)
Add `export const STARTING_CASH = 10_000;` above `liveTotals`.

### `frontend/src/lib/api.ts` / `types.ts` (modify)
**Analog** (`api.ts` 11-15):
```ts
export async function getPortfolio(): Promise<Portfolio> {
  const res = await fetch("/api/portfolio");
  if (!res.ok) throw new Error("portfolio " + res.status);
  return (await res.json()) as Portfolio;
}
```
Add `getPortfolioHistory()` returning `body.history` from `{history: HistoryPoint[]}` (like `getWatchlist` lines 4-9). Add `HistoryPoint = { total_value: number; recorded_at: string }` to `types.ts`. Extend `api.test.ts` with non-2xx throws.

### `frontend/src/components/MainChartPanel.tsx` (component, streaming)
**Analog:** `Sparkline.tsx` (chart lifecycle) and `PositionsTable.tsx` (panel shell).

Chart lifecycle to copy (`Sparkline.tsx` 22-59): `createChart(box.current!, {...})` in a `useEffect`, `addSeries(LineSeries, {...})`, `fit.current = () => chart.timeScale().fitContent()`, `series.current = line`, cleanup `series.current = null; chart.remove()`; a second effect `[buffer]` does `series.current.setData(toData(buffer)); fit.current()`. Difference: main chart creates once with `[]` deps (chart persists across ticker changes), and a ticker effect re-seeds; use `useMarketStore((s) => s.spark[selected])`.

Panel shell to copy (`PositionsTable.tsx` 15-22):
```tsx
<section data-testid="positions-panel" className="flex min-h-0 flex-1 flex-col bg-panel">
  <div className="flex h-10 shrink-0 items-center border-b border-border px-4">
    <h2 className="text-heading font-semibold">Positions</h2>
  </div>
  <div className="min-h-0 flex-1 overflow-auto">
```
Chart box: parent `relative min-h-0 flex-1`, box `absolute inset-0`, always mounted; `data-testid={ready ? "main-chart" : undefined}`; overlays are siblings (Pitfall 7). Stale dim: `useMarketStore((s) => s.status === "disconnected")` as in `WatchlistRow.tsx` 22-23 (`opacity-60`). Price/change via `fmtMoney/fmtPct/toneClass`.

### `frontend/src/components/PnlChartPanel.tsx`
**Analogs:** `Sparkline.tsx` (lifecycle, `AreaSeries` instead), `PositionsTable.tsx` (store selectors `usePortfolioStore((s) => s.portfolio)`, `failed`, `load`; skeleton/error/empty branches), `Header.tsx` (effect on store + `liveTotals(portfolio, prices)` for the live total, lines 12-31). Fetch triggers: mount `useEffect(load, [load])` (Header pattern), `setInterval(..., 30_000)` with cleanup (skip if in flight), effect on `portfolio` identity. Live point recompute keyed by `floor(now)`. Selector `useMarketStore((s) => s.prices)` (as Header; avoid object-building selectors, Pitfall 5).

### `frontend/src/components/HeatmapPanel.tsx`, `HeatmapTile.tsx`
**Analog:** `PositionsTable.tsx` branch structure (`!portfolio && !failed` skeleton, `!portfolio && failed` error with `usePortfolioStore.load` retry, empty, populated) and `PositionRow.tsx` (per-row live price; not read, consult when building). Tiles: absolutely positioned `div role="listitem"` with inline `left/top/width/height`; classes per UI-SPEC. Use `useElementSize` on an always-mounted tiles box.

### `frontend/src/components/ChartOverlay.tsx`
**Analog** (`PositionsTable.tsx` 63-88): heading `text-heading font-semibold`, body `text-body`, `p-6`, Retry button classes:
```tsx
className="mt-4 h-8 rounded-sm border border-border px-4 hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
```
Props: testId, heading, body, optional onRetry + retryTestId; wrapper `absolute inset-0 bg-panel`. Skeleton pattern: `aria-busy="true" aria-label="Loading ..."` with `bg-raised motion-safe:animate-pulse` (lines 51-60).

### `frontend/src/components/WatchlistRow.tsx` (modify)
Current ticker cell (lines 27-29): `<td className="px-4 font-semibold truncate" title={ticker}>{ticker}</td>`. Change to a first cell with `border-l-2 border-primary|border-transparent` containing `<button type="button" data-testid={"select-"+ticker} aria-label={"Show "+ticker+" chart"} aria-current=... title={ticker} className="font-semibold truncate text-left" + focus classes>`. Row (line 26) gains `onClick`, `cursor-pointer`, `data-selected`, `bg-raised` when selected. Remove button (lines 40-48): add `stopPropagation` in its `onClick`. Keep exactly 5 `<td>`. Props gain `selected`, `onSelect`. Pitfall 11: the matched element for `getByText("ABCDEFGHIJ")` is now the button, so the button needs `truncate` and `title`. Focus classes already used: `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`.

### `frontend/src/components/WatchlistPanel.tsx` (modify)
Add an effect after the existing status effect (line 43), same style as lines 41-43:
```tsx
useEffect(() => { useSelectionStore.getState().sync(view.kind, view.kind === "ready" ? view.items.map(i => i.ticker) : []); }, [view]);
```
Read `selected`/`select` from the store and pass to `<WatchlistRow key=... item busy onRemove selected onSelect />` at line 161.

### `frontend/src/app/page.tsx` (modify)
Replace the workspace (lines 18-21) with the 4-row grid from UI-SPEC Layout: `<section data-testid="workspace" className="grid min-h-0 h-full lg:grid-rows-[minmax(0,5fr)_minmax(0,4fr)_auto_minmax(0,4fr)] lg:overflow-hidden ...">` holding `MainChartPanel`, `<div className="grid min-h-0 grid-cols-1 lg:grid-cols-2">` (HeatmapPanel + PnlChartPanel), `TradeBar`, `PositionsTable`. `PositionsTable` currently uses `flex-1`; verify it still fits as a grid child.

### `frontend/src/test/fakeResizeObserver.ts` and `vitest.setup.ts`
**Analog:** `fakeEventSource.ts` (static `instances`, constructor pushes, driver methods). Add `static trigger(target, width, height)` calling the stored callback with `[{ target, contentRect: { width, height } }]`. In `vitest.setup.ts` mirror lines 6-10:
```ts
vi.stubGlobal("EventSource", FakeEventSource);
beforeEach(() => { FakeEventSource.instances.length = 0; });
```
add `vi.stubGlobal("ResizeObserver", FakeResizeObserver)` and the matching `instances.length = 0`.

### Chart component tests (`MainChartPanel`, `PnlChartPanel`, `HeatmapPanel`)
**Analog:** `Sparkline.test.tsx`: `vi.hoisted` bag of mock fns (lines 6-14), `beforeEach` with `vi.restoreAllMocks()`, `mockClear()` loop, `useMarketStore.setState(initialMarketState())` (45-49), `send(price, nowSeconds)` using `vi.spyOn(Date, "now")` + `act(...)` (40-43), `frame()` builder. **Difference (Pitfall 3):** do NOT copy its full-replacement `vi.mock` factory (lines 16-21); use `importOriginal` partial mock:
```ts
vi.mock("lightweight-charts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("lightweight-charts")>()),
  createChart: vi.fn(() => ({ addSeries: h.addSeries, remove: h.remove, timeScale: () => ({ fitContent: h.fitContent }) })),
}));
```
Panels test also call `resetPortfolioStore()` / `resetHistoryStore()` / `resetSelectionStore()` in `beforeEach`; fetch stubbed with `vi.stubGlobal("fetch", ...)`; fake timers for 30 s refetch (RESEARCH 408-412).

### `test/portfolio-charts.spec.ts` (E2E)
**Analog:** `test/trade.spec.ts`: `import { test, expect } from "@playwright/test"`, `const MONEY = /^\$[\d,]+\.\d{2}$/`, `page.goto("/")`, wait for `header-cash` `toHaveText(MONEY)`, drive `trade-ticker`/`trade-quantity`/`trade-buy`, assert by `getByTestId`. File name must sort after `connection.spec.ts` (Pitfall 8). Use polling regex for `data-points`; stub empty states with `page.route`. Requires fresh `npm run build` before running.

## Shared Patterns

### Panel shell and state branches
**Source:** `frontend/src/components/PositionsTable.tsx` 15-22, 51-88. **Apply to:** MainChartPanel, HeatmapPanel, PnlChartPanel, ChartOverlay. Title bar `flex h-10 shrink-0 items-center border-b border-border px-4`, heading `text-heading font-semibold`, skeleton/error/empty copy blocks `p-6`, fixed error strings (never echo server text).

### Ticket-guarded store
**Source:** `frontend/src/lib/portfolioStore.ts`. **Apply to:** historyStore (and its test from `portfolioStore.test.ts`).

### Disconnected dimming
**Source:** `WatchlistRow.tsx` 22-23: `const dim = useMarketStore((s) => s.status === "disconnected"); const stale = dim ? " opacity-60" : "";`. **Apply to:** title-bar numbers in all three panels.

### Number formatting
**Source:** `frontend/src/lib/format.ts` (`fmtMoney`, `fmtPct`, `fmtSigned`, `toneClass`, `MISSING`). All numbers go through it; `tabular-nums whitespace-nowrap`.

### Live valuation
**Source:** `frontend/src/lib/totals.ts` `liveTotals`, `frontend/src/lib/positions.ts` `livePosition`. Same number as the header; never recompute formulas.

### zustand selectors
Use `useMarketStore((s) => s.prices)` as `Header.tsx` does; never a selector returning a fresh object/array (Pitfall 5).

### Backend transaction and valuation
**Source:** `backend/app/db.py` `transaction`, `backend/app/portfolio.py` `build_portfolio`. **Apply to:** `history.py`.

### Test isolation
Backend: `conftest.py` `client`/`settings` fixtures. Frontend: store `reset*` in `beforeEach`; global `ResizeObserver` stub.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `frontend/src/lib/useElementSize.ts` | hook | event-driven | No ResizeObserver code exists; use RESEARCH Pattern 4 (mirrors `useMarketStream` only in style) |
| d3-hierarchy treemap layout in `heatmap.ts` | utility | transform | No treemap/layout code exists; use RESEARCH Pattern 3 (verified by running) |

## Notes for the planner
- Package gate: `d3-hierarchy@3.1.2` and `@types/d3-hierarchy@3.1.7` via `npm install --save-exact` (dev for types) behind a `checkpoint:human-verify`; run `npm run build` and `npx tsc --noEmit` after install (A3).
- Leave `Sparkline.tsx` options untouched; only `toData` moves, so `Sparkline.test.tsx` and `WatchlistPanel.test.tsx` mock factories stay valid (WatchlistPanel renders Sparkline). `WatchlistPanel.test.tsx` needs `resetSelectionStore()` in `beforeEach`.
- Add the unchanged-value / 10 s sentence to `planning/API_CONTRACT.md`.
- All analog files listed were confirmed tracked by `git ls-files` (frontend, backend, test directories).

## Metadata

**Analog search scope:** `backend/app`, `backend/tests`, `frontend/src`, `frontend/vitest.setup.ts`, `test/`
**Files scanned:** about 75 tracked files listed, 27 read
**Pattern extraction date:** 2026-10-09
