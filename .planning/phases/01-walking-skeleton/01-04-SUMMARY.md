---
phase: 01-walking-skeleton
plan: 04
subsystem: ui
tags: [nextjs, react, typescript, tailwindcss, static-export]

requires:
  - phase: 01-walking-skeleton
    provides: "01-01 repo scaffold and .gitignore (node_modules, .next, out, next-env.d.ts); 01-02 API contract with GET /api/health"
provides:
  - "frontend/ Next.js 16.4 TypeScript project that builds to a static export at frontend/out"
  - "Typed same-origin getHealth() in src/lib/api.ts"
  - "Dark Tailwind v4 placeholder page with test ids app-title and api-status"
  - "Tailwind @theme color tokens (surface, panel, border, accent, primary, secondary)"
affects: [01-05, phase-02-streaming, phase-03-watchlist-ui]

actuals:
  tokens: 18042
  tasks: 3
  commits: 2
plan_head_before: 1ab0a568f2b2c22cbc728855654b5e4f3a87db50
plan_head_after: 3697d1dff4ccee88b4abd039cdca03b586271908

tech-stack:
  added: [next 16.4.0, react 19.3.0, react-dom 19.3.0, typescript 7.0.2, tailwindcss 4.3.3, "@tailwindcss/postcss 4.3.3", postcss 8.5.29, "@types/node 24", "@types/react 19.3.0", "@types/react-dom 19.3.0"]
  patterns:
    - "Hand-written Next project (no create-next-app) to avoid Cache Components and agent files"
    - "Static export in build; /api rewrites spread only when NODE_ENV is development"
    - "Same-origin fetches via typed helpers in src/lib/api.ts, relative imports (no path alias)"
    - "Tailwind v4 CSS-first @theme tokens, no tailwind.config.*"
    - "No next/font/google: export build makes no network calls"
    - "data-testid hooks for Playwright"

key-files:
  created:
    - frontend/package.json
    - frontend/package-lock.json
    - frontend/next.config.ts
    - frontend/tsconfig.json
    - frontend/postcss.config.mjs
    - frontend/src/app/layout.tsx
    - frontend/src/app/page.tsx
    - frontend/src/app/globals.css
    - frontend/src/lib/api.ts
  modified: []

key-decisions:
  - "Followed the approved package versions exactly (user replied 'approved' at the Task 1 gate); npm saved caret ranges and the committed lockfile holds the exact resolved versions"
  - "Committed the Next-normalized tsconfig.json so repeat builds leave the tree clean (verified: second build left it byte-identical)"

patterns-established:
  - "Tracer-then-expand: Task 2 proved manifest -> config -> page -> fetch -> export before Task 3 added theming"
  - "Verification by grepping the built output (out/index.html and out/_next/static) for ids, endpoints and color hex values"

requirements-completed: [FND-03]

coverage:
  - id: D1
    description: "Frontend is a Next.js TypeScript project that builds to a static export (frontend/out/index.html) with no rewrites-with-export warning and no AGENTS.md"
    requirement: FND-03
    verification:
      - kind: integration
        ref: "npm --prefix frontend run build (Task 2 automated verify, exit 0)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Exported page calls same-origin /api/health via getHealth() and exposes test ids app-title and api-status"
    requirement: FND-03
    verification:
      - kind: integration
        ref: "grep data-testid=app-title in out/index.html; grep /api/health in out/_next/static"
        status: pass
    human_judgment: false
  - id: D3
    description: "Dark Tailwind theme: #0d1117, #ecad0a and #209dd7 reach built CSS; bg-surface in index.html; repeated build leaves tsconfig.json unchanged"
    requirement: FND-03
    verification:
      - kind: integration
        ref: "Task 3 automated verify (build twice, grep hex values, md5 tsconfig), exit 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "Live api-status reads 'ok' against a running FastAPI backend in a browser"
    requirement: FND-03
    verification: []
    human_judgment: true
    rationale: "Not exercised in this plan; 01-05 serves frontend/out from FastAPI and drives it with Playwright"

duration: 12min
completed: 2026-10-07
status: complete
---

# Phase 1 Plan 04: Static-export Next Frontend Summary

**Hand-written Next.js 16.4 + React 19.3 + Tailwind v4 project that exports a dark-themed placeholder page calling the same-origin `/api/health`, with a committed lockfile and Next-normalized tsconfig**

## Performance

