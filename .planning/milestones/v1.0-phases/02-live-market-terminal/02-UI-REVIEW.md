# Phase 2 — UI Review

**Audited:** 2026-10-08
**Baseline:** 02-UI-SPEC.md (design contract)
**Screenshots:** not captured (playwright screenshot failed; code-only audit)
**Interaction captures:** off (workflow.ui_interaction_capture is false)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | All fixed strings match UI-SPEC contract exactly; error copy never leaks server detail |
| 2. Visuals | 3/4 | Layout and hierarchy correct per code; visual density unverified (no screenshots) |
| 3. Color | 4/4 | All colors use theme tokens; no hardcoded hex values; 60/30/10 distribution declared in CSS |
| 4. Typography | 4/4 | Exactly 2 font weights (400, 600) and 4 sizes (12, 14, 16, 20px) used as specified |
| 5. Spacing | 4/4 | All spacing from Tailwind scale; no arbitrary values; multiples of 4px throughout |
| 6. Experience Design | 4/4 | All panel states (loading, error, empty, populated) implemented with correct aria attributes and data-testid hooks |

**Overall: 23/24**

---

## Top 3 Priority Fixes

1. **BLOCKER: Screenshot capture failed — visual hierarchy and density cannot be verified** — Risk: the page may not match the 48px/480px/40px/32px dimension contract or the 1920x1080, 1280x800, 768x1024 viewport breakpoints — Recommend: Re-run UI capture with a working browser automation tool before final UAT; this code-only audit verifies structure, not layout
2. **WARNING: Sparkline visual smoothness and flash animation timing unverified** — Risk: CSS animations may jank or colors may not match the 40% tint specification — Recommend: Manual 30 s visual inspection at http://localhost:8000 to confirm green/red flashes fade within ~500ms and sparklines draw smoothly
3. **WARNING: Color contrast on "0.00%" values (zero change) not measured** — Risk: zero change renders in text-fg (foreground), which may not meet WCAG AA contrast on the panel background — Recommend: Test contrast of `text-fg` (#e6edf3) on `panel` (#161b22) with a tool; UI-SPEC table lists 14.6:1 contrast ratio, which should pass

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)

**PASS — Contract fully met**

All user-facing strings are fixed and match the UI-SPEC Copywriting Contract:

| Element | Copy | Audit Result |
|---------|------|--------------|
| App title | "FinAlly" | ✓ Present in `Header.tsx` as `text-accent` |
| Panel title | "Watchlist" | ✓ Present in `WatchlistPanel.tsx` line 32 |
| Column labels | "Ticker", "Price", "Chg %", "Since load" | ✓ All four present, "Chg %" has `title="Change since session start"` |
| Header labels | "Total value", "Cash" | ✓ Both in `Header.tsx` as `text-label text-muted` |
| Missing value | `--` (exported as `MISSING`) | ✓ Defined in `format.ts`, used for `null/undefined/NaN/Infinity` |
| Loading state | "Loading watchlist", `aria-busy="true"` | ✓ 10 skeleton rows in `WatchlistPanel.tsx` line 64 |
| Error heading | "Watchlist unavailable" | ✓ `ErrorState` component line 77 |
| Error body | "The server did not return your watchlist. Check that FinAlly is running, then retry." | ✓ Line 79, exact match to contract |
| Error button | "Retry" | ✓ Line 86 |
| Empty heading | "Watchlist is empty" | ✓ `EmptyState` component line 95 |
| Empty body | "Add a ticker to start watching live prices." | ✓ Line 96 |
| Connection labels | "Live", "Reconnecting", "Offline" | ✓ All in `ConnectionDot.tsx` VIEW object |
| Footer attribution | TradingView link + copyright notice | ✓ `Footer.tsx` lines 6-15, link has `target="_blank"` and `rel="noopener noreferrer"` |

**Finding:** No generic labels ("OK", "Submit", "Click Here"). No server error detail reaches the DOM—error state shows only fixed copy. The contract prohibition "never let the server body or status text appear" is enforced (ErrorState catches and discards the error).

**Finding:** No "daily" or "today" wording anywhere—the Chg % column uses the UI-SPEC title "Change since session start" (see `WatchlistPanel.tsx` line 44).

---

### Pillar 2: Visuals (3/4)

**PASS with caveats — Structure correct; layout verification incomplete**

