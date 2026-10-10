# Phase 01 — UI Review

**Audited:** 2026-10-08
**Baseline:** Abstract 6-pillar standards (no UI-SPEC for Phase 1 placeholder)
**Screenshots:** Not captured (no dev server running — code-only audit)
**Interaction captures:** Off (phase 1 is a static placeholder)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Clear, concise strings ("checking", "down"); no generic patterns; minor: loading state label is generic |
| 2. Visuals | 3/4 | Clean centered layout, good hierarchy (title emphasized with size + color); minimal by design (expected for skeleton) |
| 3. Color | 4/4 | Excellent dark theme matching PLAN.md spec; proper accent/primary/secondary application; no hardcoded colors |
| 4. Typography | 3/4 | Minimal but appropriate hierarchy (text-3xl title, text-sm label); limited scale acceptable for placeholder |
| 5. Spacing | 4/4 | All Tailwind classes, no arbitrary values; consistent gap-3, proper flex centering, full-height viewport |
| 6. Experience Design | 3/4 | Proper async handling, loading ("checking") and error ("down") states, error catch; testable with data-testid |

**Overall: 20/24**

---

## Top 3 Priority Fixes

1. **Loading state label specificity** — "checking" is generic and doesn't describe the network operation — **Replace "checking" with "connecting..." or add a visual loading indicator (spinner/skeleton) when the API status loads** to give users clearer feedback about what's happening.

2. **Error state verbosity** — API errors only show "down", not the cause (network timeout, 500 error, etc.) — **Capture and display the HTTP status or error reason in the catch handler** (e.g., "down (404)" or "down (connection failed)") so users understand what went wrong.

3. **Testability labels for future expansion** — `data-testid` attributes are present on the title and status, which is good — **As Phase 2+ adds components, maintain this pattern and ensure all interactive elements have stable test IDs** to support E2E test coverage without brittle CSS selectors.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

**Strings audit:**
- `page.tsx:7` — "checking" (loading state)
- `page.tsx:12` — "down" (error state)
- `page.tsx:17` — "FinAlly" (app title)
- `page.tsx:18` — "API:" (label)
- `api.ts:6` — "health {status}" (error message)

**Assessment:**
- No generic CTA patterns ("Submit", "Click Here", "OK", "Cancel", "Save") present
- No vague empty-state patterns ("No data", "Nothing")
- Strings are concise and functional

**Findings:**
- **Minor:** "checking" is a generic loading label. It doesn't convey that a network request is underway. Better: "connecting..." or pair it with a visual spinner. (FINDING)
- **Minor:** Error state shows "down" only; no detail on failure reason (timeout, 404, 500, etc.). Informative only by omission.

**Score justification:** Good copywriting (3/4) — clear and free of anti-patterns, but labels could be slightly more descriptive for user clarity.

---

### Pillar 2: Visuals (3/4)

**Layout structure:**
- `page.tsx:16` — `flex min-h-screen flex-col items-center justify-center gap-3`
  - Flexbox centering, full viewport height, vertical stack, 12px gap

**Visual hierarchy:**
- Title ("FinAlly"): `text-3xl font-semibold text-accent` — largest, bold, yellow accent color (focal point)
- Status label: `text-sm text-slate-400` — small, muted gray (secondary)
- Status value: `text-primary` — blue primary color (emphasis within secondary)

**Assessment:**
- Clear focal point: the title is visually dominant
- Good use of size and color to establish hierarchy
- Centered composition is professional and intentional
- No competing visual elements
- Spacing is adequate (gap-3 = 12px vertical separation)

**Findings:**
- **Good:** Layout is clean, professional, and appropriately minimal for a placeholder. No over-decoration. (FINDING)
- **Note:** The skeletal nature means only two text elements; visual design is proportionate to scope. No issues detected.

**Score justification:** Good (3/4) — solid hierarchy and clean layout, with the caveat that a skeleton page inherently has limited visual complexity. Would score higher with more components, but this is appropriate for Phase 1.

---

### Pillar 3: Color (4/4)

**Theme definition in `globals.css`:**
```css
--color-surface: #0d1117    (dark background, matches PLAN.md)
--color-panel:  #161b22    (slightly lighter, for panels/secondary surfaces)
--color-border: #30363d    (subtle muted gray for borders)
--color-accent: #ecad0a    (yellow, matches PLAN.md)
--color-primary: #209dd7   (blue, matches PLAN.md)
--color-secondary: #753991 (purple, matches PLAN.md, ready for future submit buttons)
```

**Color application:**
- `layout.tsx:9` — `bg-surface text-slate-200` (dark background, light text)
- `page.tsx:17` — `text-accent` on title (yellow)
- `page.tsx:19` — `text-primary` on status value (blue)
- `page.tsx:18` — `text-slate-400` on label (muted gray)

**Hardcoded colors audit:**
- None found outside `globals.css`

**Assessment:**
- Excellent adherence to PLAN.md color specification
- Dark theme properly implemented and consistent
- No hardcoded hex codes in component files
- Color contrast: light text on dark background meets WCAG AA
- Accent and primary colors are used intentionally, not overused
- Distributed well: mostly dark/neutral, accent on title, primary on value