- **Duration:** about 12 min (resumed after the Task 1 gate; the gate wait is excluded)
- **Completed:** 2026-10-07T21:51Z
- **Tasks:** 3 (Task 1 checkpoint approved, Tasks 2 and 3 executed)
- **Files created:** 9

## Accomplishments
- `npm run build` emits `frontend/out/index.html` as a static export with no rewrites-with-export warning, no `AGENTS.md`, and no network fetch at build time.
- `getHealth()` in `src/lib/api.ts` does a same-origin `fetch("/api/health")`; the page shows `checking`, then the status, or `down` on failure. Test ids `app-title` and `api-status` are ready for 01-05's Playwright check.
- Tailwind v4 CSS-first theme: the six PLAN.md section 2 colors are `@theme` tokens, and the hex values for surface, accent and primary are present in the built CSS.
- `src/lib/api.ts` is tracked (confirms the 01-01 ignore fix); `next-env.d.ts` is ignored; the lockfile contains `@next/swc-linux-x64-gnu` so the Linux `npm ci` in 01-05 can resolve the native binary.

## Task Commits

1. **Task 1: Verify npm packages before first install** - no commit (blocking-human gate; user replied "approved")
2. **Task 2: Static-export page that calls same-origin /api/health (tracer)** - `c6458af` (feat)
3. **Task 3: Tailwind dark terminal theme** - `3697d1d` (feat)

**Plan metadata:** committed with this SUMMARY (docs: complete plan)

Tracer feedback gate: Task 2 has no `gate="blocking-human"` and its `<verify>` is automated-only, so the verify command was re-run to completion (exit 0) and expansion proceeded.

## Files Created/Modified
- `frontend/package.json` - manifest, `dev` and `build` scripts, `engines.node >=24`, no `type` field
- `frontend/package-lock.json` - exact resolved dependency tree (committed)
- `frontend/next.config.ts` - `output: "export"` in build, dev-only `/api` proxy to :8000, `agentRules: false`
- `frontend/tsconfig.json` - Next-normalized (adds jsx, allowJs, incremental, esModuleInterop, resolveJsonModule, `.next/dev/types` include)
- `frontend/postcss.config.mjs` - `@tailwindcss/postcss` plugin
- `frontend/src/app/globals.css` - Tailwind import and `@theme` color tokens
- `frontend/src/app/layout.tsx` - `metadata` title and `RootLayout` with dark body classes
- `frontend/src/app/page.tsx` - client component `Home` with the two test ids
- `frontend/src/lib/api.ts` - `Health` type and `getHealth()`

## Decisions Made
- Installed exactly the versions approved at the Task 1 gate. npm recorded caret ranges (for example `^16.4.0`) in `package.json`; the lockfile fixes the resolved versions, and 01-05 installs with `npm ci`.
- Kept `tsconfig.json` as Next rewrote it after the first build and committed it, per the research pitfall.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. TLS under interception was not a problem: `NODE_EXTRA_CA_CERTS` was already set, installs and builds succeeded, and no verification was weakened.

## Known Stubs
None. The page is an intentional placeholder by plan design (FND-03 skeleton); the status value is wired to the real `getHealth()` call, not mock data.

## Threat Flags
None. No new network endpoints or trust boundaries beyond the plan's threat model (T-01-11, T-01-12, T-01-13, T-01-SC). T-01-11 mitigated (no `next/font` or remote assets: acceptance grep prints nothing); T-01-SC mitigated (Task 1 gate, committed lockfile).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 01-05 can serve `frontend/out` via `STATIC_DIR` locally and `COPY` it into `/app/static` in Docker, and assert `api-status` reads `ok`.
- Note for 01-05: git emits LF-to-CRLF warnings for frontend files on this Windows machine (autocrlf); not a build issue but Docker `npm ci` should run from the committed lockfile.

## Self-Check: PASSED

- All nine created files exist on disk and are tracked.
- Commits `c6458af` and `3697d1d` are ancestors of HEAD; `git rev-list --count` from the ledger base reports 2.
- Task 2 and Task 3 automated verify commands both exited 0; all acceptance criteria checks passed (`"type"` count 0, no `next/font`, `fetch("/api/health")` present, `getHealth` imported from `../lib/api`, six `--color-*` tokens, no `tailwind.config.*`).

---
*Phase: 01-walking-skeleton*
*Completed: 2026-10-07*
