# Phase 4: Charts & Portfolio Visualizations - Research

**Researched:** 2026-10-09
**Domain:** Lightweight Charts 5.2.1 canvas charts, d3-hierarchy treemap in plain React divs, SQLite snapshot-on-request history endpoint, Vitest/Playwright coverage for canvas and layout
**Confidence:** HIGH (installed sources read, compiled and run this session), with one MEDIUM design risk flagged in Pitfall 1

## Summary

Phase 4 is one small backend endpoint plus a frontend re-slot. The backend work is `GET /api/portfolio/history`, which does not exist yet: `main.py` includes only the stream, watchlist, portfolio and trading routers, and `grep history backend/app` finds nothing. The seeded $10,000 snapshot and the after-trade snapshot already exist (`init_db`, `execute_trade`), so PORT-07 reduces to a read route, a min-interval guarded snapshot-on-request, and a 2000-row cap. The API contract text for the route is already written and needs no edit apart from naming the interval.

The frontend work is three panels (main price chart, treemap heatmap, portfolio value chart), watchlist selection, and one shared overlay. Every library API the UI-SPEC assumes exists in the installed `lightweight-charts` 5.2.1 and type-checks under the project's TypeScript 7.0.2, with one required correction: `tickMarkFormatter` and `timeFormatter` receive `Time` (a union that includes strings), not `number`, so `fmtClock(t)` as written in the UI-SPEC will not compile and needs a `typeof t === "number"` narrow. `d3-hierarchy` 3.1.2 and `@types/d3-hierarchy` 3.1.7 are not installed; both pass the legitimacy check (OK, 20M and 22M weekly downloads, no postinstall) and need the same user package-approval gate prior phases used. The treemap behaves exactly as the UI-SPEC assumes once an empty-children guard is added.

One design conflict needs a decision before planning: snapshot-on-request makes the "history has at most 1 point" rule in UI-SPEC Decision 8 unreliable (Pitfall 1). The recommended fix is a one-line backend guard (skip the request-time snapshot when the total value is unchanged), which keeps the user-confirmed empty-state rule true without touching the UI.

**Primary recommendation:** Build the backend history route first (small, independent), gate and install the two d3 packages, build pure libs (`heatmap.ts`, `pnlSeries.ts`, formatters, stores, `useElementSize`) with unit tests, then the three panels, then re-slot `page.tsx`, then one new E2E spec that sorts after `connection.spec.ts`. Mock `lightweight-charts` in tests with `importOriginal` (real enums, fake `createChart`), and stub `ResizeObserver` globally in `vitest.setup.ts`.

<user_constraints>
## User Constraints (from CONTEXT.md)

There is no CONTEXT.md (the user chose to plan without discuss-phase). `04-UI-SPEC.md` (status: approved 2026-10-09) is the design authority and is treated as locked, equivalent to CONTEXT.md decisions.

### Locked Decisions
- UI-SPEC Decisions Recorded 1-10 (workspace order 5fr / 4fr / auto(72px) / 4fr; main chart reuses the sparkline buffer, last 300 one-second points; selection only from watchlist rows; charts not pannable or zoomable; heatmap alpha `0.15 + 0.35 * min(|pnl_percent| / 10, 1)`, text always `fg`, leaves ordered by cost basis; P&L chart is an `AreaSeries` with a live "now" point refetched every 30 s; logo on the main chart only; Phase 5 owns re-flowing the mid row).
- Decision 8, CONFIRMED BY THE USER 2026-10-09 (verbatim): "ROADMAP criterion 4 says that 'with no positions' the P&L chart shows an explicit empty state, while criterion 3 says the chart starts with the seeded $10,000 point. This spec reconciles them as: empty state when no positions are held AND history has at most one point (the user has never traded); once any trade has happened the chart renders even if every position is later closed, so closed-out history is not hidden."
- New dependencies, exactly: `d3-hierarchy@3.1.2` (dependency), `@types/d3-hierarchy@3.1.7` (dev dependency). Nothing else.
- No new `@theme` tokens, no new type sizes or weights; every `data-testid` in the UI-SPEC contract table.
- The chat panel is Phase 5 and is NOT built here.

### Claude's Discretion
- Backend: module layout, the min-interval value, the query shape for the history route (UI-SPEC and contract do not fix them).
- Frontend: internal structure of libs and hooks, test-mock strategy, E2E file naming and state isolation.

### Deferred Ideas (OUT OF SCOPE)
- Pan/zoom, heatmap tile clicks or selection from positions, persisted selection, a price-history backend endpoint, longer main-chart window, chat docking re-flow (Phase 5), `data-testid` audit (Phase 6).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UI-07 | Clicking a ticker shows it in the main chart; a default ticker is selected on load | `selectionStore.sync` rules; LWC v5 `LineSeries` pattern from `Sparkline.tsx`; shared `toData`; always-mounted chart box; mock strategy |
| PORT-07 | `GET /api/portfolio/history`; snapshot recorded on request, min-interval guarded | Route is missing (verified); seeded and after-trade snapshots exist; guard design, SQL, race handling, test recipe, Pitfall 1 |
| PUI-03 | Heatmap sizes positions by weight, colors by P&L | d3-hierarchy behaviour verified by running it; `buildTiles`/`tileFill` pure functions; `useElementSize` and the jsdom `ResizeObserver` stub |
| PUI-04 | P&L chart from snapshots, 30 s refetch, live "now" point | `AreaSeries` + `TickMarkType` typing verified; `buildPnlSeries`; `historyStore` ticket guard; fake-timer test recipe |
| PUI-07 | Explicit empty states for watchlist, positions, heatmap, P&L chart | State matrix, `ChartOverlay`; E2E must stub or reset state, not delete tickers from the shared DB |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

From `C:\Users\shola\.claude\CLAUDE.md`, `./CLAUDE.md`, `./.claude/CLAUDE.md`:
- Python only via `uv`: `uv run`, `uv add`; backend tests run as `uv run python -m pytest` from `backend/` (bare `pytest.exe` is blocked by App Control).
- Simple, incremental; no over-engineering; no defensive programming; short modules and functions; clear names; docstrings over inline comments; no emojis in code, prints or logs; concise README.
- Use current library APIs (LWC v5 `addSeries`, FastAPI `lifespan`, zustand 5).
- TLS verification stays on. Do not install packages during research (this research installed nothing; tarballs were unpacked only under the session scratchpad).
- Single container, one origin, no CORS; API changes only by editing `planning/API_CONTRACT.md`.
- `lightweight-charts` v4 API (`addLineSeries`) is forbidden; keep the TradingView attribution (logo on the main chart, footer link).
- `create-next-app` defaults, `next/font/google`, `cacheComponents` are forbidden (not relevant: no scaffolding in this phase).
- GSD enforcement: file edits happen inside a GSD workflow (`/gsd-execute-phase`).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Portfolio value history (list, snapshot-on-request, cap) | API / Backend | Database / Storage | The snapshot value must come from the server-side price cache and be written under a transaction; the client cannot be trusted to post values |
| Seeded $10,000 point, after-trade snapshot | Database / Storage (already built) | API / Backend | `init_db` and `execute_trade` already write them; nothing to build |
| Live "now" point on the P&L chart | Browser / Client | — | Same number as the header total (`liveTotals`), never persisted |
| Main chart price series | Browser / Client | — | Built from the SSE buffer (`spark`); no server price history exists |
| Ticker selection | Browser / Client | — | Ephemeral client state, not persisted |
| Treemap layout and tile colors | Browser / Client | — | Pure function of positions, live prices and the measured box |
| Empty / loading / error states | Browser / Client | — | Derived from store state |
| Min-interval guard / flood protection | API / Backend | — | Must hold regardless of how many tabs or clients poll |

