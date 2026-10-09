# Phase 6: One-Command Launch & Full Verification - Pattern Map

**Mapped:** 2026-10-09
**Files analyzed:** 14 new/modified
**Analogs found:** 8 / 14 (the rest have no in-repo analog; use the verified prototypes in 06-RESEARCH.md Patterns 1-4)

All analog paths below are git-tracked (verified with `git ls-files test`; `Dockerfile` and `.gitattributes` are root tracked files).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `docker-compose.yml` | config | request-response | `Dockerfile` (env/port/db contract) | partial |
| `test/compose.e2e.yml` | config | request-response | `test/playwright.config.ts` webServer.env (same mock pins) | role-match |
| `scripts/start_mac.sh`, `stop_mac.sh` | utility | batch | none (RESEARCH Pattern 3) | none |
| `scripts/start_windows.ps1`, `stop_windows.ps1` | utility | batch | none (RESEARCH Pattern 3); EOL rule in `.gitattributes` | none |
| `test/e2e.mjs` | utility | batch | `test/playwright.config.ts` (BASE_URL switch + env) | partial |
| `test/persist.mjs` | utility/test | request-response | `test/playwright.config.ts` (mock env) | partial |
| `test/trade-sell.spec.ts` | test | request-response | `test/trade.spec.ts` | exact |
| `test/trade-chat.spec.ts` | test | request-response | `test/trade.spec.ts` | role-match |
| `test/zz-reconnect.spec.ts` | test | event-driven | `test/connection.spec.ts` | role-match |
| `test/hooks.spec.ts` (optional) | test | request-response | `test/connection.spec.ts` | role-match |
| `test/portfolio-charts.spec.ts` (edit) | test | request-response | itself, lines 32-34, 64-66 | exact |
| `test/package.json` (edit) | config | - | itself | exact |
| `test/playwright.config.ts` | config | - | no change (keep webServer switch) | exact |
| `README.md` (edit) | docs | - | itself | exact |

## Pattern Assignments

### `test/trade-sell.spec.ts` (test, request-response)

**Analog:** `test/trade.spec.ts`

**Imports and helpers** (lines 1-3):
```typescript
import { test, expect } from "@playwright/test";

const MONEY = /^\$[\d,]+\.\d{2}$/;
```

**Core pattern** (lines 5-28): read cash first, fill `trade-ticker` / `trade-quantity`, click `trade-buy` / `trade-sell`, assert `trade-message`:
```typescript
await page.getByTestId("trade-ticker").fill("AAPL");
await page.getByTestId("trade-quantity").fill("2");
await page.getByTestId("trade-buy").click();
const message = page.getByTestId("trade-message");
await expect(message).toHaveAttribute("data-kind", "success");
await expect(message).toHaveText(/^Bought 2 AAPL at \$[\d,]+\.\d{2}$/);
await expect(page.getByTestId("position-qty-AAPL")).toHaveText("2");
await page.getByTestId("trade-sell").click();
await expect(message).toHaveText(/^Sold 2 AAPL at \$[\d,]+\.\d{2}$/);
await expect(page.getByTestId("position-row-AAPL")).toHaveCount(0);
```

**Error pattern** (lines 46-60): `data-kind="error"` and `toHaveText(/^Insufficient shares: .../)`.

New work: use MSFT (not AAPL) so deltas are independent; assert `cash_after == cash_before + qty * price` with price parsed from the `trade-message` (RESEARCH "Sell spec core", Pitfall 6). Shared DB, assert deltas (D-04). Filename sorts after `smoke.spec.ts`.

---

### `test/trade-chat.spec.ts` (test, request-response)

**Analog:** `test/trade.spec.ts` (same cash/position delta style). Use RESEARCH "Chat spec core" verbatim.

Key rules from RESEARCH: click `chat-toggle` first (panel closed at 1280px viewport, Pitfall 5); use `.last()` on `chat-message-*` / `chat-action`; plain messages ("please buy some apple", "broke" alone) due to mock keyword precedence (Pitfall 7); for watchlist use `add AMD` then `remove AMD`, never PYPL.

---

### `test/zz-reconnect.spec.ts` (test, event-driven)

**Analog:** `test/connection.spec.ts`

**Dot assertions** (lines 3-9, 12-21):
```typescript
await expect(page.getByTestId("connection-dot")).toHaveAttribute("data-status", "connected");
await expect(page.getByTestId("connection-label")).toHaveText("Live");
// failure variant:
await expect(page.getByTestId("connection-dot")).toHaveAttribute("data-status", "disconnected", { timeout: 5000 });
await expect(page.getByTestId("connection-label")).toHaveText("Offline");
```

Add on top: `test.skip(!process.env.E2E_CONTAINER, ...)`, MutationObserver history, async `execFile("docker", ["restart", id])`, flatten positions through `page.request` first (RESEARCH "Reconnect spec core", Pitfalls 3-4). Named `zz-` so it runs last. Leave the existing route-mock Offline test untouched.

---

### `test/portfolio-charts.spec.ts` (edit, lines 33 and 65)