| Aspect | Audit | Result |
|--------|-------|--------|
| Focal point on main screen | Header (FinAlly wordmark in accent yellow), then watchlist rows with price + change %, then sparklines | ✓ Hierarchy is correct: heading (text-accent), body data (text-fg), labels (text-muted) |
| Visual hierarchy through size/weight | Heading (16px semibold), Body (14px normal), Display (20px semibold for total), Label (12px normal) | ✓ Four distinct sizes in use; no more |
| Icon-only buttons | Retry button has text, connection dot has a 1-word label ("Live"/"Reconnecting"/"Offline"), footer link is text | ✓ No bare icons; all accessible |
| Component density | Watchlist row 40px, header 48px, footer 32px, column label row 32px | ✓ Coded correctly; visual verification **NOT DONE** (no screenshots) |
| Layout breakpoints | Desktop 1440+, tablet 768x1024, mobile 375x812 | ✓ Codebase has `lg:` breakpoints (480px panel) and `hidden sm:table-cell` for sparkline column |
| Page scrolling | Page should never scroll at 1920x1080, 1280x800, 768x1024 | ✓ Root div uses `h-dvh flex-col`, main uses `min-h-0 flex-1`, body scrolls only if watchlist overflows |

**Finding - BLOCKER:** No screenshots were captured; visual density, exact spacing alignment, and viewport behavior cannot be confirmed. The code structure is correct (uses the declared Tailwind classes), but the UI appearance is unverified.

**Finding - WARNING:** The right 1fr workspace column (Phase 4, 5 additions) is intentionally empty, which may appear incomplete during UAT. This is by design per the UI-SPEC Layout section.

---

### Pillar 3: Color (4/4)

**PASS — Color system implemented correctly**

**Theme tokens verified (globals.css):**

```
✓ Dominant (60%):  --color-surface: #0d1117 (body background)
✓ Secondary (30%): --color-panel: #161b22 (header, footer, panel)
✓ Accent (10%):    --color-accent: #ecad0a (wordmark and focus ring only)
✓ Text colors:     --color-fg, --color-muted, --color-up, --color-down, --color-warn
✓ Primary (chart): --color-primary: #209dd7 (sparkline stroke)
```

**Usage audit:**

| Color | Used For | Count | Audit |
|-------|----------|-------|-------|
| `text-accent` | Wordmark ("FinAlly") only | 1 | ✓ Correct; focus ring on footer link also uses accent |
| `text-muted` | Column labels, header stat labels, footer, connection label | 10+ | ✓ Correct; used only for secondary text |
| `text-fg` | Ticker symbols, prices (when loaded), change % (when zero) | Used in default body class | ✓ Correct |
| `text-up` | Positive change % only | Via `toneClass()` | ✓ Correct; applied by `fmtPct(n)` returning "+X.XX%" |
| `text-down` | Negative change % only | Via `toneClass()` | ✓ Correct; applied by `fmtPct(n)` returning "-X.XX%" |
| `text-warn` | Yellow connection dot only | 1 | ✓ Correct; distinct from accent |
| `text-primary` | TradingView footer link | 1 | ✓ Correct; `hover:underline` added |
| `bg-up` / `bg-down` | Price flash background (CSS keyframes) | In globals.css | ✓ Correct; 40% tints in @keyframes |
| Hardcoded hex values | None in component classes | (except test assertion) | ✓ PASS; the one `#209dd7` is in a test mock, not production code |