## Standard Stack

### Core (already installed unless marked)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| lightweight-charts | 5.2.1 (installed) | Main chart, P&L chart, sparklines | Fixed by PROJECT.md decision 14; v5 `addSeries(Definition, opts)` verified in `dist/typings.d.ts` |
| zustand | 5.0.15 (installed) | `selectionStore`, `historyStore` | Same pattern as `portfolioStore` and `store.ts` |
| d3-hierarchy | 3.1.2 (**NOT installed**) | `hierarchy`, `treemap`, `treemapSquarify` | Fixed by `.claude/CLAUDE.md`; ESM, zero dependencies, `sideEffects: false` |
| @types/d3-hierarchy | 3.1.7 (**NOT installed**, dev) | Types | Latest on registry; `dependencies: {}` |
| Vitest / RTL / jsdom | 5.0.3 / 16.3.3 / 30.1.2 (installed) | Unit tests | Baseline: 13 files, 162 tests, about 4 s [VERIFIED: ran `npx vitest run`] |
| FastAPI + sqlite3 | 0.142.2 / stdlib | History route | Existing `connect` / `transaction` / `build_portfolio` helpers |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| d3-hierarchy | Recharts / ECharts treemap | Already rejected in `.claude/CLAUDE.md`; not revisited |
| Fake `createChart` with hand-rolled enums | `importOriginal` partial mock | Partial mock keeps real `AreaSeries`, `CrosshairMode`, `TickMarkType`, `LineStyle`; hand-rolled enums break on the first missing export (Pitfall 3) |

**Installation (after the human package gate; exact pins like the other dependencies in `frontend/package.json`):**
```bash
cd frontend
npm install --save-exact d3-hierarchy@3.1.2
npm install --save-dev --save-exact @types/d3-hierarchy@3.1.7
```
`frontend/package.json` pins `lightweight-charts` and `zustand` without a caret, so use `--save-exact` to match.

**Version verification:** `npm view d3-hierarchy version` returned `3.1.2` (modified 2022-06-14, license ISC, unpacked 136,230 bytes); `npm view @types/d3-hierarchy version` returned `3.1.7` (39,915 bytes) [VERIFIED: npm registry].

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| d3-hierarchy | npm | latest 3.1.2 published 2022-04-02 (long-lived d3 module) | 20,280,848/wk | github.com/d3/d3-hierarchy | OK | Approved (still needs the user package gate, same as Phases 1-3) |
| @types/d3-hierarchy | npm | latest 3.1.7 published 2024-03-18 | 22,329,801/wk | github.com/DefinitelyTyped/DefinitelyTyped | OK | Approved (same gate) |

Evidence: `gsd-tools query package-legitimacy check --ecosystem npm d3-hierarchy @types/d3-hierarchy` returned `OK` for both, `postinstall: null`, `deprecated: false`. Both package names come from `.claude/CLAUDE.md` (project-authoritative) and from the UI-SPEC, not from web search [VERIFIED: gsd-tools seam + npm registry]. `d3-hierarchy` 3.1.2 `package.json` read from the unpacked tarball: `"type": "module"`, `"sideEffects": false`, `exports: {"umd": ..., "default": "./src/index.js"}`, no runtime dependencies.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
**Planner action:** the first frontend plan keeps a `checkpoint:human-verify` (package approval) task before `npm install`, as `02-01-SUMMARY.md` "Approved packages" did, listing exactly these two pins.

## Architecture Patterns

### System Architecture Diagram

```
SSE /api/stream/prices ──► useMarketStream ──► useMarketStore {prices, spark[ticker], status}
                                                     │             │
 GET /api/watchlist ─► WatchlistPanel(view) ─sync─► selectionStore {status, selected}
                                                     │             │
        click/Enter on row ──select(ticker)──────────┘             │
                                                                    ▼
                          MainChartPanel: spark[selected] ─► toData ─► LineSeries.setData ─► fitContent
                                                     
 GET /api/portfolio ─► usePortfolioStore {portfolio} ──┬─► HeatmapPanel: positions x prices
        (Header load, reconnect load, trade response)  │      ─► buildTiles(w,h) via useElementSize ─► absolute divs
                                                       │
                                                       ├─► identity change ─► historyStore.load()
                                                       │
 GET /api/portfolio/history ◄── every 30 s / Retry / mount / portfolio change
        │  (server: lock, maybe INSERT snapshot if interval elapsed and value changed, SELECT newest 2000, ascending)
        ▼
   historyStore {history|null, failed} ─► buildPnlSeries(history, floor(now), liveTotal) ─► AreaSeries.setData ─► fitContent
```

### Recommended Project Structure
```
backend/app/history.py            # router + snapshot guard (new, short module)
backend/tests/test_history.py     # new
frontend/src/lib/heatmap.ts       # buildTiles, tileFill (pure)
frontend/src/lib/pnlSeries.ts     # buildPnlSeries (pure)
frontend/src/lib/selectionStore.ts
frontend/src/lib/historyStore.ts
frontend/src/lib/useElementSize.ts
frontend/src/lib/chartTheme.ts    # + border, raised, baseChartOptions(), toData (shared with Sparkline)
frontend/src/lib/format.ts        # + fmtClock, fmtDay, fmtDateTime
frontend/src/lib/totals.ts        # + STARTING_CASH
frontend/src/components/{MainChartPanel,HeatmapPanel,HeatmapTile,PnlChartPanel,ChartOverlay}.tsx (+ tests)
frontend/src/test/fakeResizeObserver.ts   # mirrors fakeEventSource.ts
test/portfolio-charts.spec.ts     # name matters, see Pitfall 8
```