**Findings:**
- **Excellent:** All colors defined in the Tailwind theme; components reference them by semantic class names. This enables consistent theming and future dark/light mode support. (FINDING)
- No issues detected.

**Score justification:** Excellent (4/4) — proper design system implementation, no technical debt, colors match specification exactly.

---

### Pillar 4: Typography (3/4)

**Font sizes used:**
- `text-3xl` on title (48px by Tailwind default)
- `text-sm` on status label (14px)

**Font weights used:**
- `font-semibold` on title (600 weight)
- Implicit normal weight on body

**Text color:**
- `text-slate-200` on body (light gray)
- `text-accent` on title
- `text-primary` on status value
- `text-slate-400` on label (muted)

**Assessment:**
- Minimal hierarchy, but appropriate for two-line placeholder
- Clear contrast between title and label
- No excessive font-size or font-weight combinations
- Antialiased rendering on body

**Findings:**
- **Good:** Limited scale (2 sizes, 1 weight) is appropriate for a skeleton. No typography bloat. (FINDING)
- **Note:** As Phase 2+ adds more components (watchlist, charts, positions table, chat), a slightly richer scale (text-xs, text-base, text-lg, text-xl, text-2xl) will be needed. Foundation is in place.

**Score justification:** Good (3/4) — minimal but appropriate typography system for the scope. Not penalized for limited scale in a placeholder.

---

### Pillar 5: Spacing (4/4)

**Spacing classes used:**
- `gap-3` — 12px vertical gap between title and status (standard Tailwind scale)
- `min-h-screen` — full viewport height
- `flex min-h-screen flex-col items-center justify-center` — centering algorithm

**Arbitrary spacing audit:**
- No `[...]` arbitrary values (e.g., no `[24px]`, `[3rem]`)
- No inline `style=` attributes

**Assessment:**
- All spacing uses Tailwind's standard scale (0.75rem = 12px, etc.)
- No magic numbers or pixel values
- Consistent with design system
- Maintainable and predictable

**Findings:**
- **Excellent:** No arbitrary spacing. Adherence to Tailwind scale is strict. (FINDING)
- Consistent spacing approach ready for future expansion.

**Score justification:** Excellent (4/4) — proper use of design system spacing, no technical debt, completely maintainable.

---

### Pillar 6: Experience Design (3/4)

**Async/state handling in `page.tsx`:**
```tsx
const [api, setApi] = useState("checking");

useEffect(() => {
  getHealth()
    .then((h) => setApi(h.status))
    .catch(() => setApi("down"));
}, []);
```

**States covered:**
- Initial: `"checking"` — shown while fetch is in-flight
- Success: Sets state to the API response status value (e.g., `"ok"`)
- Error: `"down"` — catches any fetch or parsing error

**API error handling in `api.ts`:**
```tsx
export async function getHealth(): Promise<Health> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`health ${res.status}`);
  return (await res.json()) as Health;
}
```

**Testability:**
- `data-testid="app-title"` on the title
- `data-testid="api-status"` on the status display
- Both enable reliable E2E and unit tests without brittle CSS selectors

**Assessment:**
- Proper React hooks usage (useEffect for side effects, useState for local state)
- Three-state flow (loading, success, error) is complete
- Error recovery: if the fetch fails, the user sees "down", not a blank or crashed component
- Testability: stable test IDs present

**Findings:**
- **Good:** Complete state coverage for a simple health check. No unhandled promise rejections or race conditions. (FINDING)
- **Minor:** Error state shows only `"down"`. HTTP status codes (e.g., 404, 500, timeout) are not displayed. Users don't know if it's a network error, a bad port, or a server crash.
- **Note:** test IDs are present, which is excellent for E2E coverage. As Phase 2+ adds more interactive components, this pattern should be applied consistently.

**Score justification:** Good (3/4) — solid error handling and state management for the scope. Minor gap: error detail could be richer.

---

## Files Audited

- `frontend/src/app/layout.tsx` — Root layout, body styling
- `frontend/src/app/page.tsx` — Home page component, main UI, state management
- `frontend/src/app/globals.css` — Tailwind theme configuration
- `frontend/src/lib/api.ts` — Typed API client, health endpoint call
- `frontend/next.config.ts` — Next.js configuration (static export mode)
- `frontend/package.json` — Dependencies (Next 16.4, React 19, Tailwind 4, TypeScript 7)
- `frontend/postcss.config.mjs` — PostCSS + Tailwind setup

---

## Summary

**Phase 1 is a walking skeleton:** the UI is a minimal dark Tailwind page proving browser → static file → same-origin API. Scoring reflects what was built — a placeholder — not an ambitious visual design.

**Strengths:**
- Color system is production-ready and matches the PLAN.md specification exactly
- Spacing adheres strictly to Tailwind's scale
- Async state handling is correct and complete
- Testability (data-testid) is in place
- No hardcoded colors, arbitrary values, or anti-patterns

**Opportunity (Phase 2+):**
- Improve loading/error state labels for user clarity ("connecting...", "down (timeout)")
- Expand typography scale and visual hierarchy as more components land
- Maintain the test ID and design system patterns established here

**Overall quality:** This skeleton is well-engineered. It establishes correct architectural patterns (async handling, design tokens, CSS-in-design approach) that will scale cleanly into Phase 2+.