**Finding:** No accent misuse—the wordmark and focus rings are the only accent consumers. The connection dot correctly uses `bg-warn` (#d29922) distinct from accent yellow.

**Finding:** Flash animations use CSS @keyframes with 40% opacity tints (`rgb(63 185 80 / 0.4)` for green up, `rgb(248 81 73 / 0.4)` for red down). No hardcoded hex colors in components.

**Finding:** Stale data dimming (60% opacity when `status === "disconnected"`) is applied to header totals and watchlist price/change cells, but NOT to tickers or sparklines. Correct per UI-SPEC.

---

### Pillar 4: Typography (4/4)

**PASS — Exactly 4 sizes, 2 weights**

**Font sizes (Tailwind custom `--text-*` tokens):**

| Token | Size | Line Height | Used For | Count |
|-------|------|-------------|----------|-------|
| `text-label` | 12px | 1.5 | Column headers, stat labels, connection label, footer | ✓ |
| `text-body` | 14px | 1.5 | Row prices, change %, error/empty body copy, Retry button | ✓ |
| `text-heading` | 16px | 1.2 | Wordmark, panel title, error/empty headings | ✓ |
| `text-display` | 20px | 1.2 | Header total value only | ✓ |

**Font weights (Tailwind classes):**

| Weight | Class | Used For | Count |
|--------|-------|----------|-------|
| 400 (regular) | `font-normal` | Column header cells (not bold) | 4 in `WatchlistPanel.tsx` |
| 600 (semibold) | `font-semibold` | Wordmark, panel title, error/empty headings, ticker symbol | 6 uses across Header, WatchlistPanel, ConnectionDot |

**No `font-bold`, `font-light`, `font-medium` or other weights present.** ✓

**Finding:** Numeric cells use `tabular-nums` class (via Tailwind v4 custom value), ensuring alignment. `whitespace-nowrap` applied to header totals and cash.

**Finding:** Exactly 2 font weights (400, 600) and 4 sizes declared. No deviation from contract.

---

### Pillar 5: Spacing (4/4)

**PASS — All from Tailwind scale, multiples of 4px**

**Spacing classes used (audit by code):**

| Token | Tailwind | Value | Usage | Audit |
|-------|----------|-------|-------|-------|
| `xs` | `gap-1` | 4px | dot-to-label gap in connection indicator | ✓ |
| `sm` | `gap-2`, `px-2` | 8px | header stat gap, watchlist cell padding | ✓ |
| `md` | `px-4`, `gap-4` | 16px | panel/header horizontal padding, header gap (desktop) | ✓ |
| `xl` | `gap-8` | 32px | header gap at `lg:` breakpoint | ✓ |
| Fixed (non-scale) | `h-12` | 48px | Header height | ✓ |
| Fixed | `h-10` | 40px | Row height | ✓ |
| Fixed | `h-8` | 32px | Column label row, footer height | ✓ |
| Fixed | `h-6` | 24px | Sparkline height | ✓ |
| Fixed | `size-2` | 8px | Connection dot | ✓ |
| Fixed | `w-24` | 96px | Ticker and Price column widths | ✓ |
| Fixed | `w-22` | 88px | Change % column width | ✓ |
| Fixed | `lg:w-120` | 480px | Watchlist panel width at lg breakpoint | ✓ |

**Arbitrary spacing audit:**

```bash
grep -rn "\[.*px\]\|\[.*rem\]" frontend/src/components frontend/src/app 2>/dev/null
```

**Result:** No arbitrary `[Xpx]` or `[Xrem]` values found. ✓

**Finding:** All spacing is from the Tailwind scale or fixed component dimensions. No off-scale values (no 12px, 20px, etc.). Multiples of 4px throughout.

---

### Pillar 6: Experience Design (4/4)

**PASS — All states implemented with correct semantics**

**Loading state:**

- ✓ 10 skeleton rows with `motion-safe:animate-pulse` (CSS, respects user preference)
- ✓ Panel root has `aria-busy="true"` and `aria-label="Loading watchlist"`
- ✓ No text, only visual skeleton bars
- ✓ Implemented in `WatchlistPanel.tsx` lines 64-71

**Error state:**

- ✓ Heading "Watchlist unavailable" (fixed, no server detail)
- ✓ Body copy exactly matches contract
- ✓ Retry button with `data-testid="watchlist-retry"`, wired to `onRetry={load}`
- ✓ Focus ring uses accent color: `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`
- ✓ Button hover: `hover:bg-raised`
- ✓ Refetch triggered on each transition to "connected" status (02-06 addition)
- ✓ Implemented in `WatchlistPanel.tsx` lines 74-89

**Empty state:**

- ✓ Heading "Watchlist is empty"
- ✓ Body "Add a ticker to start watching live prices."
- ✓ No Retry button (no fetch to retry)
- ✓ Implemented in `WatchlistPanel.tsx` lines 92-98

**Populated state:**

- ✓ Table with `table-fixed` for predictable column widths
- ✓ Sticky column-label row: `sticky top-0 bg-panel`
- ✓ 10 seeded rows in order from `GET /api/watchlist` (membership and order, never SSE keys)
- ✓ Each row has `data-testid="watchlist-row-{TICKER}"` (e.g., `watchlist-row-AAPL`)
- ✓ Ticker cell: `truncate`, `title={ticker}` for long tickers (max 10 chars)
- ✓ Price cell: `fmtMoney()` formatted, flashes on up/down (keyed remount by `flash.seq`), dims on disconnect
- ✓ Change % cell: `fmtPct()` formatted with color class from `toneClass()`, dims on disconnect
- ✓ Sparkline cell: 24px height, hidden on mobile (`hidden sm:table-cell`), draws from per-second buffer (300-point cap)

**Connection indicator state machine:**

- ✓ Status "reconnecting" (yellow): initial and on CONNECTING errors
- ✓ Status "connected" (green): on EventSource `onopen`
- ✓ Status "disconnected" (red): after 5 seconds without an open, or on CLOSED error
- ✓ Data-status attribute transitions correctly
- ✓ Aria-label and title carry full sentences per UI-SPEC
- ✓ Implemented in `useMarketStream.ts` with exported `RED_AFTER_MS = 5000`

**Header state:**

- ✓ Total value shows "$10,000.00" on fresh database (cash + 0 positions)
- ✓ Shows "--" (muted) until `GET /api/portfolio` resolves
- ✓ Shows "--" if portfolio fetch fails, no error text
- ✓ Refetches on each transition to "connected" (via status ref)
- ✓ Dims to 60% opacity while status is "disconnected"
- ✓ Implemented in `Header.tsx` using pure function `liveTotals(portfolio, prices)`

**Price flash animation (UI-05):**

- ✓ Triggers only on newer-timestamp up/down ticks (not flat, not same-timestamp, not first value)
- ✓ Applies to price cell span only (never the row)
- ✓ CSS-only: `animate-flash-up` (green 40% tint) or `animate-flash-down` (red 40% tint), 500ms ease-out
- ✓ Restarts by React key on `flash.seq` increment; no JavaScript timers
- ✓ Carries `data-flash="up"` | `"down"` | `"none"` attribute
- ✓ Implemented in `PriceCell.tsx` lines 10-16

**Sparkline (UI-04):**

- ✓ Empty if fewer than 2 points (24px container with no line, no placeholder)
- ✓ One point per second of arrival time (Math.floor(Date.now()/1000)), capped at 300 points
- ✓ Same-second ticks replace the last point; earlier times ignored
- ✓ Blue stroke (#209dd7 via `CHART_COLORS.primary`)
- ✓ No axes, grid, crosshair, interaction or logo
- ✓ `autoSize: true`, `pointer-events-none`, `aria-hidden="true"`
- ✓ Implemented in `Sparkline.tsx` using Lightweight Charts v5 API

**Footer attribution:**

- ✓ TradingView link: `href="https://www.tradingview.com/"`, `target="_blank"`, `rel="noopener noreferrer"`
- ✓ Text color `text-primary` with `hover:underline`
- ✓ Focus ring: accent color
- ✓ Attribution text matches the UI-SPEC quoted NOTICE
- ✓ Implemented in `Footer.tsx` lines 6-15

**Finding:** All panel states are implemented. Loading shows 10 skeleton rows with aria attributes. Error state shows fixed copy only. Empty and populated states render correctly. No server error detail leaks to the DOM.

**Finding:** The connection dot faithfully tracks the stream state with a 5 s red timer and proper handling of repeated CONNECTING errors (no re-arm, no flicker).

**Finding:** Price flash and sparklines are keyed correctly to restart/update on new data.

---

## Registry Safety

Registry audit: shadcn not initialized (`shadcn_initialized: false` in UI-SPEC.md). No third-party registries in use. No registry safety audit needed.

---

## Files Audited

**Core components:**
- `frontend/src/app/page.tsx` — Shell with Header, main, Footer
- `frontend/src/app/layout.tsx` — Root layout, body classes
- `frontend/src/app/globals.css` — Theme tokens, flash keyframes
- `frontend/src/components/Header.tsx` — Wordmark, totals, connection dot
- `frontend/src/components/ConnectionDot.tsx` — Status indicator
- `frontend/src/components/Footer.tsx` — Attribution and link
- `frontend/src/components/WatchlistPanel.tsx` — Panel with loading/error/empty/populated states
- `frontend/src/components/WatchlistRow.tsx` — One row; ticker, price, change, sparkline
- `frontend/src/components/PriceCell.tsx` — Price with flash animation
- `frontend/src/components/Sparkline.tsx` — Lightweight Charts v5 sparkline

**Formatters and state:**
- `frontend/src/lib/format.ts` — Intl formatters (fmtMoney, fmtPct, fmtQty, fmtSigned, toneClass)
- `frontend/src/lib/store.ts` — Zustand store (prices, flash, spark, status)
- `frontend/src/lib/api.ts` — API client (getWatchlist, getPortfolio)
- `frontend/src/lib/totals.ts` — liveTotals pure function
- `frontend/src/lib/chartTheme.ts` — CHART_COLORS constant
- `frontend/src/lib/types.ts` — Type definitions
- `frontend/src/lib/useMarketStream.ts` — EventSource hook with state machine

**Test files (not audited for correctness, but structure verified):**
- `frontend/src/lib/format.test.ts` — 20 tests for formatters
- `frontend/src/lib/store.test.ts` — Tests for replace semantics, flash and sparkline state
- `frontend/src/lib/useMarketStream.test.ts` — Connection state machine tests
- `frontend/src/components/*.test.tsx` — Component tests

---

## Recommendation Summary

**Blocker findings:** 1
- Screenshot capture failure prevents visual verification (layout, spacing, density). Recommend re-capture before UAT sign-off.

**Warnings:** 2
- Sparkline visual smoothness and flash animation timing require manual inspection (30 s live watch).
- Zero-change contrast unverified; recommend spot-check with WCAG tool.

**No critical issues found in code structure.** All declared contracts (typography, spacing, color, copywriting, state coverage) are met by the implementation. The codebase correctly implements the UI-SPEC design contract.

---

**Audit conducted:** 2026-10-08
**Audit type:** Code-only (screenshot capture failed)
**Auditor confidence:** Medium (structure verified; appearance unverified)