### Pattern 1: Backend history route (PORT-07)
**What:** one sync `def` route; under `transaction(conn)` (BEGIN IMMEDIATE) read the newest snapshot, insert a new one only if the interval elapsed (and the value changed, see Pitfall 1), then return the newest 2000 ascending.
**Facts it builds on (read this session):**
- `portfolio_snapshots` columns: `"id TEXT PRIMARY KEY, user_id TEXT NOT NULL DEFAULT 'default', total_value REAL NOT NULL, recorded_at TEXT NOT NULL"` [VERIFIED: backend/app/db.py:41-46].
- Timestamp format: `datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")` in `now_iso()` [VERIFIED: backend/app/db.py:58-60]. Second resolution, so same-second snapshots are possible.
- Seed: `init_db` inserts `(str(uuid.uuid4()), USER_ID, STARTING_CASH, now)` only into a fresh database, `STARTING_CASH = 10000.0` [VERIFIED: backend/app/db.py:10, 103-106].
- After-trade: `execute_trade` inserts a snapshot of `portfolio["total_value"]` inside its transaction [VERIFIED: backend/app/trading.py:90-95].
- Contract (verbatim): "`200 {"history": [{"total_value": 10000.0, "recorded_at": "2026-10-07T12:00:00Z"}]}`, ascending by `recorded_at`, at most the 2000 most recent entries. The server may first record a snapshot, guarded by a minimum interval." [VERIFIED: planning/API_CONTRACT.md:148-152].
- Routers must be included above the `/api/{path:path}` catch-all in `main.py` [VERIFIED: backend/app/main.py:44-52].
```python
# Sketch; MIN_INTERVAL_SECONDS = 10 is [ASSUMED] (see Assumptions A2).
"""Portfolio value history: newest snapshots, with a guarded snapshot on request."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request

from .db import USER_ID, connect, now_iso, transaction
from .portfolio import build_portfolio

router = APIRouter()
MIN_INTERVAL_SECONDS = 10
MAX_POINTS = 2000          # from the contract: "at most the 2000 most recent entries"


def record_if_due(conn, cache) -> None:
    """Insert a snapshot unless the latest is younger than the interval (or unchanged in value)."""
    with transaction(conn):
        last = conn.execute(
            "SELECT total_value, recorded_at FROM portfolio_snapshots WHERE user_id = ? "
            "ORDER BY recorded_at DESC, rowid DESC LIMIT 1", (USER_ID,)).fetchone()
        age = datetime.now(timezone.utc) - datetime.fromisoformat(last["recorded_at"])
        total = build_portfolio(conn, cache)["total_value"]
        if age.total_seconds() < MIN_INTERVAL_SECONDS or total == last["total_value"]:
            return
        conn.execute("INSERT INTO portfolio_snapshots (id, user_id, total_value, recorded_at) "
                     "VALUES (?, ?, ?, ?)", (str(uuid.uuid4()), USER_ID, total, now_iso()))


@router.get("/api/portfolio/history")
def get_history(request: Request) -> dict:
    with connect(request.app.state.settings.db_path) as conn:
        record_if_due(conn, request.app.state.cache)
        rows = conn.execute(
            "SELECT total_value, recorded_at FROM portfolio_snapshots WHERE user_id = ? "
            "ORDER BY recorded_at DESC, rowid DESC LIMIT ?", (USER_ID, MAX_POINTS)).fetchall()
    return {"history": [dict(r) for r in reversed(rows)]}
```
Notes: `datetime.fromisoformat` accepts the trailing `Z` on Python 3.12 (project floor is `>=3.12`) [ASSUMED: language behaviour; confirm with one run in the first task]. `rowid` exists because the table is not `WITHOUT ROWID`. The `total == last` clause is the Pitfall 1 mitigation. Route is sync `def` so FastAPI runs it in its threadpool, same as `get_portfolio`. Register with `app.include_router(history.router)` above the catch-all.

### Pattern 2: Lightweight Charts v5 chart component (main and P&L)
**What:** create the chart once in a `useEffect` with `[]`, keep the series in a ref, a second effect pushes data, cleanup calls `chart.remove()`. This is exactly `Sparkline.tsx` [VERIFIED: frontend/src/components/Sparkline.tsx], which uses `createChart(box.current!, {...})`, `chart.addSeries(LineSeries, {...})`, `chart.timeScale().fitContent()`, and `series.current = null; chart.remove()` in cleanup.
**Type-check evidence (TS 7.0.2, `npx tsc --noEmit -p .`, zero errors, scratch file deleted afterwards):**
```ts
import { AreaSeries, ColorType, createChart, CrosshairMode, LineSeries, LineStyle, TickMarkType } from "lightweight-charts";
import type { ChartOptions, DeepPartial, ISeriesApi, Time, UTCTimestamp } from "lightweight-charts";

export function baseChartOptions(): DeepPartial<ChartOptions> {
  return {
    autoSize: true,
    layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#8b949e",
              fontFamily: "system-ui", fontSize: 12, attributionLogo: false },
    grid: { vertLines: { visible: false }, horzLines: { color: "#30363d" } },
    crosshair: { mode: CrosshairMode.Normal,
                 vertLine: { color: "#8b949e", style: LineStyle.Dashed, labelBackgroundColor: "#1c2128" },
                 horzLine: { color: "#8b949e", style: LineStyle.Dashed, labelBackgroundColor: "#1c2128" } },
    handleScroll: false, handleScale: false,
    rightPriceScale: { visible: true, borderColor: "#30363d", scaleMargins: { top: 0.1, bottom: 0.1 } },
    timeScale: {
      visible: true, timeVisible: true, secondsVisible: false, rightOffset: 0, borderColor: "#30363d",
      tickMarkFormatter: (t: Time, type: TickMarkType) => {
        if (typeof t !== "number") return null;               // Time includes BusinessDay and string
        return type === TickMarkType.Time || type === TickMarkType.TimeWithSeconds ? clock(t).slice(0, 5) : day(t);
      },
    },
    localization: { timeFormatter: (t: Time) => (typeof t === "number" ? clock(t) : String(t)) },
  };
}
const area: ISeriesApi<"Area"> = chart.addSeries(AreaSeries, { lineColor: "#209dd7",
  topColor: "rgb(32 157 215 / 0.28)", bottomColor: "rgb(32 157 215 / 0)", lineWidth: 2,
  priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: true,
  priceFormat: { type: "price", precision: 2, minMove: 0.01 } });
area.setData([{ time: 1 as UTCTimestamp, value: 2 }]);   // a bare number fails type-check (verified with @ts-expect-error)
```
In the real file `clock` / `day` are `fmtClock` / `fmtDay`, and the two charts differ in `secondsVisible` (main: true, P&L: false) and `attributionLogo` (main: default true, P&L: false), so `baseChartOptions()` should take no arguments and each chart spreads its own overrides on top.