Current:
```typescript
test.skip(!!process.env.BASE_URL, "needs a pristine database");
```
Change both to `test.skip(!!process.env.BASE_URL && !process.env.E2E_FRESH_DB, "needs a pristine database");` (Pitfall 1). Update the comment at lines 30-31 to mention `E2E_FRESH_DB`.

---

### `test/hooks.spec.ts` (optional, test)

**Analog:** `test/connection.spec.ts` (load `/`, assert `getByTestId(...)` visibility). Iterate the testid list the new specs consume (header-cash, header-total-value, connection-dot, trade-*, chat-toggle, chat-panel, chat-input, chat-send, pnl-chart, heatmap-empty, ...). Name so it sorts after `smoke.spec.ts` and before `zz-`; assert only presence, no state.

---

### `test/compose.e2e.yml` (config)

**Analog:** `test/playwright.config.ts` lines 25-32, the existing mock pins:
```typescript
SIM_SEED: "1",
SIM_EVENT_PROBABILITY: "0",
// Pin the simulator even if the shell or the root .env sets a Massive key.
MASSIVE_API_KEY: "",
LLM_MOCK: "true",
```
Copy as literal `environment:` strings (YAML `"true"`, `"1"`, `"0"`, `""`) plus `image: finally-e2e` (RESEARCH Pattern 2).

---

### `docker-compose.yml` (config)

**Analog:** `Dockerfile` for the contract: port 8000, `DB_PATH=/app/db/finally.db` (line `ENV ... DB_PATH=/app/db/finally.db`), `/app/db` owned by `app`, HEALTHCHECK on `/api/health` (so `up --wait` works), CMD binds `0.0.0.0:8000`. Use RESEARCH Pattern 1 shape verbatim (`name: finally`, `image: finally`, `build: .`, `127.0.0.1:${FINALLY_PORT:-8000}:8000`, optional `env_file`, literal `DB_PATH`, project-scoped named volume, no `restart:`, no `container_name`). `.gitattributes` already has `docker-compose*.yml text eol=lf`.

---

### `scripts/*` (utility, batch)

No in-repo analog. Use RESEARCH Pattern 3 prototypes. Repo rules from `.gitattributes`: `*.sh text eol=lf`, `*.ps1 text eol=crlf`; set exec bit via `git update-index --chmod=+x scripts/*.sh`. Keep default `$ErrorActionPreference` and check `$LASTEXITCODE`. Add the two-line `docker info` preflight (Pitfall 10).

---

### `test/e2e.mjs` and `test/persist.mjs` (utility, batch)

Only partial analog: `test/playwright.config.ts` line 8 `use: { baseURL: process.env.BASE_URL ?? "http://localhost:8000" }` and line 20 `process.env.BASE_URL ? undefined : {...}` define the contract these scripts drive (set `BASE_URL`, config skips `webServer`). Follow RESEARCH Pattern 4 steps 1-6 (pre-clean, `up -d --build --wait`, `process.execPath` + `test/node_modules/@playwright/test/cli.js`, try/finally + signal handlers, `down -v`, fail on any skipped). `persist.mjs`: spawn the real start/stop scripts with own `COMPOSE_PROJECT_NAME`/`FINALLY_PORT`, use global `fetch`, always `down -v` in `finally`. Built-ins only (no new packages; package gate).

---

### `test/package.json` (edit)

Current `scripts`: `{ "smoke": "playwright test" }`. Add `"e2e": "node e2e.mjs"` and `"persist": "node persist.mjs"` next to it. No dependency changes.

## Shared Patterns

### data-testid selection
**Source:** all `test/*.spec.ts`. Always `page.getByTestId(...)`; state via `data-status`, `data-kind`, `data-ok`, `data-points`, `data-selected`. Apply to every new spec.

### Money assertions
**Source:** `test/trade.spec.ts:3` `MONEY` regex; parse with a `num()` helper that strips `$` and commas for delta math.

### Shared-DB ordering (workers: 1)
Files run alphabetically: connection, motion, portfolio-charts, smoke, then new `trade-*`, trade, watchlist, `zz-`. New specs must not precede pristine-state specs and must leave no watchlist residue.

### Mock env pins
**Source:** `test/playwright.config.ts:25-32`. Same four values for local mode, compose override, and persistence check.

### Security
Loopback port bind only; never print resolved compose config; no TLS-disabling flags anywhere.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `scripts/start_*.{sh,ps1}`, `stop_*.{sh,ps1}` | utility | batch | `scripts/` does not exist; use RESEARCH Pattern 3 |
| `docker-compose.yml` | config | - | no prior compose file; Dockerfile only partial |
| `test/e2e.mjs`, `test/persist.mjs` | utility | batch | no prior Node orchestration scripts in `test/` |

## Metadata

**Analog search scope:** `test/`, root config files (`Dockerfile`, `.gitattributes`, `.env.example`), `backend/tests/` listing.
**Files scanned:** ~10
**TEST-04/TEST-05:** existing suites (`backend/tests/test_*.py`, 26 Vitest files) are the pattern; per RESEARCH add tests only where an audit matrix proves a miss.
**Pattern extraction date:** 2026-10-09