**Verified facts about the installed `dist/typings.d.ts`** (5041 lines, read this session):
| API the UI-SPEC assumes | Evidence |
|-------------------------|----------|
| `AreaSeries`, `LineSeries` exports | `export { areaSeries as AreaSeries, ... lineSeries as LineSeries, };` (typings.d.ts:5032-5038) |
| `TickMarkType` | `Year = 0, Month = 1, DayOfMonth = 2, Time = 3, TimeWithSeconds = 4` (typings.d.ts:167-190) |
| `CrosshairMode` | `Normal = 0, Magnet = 1, Hidden = 2` (typings.d.ts:35-) |
| `tickMarkFormatter` | `export type TickMarkFormatter = (time: Time, tickMarkType: TickMarkType, locale: string) => string \| null;` (4968); doc: "no more than 8 characters" |
| `Time` | `export type Time = UTCTimestamp \| BusinessDay \| string;` (4987) |
| `localization.timeFormatter` | `timeFormatter?: TimeFormatterFn<HorzScaleItem>;` with `TimeFormatterFn<HorzScaleItem = Time> = (time: HorzScaleItem) => string` (3343, 4991) |
| `layout.attributionLogo` | `attributionLogo: boolean;` "@defaultValue true" (3176) |
| `autoSize`, `handleScroll`, `handleScale` | `autoSize: boolean;` (948), `handleScroll: HandleScrollOptions \| boolean;` (993), `handleScale: ... \| boolean;` (997) |
| crosshair line | `CrosshairLineOptions { color, width, style, visible, labelVisible, labelBackgroundColor }` (1035-1078) |
| `UTCTimestamp` | `Nominal<number, "UTCTimestamp">` (5015) |
`LineStyle.Dashed` equals `2` (confirmed by running the real module in Vitest, not from the .d.ts text).

### Pattern 3: Treemap with d3-hierarchy (verified by running it)
```ts
// frontend/src/lib/heatmap.ts (shape); d3 behaviour confirmed with a Node script and under Vitest 5 via alias
import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
type Leaf = { ticker: string; value: number; children?: Leaf[] };

export function layout(leaves: Leaf[], width: number, height: number) {
  if (leaves.length === 0 || width <= 0 || height <= 0) return [];     // Pitfall 6
  const root = hierarchy<Leaf>({ ticker: "", value: 0, children: leaves }).sum((d) => d.value);
  treemap<Leaf>().tile(treemapSquarify).size([width, height]).paddingInner(0).round(true)(root);
  return root.leaves();   // each: x0, y0, x1, y1 (integers), data.ticker, value
}
```
Observed output (Node 26, d3-hierarchy 3.1.2): one leaf `[0,0,400,200]` fills the box; values `[100,50,25]` in 400x200 give `[0,0,229,200]`, `[229,0,400,133]`, `[229,133,400,200]` (edges shared, so no gap and no overlap with `round(true)`); `[10000,1]` gives the tiny tile `x0 = x1 = 400` (zero width, still returned); width 0 gives zero-width leaves; **input order changes the layout** (squarify consumes children in the order given, it does not sort, so ordering by cost basis is a real layout input). `hierarchy({children: []})` yields a root that `leaves()` reports as a leaf (see Pitfall 6).

### Pattern 4: `useElementSize` and the jsdom stub
jsdom 30.1.2 has no `ResizeObserver` [VERIFIED: `grep -rl ResizeObserver node_modules/jsdom/lib` found nothing; and `typeof globalThis.ResizeObserver` is `"undefined"` under Vitest]. Mirror `fakeEventSource.ts`: a `FakeResizeObserver` class in `frontend/src/test/fakeResizeObserver.ts` with `static instances`, `observe(target)`, `disconnect()`, and `static trigger(target, width, height)` that calls the stored callback with `[{ target, contentRect: { width, height } }]`; register it in `vitest.setup.ts` with `vi.stubGlobal("ResizeObserver", FakeResizeObserver)` and clear `instances` in the existing `beforeEach`. The hook:
```ts
export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.floor(width), height: Math.floor(height) });
    });
    observer.observe(ref.current!);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}
```
The measured box must be mounted on the first render (Pitfall 7). Pure `buildTiles` tests need no observer at all.

### Pattern 5: Stores (copy the existing ticket-guard idiom)
`portfolioStore.ts` uses module-level `issued` / `applied` counters, `load()` takes a ticket at start, applies only if `ticket > applied`, and exports `resetPortfolioStore()` for tests [VERIFIED: frontend/src/lib/portfolioStore.ts]. `historyStore` copies that shape (`{history: HistoryPoint[] | null, failed: boolean}`, `load()`, `resetHistoryStore()`), plus an `inFlight` counter so the 30 s interval can skip when a fetch is running (a portfolio-change or Retry fetch is never skipped; the ticket guard sorts out ordering). `selectionStore`: `{status, selected, select(ticker), sync(status, tickers)}` with the UI-SPEC rules and a `resetSelectionStore()` called in `beforeEach` of every test that renders the watchlist or main chart.

### Anti-Patterns to Avoid
- **Selector that builds a new object in zustand 5** (Pitfall 5). Use `useMarketStore((s) => s.prices)` or wrap in `useShallow` from `zustand/react/shallow`.
- **Conditionally mounting the chart or measure box.** Overlays sit above an always-mounted box.
- **Calling `chart.timeScale().fitContent()` before data** is harmless, but calling `setData` with duplicate or descending times throws; always pass deduped ascending arrays.
- **Sharing `baseChartOptions()` into `Sparkline.tsx`** without updating its test mocks (Pitfall 3); leave the sparkline alone except the shared `toData`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Treemap geometry | Own squarify / slice-dice | `d3-hierarchy` `treemap` + `treemapSquarify` + `.round(true)` | Aspect-ratio optimisation and edge-consistent rounding (no overlap) are the whole problem |
| Chart rendering, crosshair, axes | Canvas drawing | `lightweight-charts` `createChart`, `AreaSeries`, `LineSeries` | Already the project's single charting dependency |
| Atomic check-then-insert for the snapshot | Ad hoc locks | Existing `transaction(conn)` (BEGIN IMMEDIATE) | Two tabs polling concurrently must not both insert |
| Portfolio valuation for the snapshot | A second valuation formula | `build_portfolio(conn, cache)["total_value"]` | Same number the trade path snapshots and the header shows |
| Time formatting | Manual `padStart` clock math | `Intl.DateTimeFormat` with `hourCycle: "h23"` | Local-time, DST-correct; see Pitfall 9 |
| Resize detection | `window.resize` listeners | `ResizeObserver` via `useElementSize` | Panels resize by grid, not only by window |
| Ticket guard for out-of-order fetches | New mechanism | Copy `portfolioStore`'s `issued/applied` | Proven in Phase 3 |

**Key insight:** every hard part (layout, canvas, atomicity, valuation) already has an installed or in-repo tool; the risk is in wiring (mocks, mounting, ordering, empty-state definitions), not in algorithms.

## Common Pitfalls

### Pitfall 1: Snapshot-on-request breaks the "history has at most 1 point" empty-state rule (HIGH impact, design decision)
**What goes wrong:** UI-SPEC Decision 8 (user-confirmed) shows `pnl-empty` only when no positions are held AND history has at most 1 point. But `GET /api/portfolio/history` records a snapshot on request whenever the latest one is older than the interval. A user who launches the container, waits more than the interval and opens the browser (the normal case), triggers the first history request, which inserts a second snapshot of $10,000. History is now 2 points with no trade ever made, so the chart renders a flat line instead of the empty state, and the 30 s refetch keeps adding points. Whether E2E sees the empty state depends on whether the first page load happens within the interval after server start (timing-dependent, flaky).
**Why it happens:** the empty rule treats history length as a proxy for "has traded", but request-time snapshots grow history without trades.
**How to avoid (recommended):** in `record_if_due`, also skip the insert when `total_value` equals the latest snapshot's value (shown in Pattern 1). A cash-only portfolio's value cannot change without a trade, and every trade already records its own snapshot, so no information is lost and the invariant "never traded implies exactly 1 history point" holds. It also bounds table growth further (flat periods add nothing). The live "now" point keeps the right edge current.
**Alternative if the user prefers the pure interval guard:** change only the frontend rule to "no positions AND every history value equals `STARTING_CASH`", which approximates "never traded" (a round trip at an unchanged price would still look untraded).
**Warning signs:** `pnl-empty` never appears in a manual first run; E2E fresh-state assertion passes or fails depending on startup speed.
**This is flagged in Assumptions Log A1 and Open Question 1: confirm with the user or planner before writing the backend task, because the backend test expectations ("snapshot inserted after the interval") must then change the portfolio value first.**

### Pitfall 2: `Time` is not `number` in the formatter callbacks
UI-SPEC writes `tickMarkFormatter: (t) => fmtClock(t)` and `localization.timeFormatter: (t) => fmtClock(t)`. `t` is `Time = UTCTimestamp | BusinessDay | string`, so passing it to `fmtClock(seconds: number)` is a TypeScript error under `next build`. Narrow with `typeof t === "number"` (return `null` from `tickMarkFormatter` to fall back to the default; return `String(t)` from `timeFormatter`). Verified to compile (Pattern 2).

### Pitfall 3: Partial `vi.mock("lightweight-charts")` factories throw on any missing export
Both existing mocks (`Sparkline.test.tsx`, `WatchlistPanel.test.tsx`) return only `createChart`, `LineSeries`, `CrosshairMode: {Hidden: 3}`, `ColorType`. Accessing an export the factory did not define throws at access time: `[vitest] No "CrosshairMode" export is defined on the "lightweight-charts" mock. Did you forget to return it from "vi.mock"?` [VERIFIED: ran it]. If `Sparkline` (or anything the watchlist renders) starts calling `baseChartOptions()` which reads `CrosshairMode.Normal` or `LineStyle.Dashed`, those two existing tests break. **Use for all new chart tests, and for any updated old one:**
```ts
const h = vi.hoisted(() => ({ addSeries: vi.fn(), setData: vi.fn(), fitContent: vi.fn(), remove: vi.fn() }));
vi.mock("lightweight-charts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("lightweight-charts")>()),
  createChart: vi.fn(() => ({ addSeries: h.addSeries, remove: h.remove, timeScale: () => ({ fitContent: h.fitContent }) })),
}));
```
Verified: real `AreaSeries` (an object), `CrosshairMode.Normal` = 0, `TickMarkType.Time` = 3, `LineStyle.Dashed` = 2 all work with a mocked `createChart`, so assertions can use `expect(addSeries).toHaveBeenCalledWith(AreaSeries, expect.objectContaining({...}))`. Simplest plan: leave `Sparkline.tsx` as is (only its `toData` moves), so the two old mocks stay valid; new panels use `importOriginal`.

### Pitfall 4: jsdom has no `ResizeObserver`
The heatmap's `useElementSize` throws `ReferenceError` in jsdom. Add the global stub in `vitest.setup.ts` (Pattern 4). LWC's own `autoSize` never runs under tests because `createChart` is mocked.

### Pitfall 5: zustand 5 selectors that return fresh objects loop forever
"There is a behavioral change in v5 to match React default behavior. If a selector returns a new reference, it may cause infinite loops. To fix it, use the `useShallow` hook" [CITED: Context7 /pmndrs/zustand v5.0.12 migration guide]. `zustand/react/shallow` exports `useShallow` in the installed package [VERIFIED: node_modules/zustand/react/shallow.d.ts]. UI-SPEC asks for a "shallow selector" restricting prices to held tickers; because every SSE frame replaces `prices` wholesale (`applyFrame` sets `prices: frame`), the restricted object would differ on every frame anyway. Simplest correct choice: `useMarketStore((s) => s.prices)` in `HeatmapPanel`, as `Header` already does. For `spark[selected]` and `prices[selected]` the selectors return stable references and are safe.

### Pitfall 6: d3 `hierarchy` with an empty `children` array
`hierarchy({children: []})` produces a childless root, so `root.leaves()` returns `[root]` (observed: `empty leaves 1`). Guard `leaves.length === 0` (and width or height 0) before laying out, which the empty state does anyway. Also: squarify is order-sensitive (observed different geometry for `[25,100,50]` vs `[100,50,25]`), leaves can round to zero width (`x0 === x1`), and the `sum` callback must return a number for every node (give the synthetic root `value: 0`).

### Pitfall 7: Mount the chart box and measure box unconditionally; the testid toggles
UI-SPEC says the chart box is "always mounted so the chart instance survives state flips" but `data-testid="main-chart"` / `"pnl-chart"` / `"heatmap-tiles"` must be "present only when..." (2+ points / at least one tile). Reconcile on one element: `data-testid={ready ? "main-chart" : undefined}`; overlays are siblings with `absolute inset-0 bg-panel`. If the ref'd element is conditionally rendered, `ref.current` is `null` in the mount effect and the chart or observer is never created. The box also needs real size: parent `relative min-h-0 flex-1`, box `absolute inset-0`, otherwise `autoSize` measures 0 height.

### Pitfall 8: E2E shares one server and one DB across all spec files, in alphabetical order
`playwright.config.ts` starts one backend with a throwaway `DB_PATH` (`finally-e2e-<timestamp>.db`), `workers: 1`, `reuseExistingServer: false`, so state persists across specs and files run in filename order [VERIFIED: test/playwright.config.ts]. `connection.spec.ts` asserts `header-cash` and `header-total-value` equal `$10,000.00`; `watchlist.spec.ts` leaves a held NFLX share; `smoke.spec.ts` expects the 10 seed rows. Consequences for new specs:
- Any spec that trades must sort after `connection.spec.ts` (selling at a later price changes cash). Name it `portfolio-charts.spec.ts` (c < m < p < s < t < w). A name like `charts.spec.ts` would sort before `connection.spec.ts` and break it.
- The `pnl-empty` fresh-state check is only valid before the first trade of the run and depends on Pitfall 1; place it in the first test of the new file only if no earlier spec has traded (earlier files `connection`, `motion` do not trade) and Pitfall 1 is mitigated; otherwise cover it with Vitest and a Playwright `page.route` stub of `**/api/portfolio/history` returning `{"history":[...one point]}`.
- Watchlist and positions empty states: do not delete the 10 seed tickers from the shared DB. Stub with `page.route("**/api/watchlist", ...)` returning `{"watchlist": []}` (GET only) and, for positions, either stub `**/api/portfolio` or sell everything through the API with the `request` fixture first (helper that reads `/api/portfolio` and posts sells).
- The run needs a fresh static build: `STATIC_DIR` points at `frontend/out`, which is only rebuilt by `npm run build` (the current `out/index.html` predates this phase's code).
- After a trade the P&L chart may briefly report `data-points` 2 (seed + trade snapshot) if the live point's second equals the trade's second; assert with polling (`expect(...).toHaveAttribute("data-points", /^([3-9]|\d{2,})$/)`), not an immediate read.

### Pitfall 9: Time formatting traps
`Intl.DateTimeFormat("en-US", {..., hour12: false})` historically renders midnight as `24:05:03` in Chromium; use `hourCycle: "h23"` [ASSUMED for Chromium; Node 26 prints `00:05:03` for both, verified]. A single `Intl` format with month, day, hour, minute and second joins with a comma (`Oct 9, 00:05:03`, observed), but the contract wants `Oct 9 14:30:05`, so build `fmtDateTime` as `fmtDay(s) + " " + fmtClock(s)`. Unit tests must compute expectations with the same `Intl` options (or set `process.env.TZ = "UTC"` at the top of the test file) and never hard-code a local-time string. ISO to seconds: `Math.floor(Date.parse(recorded_at) / 1000)`.

### Pitfall 10: Same-second points
The sparkline buffer is already one point per second, strictly ascending (`nextSpark` replaces the last point on the same second and ignores earlier seconds) [VERIFIED: frontend/src/lib/store.ts], so the main chart can reuse `toData` as is. History is different: two snapshots can share a second (`now_iso()` has second resolution), and the server orders ties by `rowid`. `buildPnlSeries` must keep the last of equal seconds, and append the live point only when `Math.floor(now) > last.time`; otherwise omit it. LWC `setData` throws on duplicate or descending times.

### Pitfall 11: Existing watchlist tests that the select button touches
`WatchlistPanel.test.tsx` does `within(row).getByText("ABCDEFGHIJ")` and expects that element to have `truncate` and `title` (lines 135-137), and `screen.getByText("AAPL")` not to have `opacity-60` (line 183). When the ticker text moves inside `<button data-testid="select-{TICKER}">`, the matched element is the button, so the button must carry `font-semibold truncate` and `title={ticker}` (the UI-SPEC already says so). The `querySelectorAll("td")` count of 5 must stay 5. Add `resetSelectionStore()` to those `beforeEach` blocks.

### Pitfall 12: Interval, StrictMode and refetch storms
The 30 s `setInterval` must be cleaned in the effect cleanup (React StrictMode double-invokes effects in dev). On startup both the mount fetch and the first-portfolio-identity fetch fire; harmless because the server guard dedupes, but tests that count `fetch` calls must account for it. A failed refetch after data exists keeps stale data and sets no error (spec).

## Runtime State Inventory

Not a rename/refactor/migration phase. Omitted per the template (greenfield additions only). One persistence note: the history route writes to `portfolio_snapshots` in the user's existing `db/finally.db`; no schema change is required (no new column or index; at most 2000 rows are read, an unindexed `ORDER BY recorded_at` over a few thousand rows is fine and an index would be unneeded over-engineering).

## Code Examples

### `tileFill` (UI-SPEC binding formula)
```ts
// Source: 04-UI-SPEC.md "Heatmap tile fill (binding)"; rgb triplets mirror up (63 185 80) and down (248 81 73)
export function tileFill(pnlPercent: number): string {
  if (Math.round(pnlPercent * 100) === 0) return "var(--color-raised)";
  const alpha = 0.15 + 0.35 * Math.min(Math.abs(pnlPercent) / 10, 1);
  const rgb = pnlPercent > 0 ? "63 185 80" : "248 81 73";
  return `rgb(${rgb} / ${alpha})`;
}
```
(`Math.round(x * 100) === 0` also treats `-0.004` as flat; `-0 === 0` is true.)

### `buildPnlSeries`
```ts
export type PnlPoint = { time: number; value: number };

export function buildPnlSeries(history: HistoryPoint[], nowSeconds: number, liveTotal: number | null): PnlPoint[] {
  const points: PnlPoint[] = [];
  for (const h of history) {
    const time = Math.floor(Date.parse(h.recorded_at) / 1000);
    if (points.at(-1)?.time === time) points.pop();          // same second: keep the last
    points.push({ time, value: h.total_value });
  }
  const now = Math.floor(nowSeconds);
  if (liveTotal !== null && now > (points.at(-1)?.time ?? -Infinity)) points.push({ time: now, value: liveTotal });
  return points;
}
```
Empty-state predicate (Decision 8): `empty = (positions.length === 0 && history.length <= 1) || series.length < 2`.

### Fake-timer refetch test shape
```ts
vi.useFakeTimers();
render(<PnlChartPanel />);
await vi.advanceTimersByTimeAsync(30_000);
expect(fetchMock.mock.calls.filter(([u]) => u === "/api/portfolio/history")).toHaveLength(2);  // mount + one tick
```
Date mocking follows `Sparkline.test.tsx` (`vi.spyOn(Date, "now").mockReturnValue(seconds * 1000)`).

### Backend test recipes (use the existing `client` fixture: FixedPriceSource, all default tickers at 100.0)
- Fresh DB: first `GET /api/portfolio/history` returns exactly `[{"total_value": 10000.0, ...}]` (seed is younger than the interval).
- Guard: `UPDATE portfolio_snapshots SET recorded_at = '2020-01-01T00:00:00Z'` through `connect(settings.db_path)`, buy 1 share (changes nothing in value at a fixed price, but the trade itself snapshots) then call history five times: row count increases by at most one; count after 5 calls equals count after 1. With the Pitfall 1 mitigation, also assert that an unchanged-value request after the interval inserts nothing.
- Cap and order: insert 2005 rows with ascending timestamps directly, GET, assert length 2000, ascending, newest present, oldest five absent.
- Trade adds a point: `POST /api/portfolio/trade` then history has one more entry than before.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `chart.addLineSeries()` / `addAreaSeries()` | `chart.addSeries(LineSeries \| AreaSeries, opts)` | LWC v5 | Already the project rule; `ISeriesApi<"Area">` types verified |
| zustand v4 selectors returning arrays/objects | `useShallow` required in v5 | zustand 5 | Pitfall 5 |
| `sse-starlette`, `@app.on_event` | native FastAPI SSE, `lifespan` | FastAPI 0.135+ | Unchanged from earlier phases |

**Deprecated/outdated:** `d3-treemap` (unrelated npm package; the treemap is in `d3-hierarchy`); LWC v4 snippets from model memory.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Skipping a request-time snapshot when the total value is unchanged is acceptable to the user and consistent with "a snapshot is recorded on request (min-interval guarded)" (PORT-07 wording) | Pitfall 1, Pattern 1 | A verifier reading PORT-07 literally might expect a snapshot per elapsed interval regardless of value; fallback is the frontend `STARTING_CASH` rule. Needs user/planner confirmation |
| A2 | A 10 second minimum interval (below the 30 s poll, long enough to dedupe bursts and tabs) | Pattern 1 | Too short: more rows; too long: a trade-adjacent request is dropped (harmless). Pure tuning |
| A3 | `d3-hierarchy` 3.1.2 (ESM-only, `exports.default` = `src/index.js`) bundles under Next 16.4 Turbopack static export | Standard Stack | Verified only under Node and Vitest (alias to the unpacked source), not under `next build`; the install task must run `npm run build` and `npx tsc --noEmit` before moving on |
| A4 | `Intl` with `hour12: false` yields `24:xx` at midnight in Chromium (so use `hourCycle: "h23"`) | Pitfall 9 | None if `h23` is used anyway; `h23` is correct in either case |
| A5 | LWC emits `TickMarkType.Time` (not `TimeWithSeconds`) when `secondsVisible` is false, and `TimeWithSeconds` when true | Pattern 2 | The formatter handles both types, so wrong only if labels exceed 8 characters (`HH:mm:ss` is exactly 8) |
| A6 | `datetime.fromisoformat("2026-10-09T01:28:48Z")` parses on Python 3.12 | Pattern 1 | One failing backend test on the first run; fix by replacing `Z` with `+00:00` |
| A7 | The 2 to 3 second window after a trade where `data-points` can be 2 (live point omitted because same second) | Pitfall 8 | Flaky E2E if asserted without polling |

## Open Questions

1. **Snapshot-on-request vs the "history at most 1 point" empty rule (Pitfall 1)**
   - What we know: with a pure interval guard, normal first use produces a second $10,000 snapshot before any trade, so `pnl-empty` is not reachable in real use and E2E would be timing-dependent.
   - What's unclear: whether the user accepts the "skip when value unchanged" backend guard (recommended) or prefers a frontend-only rule.
   - Recommendation: adopt the unchanged-value guard, add a sentence to `planning/API_CONTRACT.md` ("at most one snapshot per 10 s, and none when the total value is unchanged"), and make the planner's backend task assert it.
   - **RESOLVED by the user 2026-10-09: adopt the unchanged-value guard.** A history request records a snapshot only when at least the minimum interval has passed since the last snapshot AND the current total value differs from it; a never-traded portfolio keeps exactly one history point; every trade still records its own snapshot. Add the sentence to `planning/API_CONTRACT.md`.
2. **Interval constant location.** Contract says only "guarded by a minimum interval". Recommendation: name `MIN_INTERVAL_SECONDS = 10` in `history.py` and mention it in the contract.
3. **Whether `Sparkline.tsx` should adopt `baseChartOptions()`.** UI-SPEC says "may". Recommendation: no (keeps two old mocks valid); only share `toData`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | frontend build, Vitest | yes | v26.8.1 (`engines` requires >=24; Docker uses node:24) | — |
| npm | install d3 pins | yes | 11.19.0 | — |
| uv + Python 3.12 | backend tests | yes | uv 0.12.17; `uv run python -m pytest` ran 185 tests green in about 12 s | — |
| TypeScript | `tsc --noEmit` | yes | 7.0.2 (about 2 s) | — |
| Playwright + Chromium | E2E | yes | 1.63.0; chromium-1208 and 1243 present under `%LOCALAPPDATA%\ms-playwright` | — |
| Docker | not needed this phase | not probed | — | Host Playwright against `frontend/out`, as in Phases 1-3 |
| Registry access for the d3 install | npm | yes (`npm view`, `npm pack` worked under Avast with the existing `NODE_EXTRA_CA_CERTS`) | — | Keep TLS verification on |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Backend framework | pytest 9.1.1 + pytest-asyncio 1.4.0 (`asyncio_mode = "auto"`), config in `backend/pyproject.toml` |
| Frontend framework | Vitest 5.0.3 + RTL 16.3.3 + jest-dom 7.0.1 + jsdom 30.1.2, config `frontend/vitest.config.ts` (include `src/**/*.test.{ts,tsx}`, setup `vitest.setup.ts`) |
| E2E | Playwright 1.63.0 on the host, config `test/playwright.config.ts` (`workers: 1`, boots its own backend on :8000 with a throwaway DB, `LLM_MOCK=true`) |
| Quick run (backend) | `cd backend && uv run python -m pytest tests/test_history.py -q` |
| Full backend | `cd backend && uv run python -m pytest -q` (baseline 185 passed, about 12 s) |
| Quick run (frontend) | `cd frontend && npx vitest run src/lib src/components/MainChartPanel.test.tsx` (name the files under change) |
| Full frontend | `cd frontend && npx vitest run && npx tsc --noEmit` (baseline 13 files, 162 tests, about 4 s; tsc about 2 s) |
| Build gate | `cd frontend && npm run build` (static export; also proves Turbopack bundles d3-hierarchy) |
| E2E | `cd frontend && npm run build` then `cd test && npx playwright test portfolio-charts.spec.ts` (full: `npx playwright test`) |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PORT-07 | Fresh DB returns the single seeded $10,000 point; ascending; capped at 2000 | pytest | `uv run python -m pytest tests/test_history.py -q` | No, Wave 0 |
| PORT-07 | Guard: repeated requests do not flood; request after the interval records only when due (and value changed, per Pitfall 1); trade adds a point | pytest | same | No, Wave 0 |
| PORT-07 | `getPortfolioHistory` throws on non-2xx; `historyStore` ticket guard, `failed`, no-data vs stale-data failure | vitest | `npx vitest run src/lib/api.test.ts src/lib/historyStore.test.ts` | api.test.ts exists, historyStore.test.ts No |
| UI-07 | `selectionStore.sync` rules (loading/error keep selection, ready keeps or falls back to first, empty gives null) | vitest | `npx vitest run src/lib/selectionStore.test.ts` | No |
| UI-07 | Row click and Enter on `select-{T}` select; remove button does not select; `data-selected`, `aria-current`; ticker removal falls back | vitest | `npx vitest run src/components/WatchlistPanel.test.tsx` | Exists, extend |
| UI-07 | Main chart: waiting vs populated vs empty vs error vs loading overlays; `setData(toData(buffer))` then `fitContent` on ticker and buffer change; `data-ticker`, `data-points`; chart created once | vitest | `npx vitest run src/components/MainChartPanel.test.tsx` | No |
| UI-07 | E2E: default AAPL chart populated, click MSFT switches `data-ticker` | playwright | `npx playwright test portfolio-charts.spec.ts` | No |
| PUI-03 | `tileFill` boundaries (0, +/-10 saturation, flat) and `buildTiles` (zero/one/many, order by cost basis, skip value<=0, weights sum to 100, no overlap, tile area ratio) | vitest | `npx vitest run src/lib/heatmap.test.ts` | No |
| PUI-03 | HeatmapPanel states, tiles via `FakeResizeObserver.trigger`, `data-pnl`, `data-weight`, title/aria text, live price changes recolor | vitest | `npx vitest run src/components/HeatmapPanel.test.tsx` | No |
| PUI-03 | E2E: buy 2 positions, tiles exist with `data-pnl`, bounding-box area ratio tracks value ratio | playwright | as above | No |
| PUI-04 | `buildPnlSeries`: dedupe same second, strictly ascending, live point rule, seed-first | vitest | `npx vitest run src/lib/pnlSeries.test.ts` | No |
| PUI-04 | PnlChartPanel: states, 30 s refetch (fake timers), refetch on portfolio identity change, no overlap fetch on tick, retry, title-bar total and delta, `data-points` includes live point | vitest | `npx vitest run src/components/PnlChartPanel.test.tsx` | No |
| PUI-04 | E2E: after a buy, `pnl-chart` `data-points` reaches >= 3 (polling) | playwright | as above | No |
| PUI-07 | Heatmap and P&L empty overlays (Decision 8 predicate); watchlist/positions empty already covered | vitest | panel tests above | partial |
| PUI-07 | E2E empty states via `page.route` stubs (watchlist, portfolio) and, if Pitfall 1 is mitigated, the fresh `pnl-empty` | playwright | as above | No |
| (all) | `format.ts` new functions (`fmtClock`, `fmtDay`, `fmtDateTime`) with TZ-independent expectations; `chartTheme` options | vitest | `npx vitest run src/lib/format.test.ts` | Exists, extend |

### Sampling Rate
- **Per task commit:** the quick command for the touched area (backend file or the named Vitest files) plus `npx tsc --noEmit` for frontend tasks.
- **Per wave merge:** full backend pytest, full Vitest, `npx tsc --noEmit`, and `npm run build` after the d3 install and after the page re-slot.
- **Phase gate:** full backend + frontend suites green, `npm run build` green, `portfolio-charts.spec.ts` plus the whole Playwright run green (existing specs must still pass), before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `backend/tests/test_history.py` covers PORT-07
- [ ] `frontend/src/test/fakeResizeObserver.ts` + `vitest.setup.ts` registration (global stub and `instances` reset)
- [ ] `frontend/src/lib/{heatmap,pnlSeries,selectionStore,historyStore}.test.ts`
- [ ] `frontend/src/components/{MainChartPanel,HeatmapPanel,PnlChartPanel}.test.tsx` using the `importOriginal` partial mock
- [ ] `test/portfolio-charts.spec.ts` (name chosen to sort after `connection.spec.ts`)
- [ ] Package install after the human gate: `d3-hierarchy@3.1.2`, `@types/d3-hierarchy@3.1.7` (framework already installed)

## Security Domain

`security_enforcement` is enabled (absent in config means enabled; `security_asvs_level: 1`).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Single hardcoded user by design (PROJECT.md out of scope) |
| V3 Session Management | no | No sessions |
| V4 Access Control | no | No auth; single-user |
| V5 Input Validation | yes (low) | History route takes no input; ticker strings reaching `title`/`aria-label` are server-validated against `[A-Z][A-Z.]{0,9}`; React escapes text; no `dangerouslySetInnerHTML` |
| V6 Cryptography | no | None |
| V7 Error handling | yes | Fixed error copy in all chart panels (never echo server body or status), backend errors use the `{error}` envelope |
| V10/V14 Supply chain | yes | Package gate for `d3-hierarchy` and `@types/d3-hierarchy`; exact pins; committed lockfile |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unbounded table growth via repeated history requests (DoS by write amplification) | Denial of service | Min-interval and unchanged-value guard, `LIMIT 2000` on the read, `BEGIN IMMEDIATE` so concurrent requests cannot both insert |
| SQL injection | Tampering | Parameterized queries only (`?` placeholders), as the rest of the backend |
| XSS through ticker text in tile titles | Tampering | React text escaping; ticker format enforced server-side |
| Information leak through error text | Information disclosure | Fixed strings (UI-SPEC Copywriting Contract, Phase 2 policy AR-04) |
| Malicious dependency | Tampering | Legitimacy check OK; no install scripts; exact pins |

## Sources

### Primary (HIGH confidence)
- Installed source, read this session: `frontend/node_modules/lightweight-charts/dist/typings.d.ts` (5041 lines; enums, option types, `TickMarkFormatter`, `Time`, series exports); `frontend/package.json`, `vitest.config.ts`, `vitest.setup.ts`, `tsconfig.json`; `frontend/src/{app/page.tsx,components/*.tsx,lib/*.ts}` named in the text; `backend/app/{main,db,portfolio,trading,errors,config,tracking}.py`; `backend/tests/conftest.py`; `planning/API_CONTRACT.md`; `test/{playwright.config.ts,*.spec.ts}`.
- Executed this session (scratch files, deleted): TS 7.0.2 `tsc --noEmit` on the LWC snippet (clean); Vitest runs proving missing-export throw, `importOriginal` partial mock, `ResizeObserver` absent, d3-hierarchy import under Vitest; Node script exercising `treemap` / `treemapSquarify` / `round(true)` on d3-hierarchy 3.1.2 unpacked from `npm pack`; Tailwind v4 postcss compile proving `lg:grid-rows-[minmax(0,5fr)_minmax(0,4fr)_auto_minmax(0,4fr)]`, `transition-[left,top,width,height,background-color]`, `min-h-40`, `motion-reduce:transition-none` generate CSS.
- Baselines run: `npx vitest run` 13 files / 162 tests green; `uv run python -m pytest -q` 185 passed.
- `gsd-tools query package-legitimacy check --ecosystem npm d3-hierarchy @types/d3-hierarchy`: both OK; `npm view` for versions, scripts, repository.
- Context7 `/pmndrs/zustand` (v5.0.12 migration guide, `useShallow`).
- `.planning/phases/04-charts-portfolio-visualizations/04-UI-SPEC.md` (approved design contract), `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/PROJECT.md` decisions 10 and 14, `.planning/ROADMAP.md` Phase 4.

### Secondary (MEDIUM confidence)
- None used.

### Tertiary (LOW confidence)
- Chromium `hour12:false` midnight rendering (training knowledge; mitigated by `hourCycle: "h23"`). LWC tick-type selection by `secondsVisible` (training knowledge; formatter handles both).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, versions and APIs read from installed packages and the registry; d3 under Next not yet built (A3).
- Architecture: HIGH for the frontend and backend wiring; MEDIUM on the snapshot guard design pending the Pitfall 1 decision.
- Pitfalls: HIGH, nearly all reproduced by running code this session.

**Research date:** 2026-10-09
**Valid until:** 2026-11-08 (stable stack; re-check if Next, LWC or Vitest versions move)
