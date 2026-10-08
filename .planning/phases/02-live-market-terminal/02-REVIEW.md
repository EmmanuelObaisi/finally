---
phase: 02-live-market-terminal
reviewed: 2026-10-08T00:00:00Z
depth: standard
files_reviewed: 60
files_reviewed_list:
  - README.md
  - backend/app/db.py
  - backend/app/main.py
  - backend/app/market/__init__.py
  - backend/app/market/cache.py
  - backend/app/market/factory.py
  - backend/app/market/interface.py
  - backend/app/market/massive_client.py
  - backend/app/market/models.py
  - backend/app/market/seed_prices.py
  - backend/app/market/simulator.py
  - backend/app/market/stream.py
  - backend/app/portfolio.py
  - backend/app/watchlist.py
  - backend/pyproject.toml
  - backend/tests/conftest.py
  - backend/tests/market/test_cache.py
  - backend/tests/market/test_factory.py
  - backend/tests/market/test_massive.py
  - backend/tests/market/test_shutdown.py
  - backend/tests/market/test_simulator.py
  - backend/tests/market/test_stream.py
  - backend/tests/test_db.py
  - backend/tests/test_health.py
  - backend/tests/test_portfolio.py
  - backend/tests/test_watchlist.py
  - frontend/package.json
  - frontend/src/app/globals.css
  - frontend/src/app/layout.tsx
  - frontend/src/app/page.tsx
  - frontend/src/components/ConnectionDot.tsx
  - frontend/src/components/Footer.tsx
  - frontend/src/components/Header.test.tsx
  - frontend/src/components/Header.tsx
  - frontend/src/components/PriceCell.test.tsx
  - frontend/src/components/PriceCell.tsx
  - frontend/src/components/Sparkline.test.tsx
  - frontend/src/components/Sparkline.tsx
  - frontend/src/components/WatchlistPanel.test.tsx
  - frontend/src/components/WatchlistPanel.tsx
  - frontend/src/components/WatchlistRow.tsx
  - frontend/src/lib/api.ts
  - frontend/src/lib/chartTheme.ts
  - frontend/src/lib/format.test.ts
  - frontend/src/lib/format.ts
  - frontend/src/lib/store.test.ts
  - frontend/src/lib/store.ts
  - frontend/src/lib/totals.test.ts
  - frontend/src/lib/totals.ts
  - frontend/src/lib/types.ts
  - frontend/src/lib/useMarketStream.test.ts
  - frontend/src/lib/useMarketStream.ts
  - frontend/src/test/fakeEventSource.ts
  - frontend/vitest.config.ts
  - frontend/vitest.setup.ts
  - planning/API_CONTRACT.md
  - test/connection.spec.ts
  - test/motion.spec.ts
  - test/playwright.config.ts
  - test/smoke.spec.ts
findings:
  critical: 0
  warning: 6
  info: 7
  total: 13
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-10-08
**Depth:** standard
**Files Reviewed:** 60
**Status:** issues_found

## Summary

Reviewed the Phase 2 backend (SQLite init, simulator, Massive poller, price cache, SSE stream,
watchlist and portfolio reads), the Next.js terminal UI (store, EventSource hook, watchlist,
sparkline, header) and the unit and E2E tests. I also read `config.py` and `errors.py`, which
`main.py` imports but which are not in the file list, plus the `Dockerfile`, to check
cross-file behavior.

The core wiring is sound. Request and response shapes match `planning/API_CONTRACT.md`, the
catch-all 404 route and the error envelope work as documented, and the cache-version SSE loop
loses no updates. I found no security vulnerabilities and no data-loss bugs. The defects below
are latent failure modes, a chart/store divergence, an E2E test that cannot fail, and
robustness gaps that the next phases will hit.

No structural findings (fallow) were provided for this review.

## Warnings

### WR-01: Sparkline chart accumulates points beyond the 300-point store cap

**File:** `frontend/src/components/Sparkline.tsx:55-60` (store cap at `frontend/src/lib/store.ts:43`)
**Issue:** The store keeps a rolling 300-point window per ticker (`SPARK_CAP`). The chart is fed
incrementally with `series.update(newest)` and is never trimmed, so after 300 s the chart holds
more points than the store and `fitContent()` fits the whole growing history. A mounted sparkline
therefore shows an ever-longer window (and unbounded series data over a long session), while a
freshly mounted one (for example after Retry or a ticker re-render) shows only the last 300 s.
The two views of the same ticker disagree, and the "300-point buffer" contract is not honored on
the chart side.
**Fix:** Re-seed the series from the capped buffer instead of appending.
```tsx
useEffect(() => {
  if (!buffer || !series.current) return;
  series.current.setData(toData(buffer));
  fit.current();
}, [buffer]);
```
Alternatively keep `update()` and call `series.current.setData(toData(buffer))` only when
`buffer.length === SPARK_CAP` (the window has started sliding).

### WR-02: "sparklines draw from the stream" E2E test passes with an empty chart

**File:** `test/motion.spec.ts:12-15`
**Issue:** The test asserts that a `<canvas>` inside `sparkline-AAPL` is visible. lightweight-charts
creates its canvases when `createChart` runs, before any data arrives, so the assertion holds for
an empty chart and for a broken stream. The test cannot fail for the behavior it names.
**Fix:** Assert that data was drawn. For example, wait for several prices to stream, then check
that the canvas has non-transparent pixels:
```ts
await expect.poll(async () =>
  page.getByTestId("sparkline-AAPL").locator("canvas").first().evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    return d.some((v, i) => i % 4 === 3 && v > 0);
  }), { timeout: 15_000 }).toBe(true);
```

### WR-03: E2E backend is not isolated from the developer's shell environment and `.env`

**File:** `test/playwright.config.ts:23-28`
**Issue:** The `webServer.env` sets `STATIC_DIR`, `DB_PATH`, `SIM_SEED` and
`SIM_EVENT_PROBABILITY`, but not `MASSIVE_API_KEY` or `LLM_MOCK`. The child inherits `process.env`,
and `Settings.from_env()` also runs `load_dotenv(ROOT/.env, override=False)`. If a developer has
`MASSIVE_API_KEY` set in the shell or in the root `.env`, the "deterministic" E2E run silently
switches to the live Massive poller: `SIM_SEED` is ignored, real network calls are made, and the
tests become non-deterministic. `load_dotenv(override=False)` does not override a variable that is
already present, even as an empty string, so setting it to `""` pins the behavior.
**Fix:**
```ts
env: {
  ...,
  MASSIVE_API_KEY: "",   // force the simulator even if .env or the shell sets a key
  LLM_MOCK: "true",
},
```

### WR-04: A transient Massive error at startup aborts the whole app

**File:** `backend/app/market/massive_client.py:52-56` (called from `backend/app/main.py:31`)
**Issue:** `start()` runs `_poll()` once and lets every exception propagate, so lifespan startup
fails and uvicorn exits. The test `test_a_rejected_key_fails_start_without_falling_back` covers
only a rejected key, but the same path also kills the container on a DNS blip, a 429, a 5xx or a
read timeout. The steady-state loop (`_run`) deliberately survives these errors, so the two
behaviors are inconsistent. `docker run --rm` has no restart policy, so one network hiccup during
boot leaves the user with a dead container.
**Fix:** Fail fast only for authentication errors and let transient ones fall through to the poll
loop. The loop retries them, and the cache simply stays empty for a few seconds (the contract
already allows unpriced tickers).
```python
try:
    await self._poll()
except BadResponse as e:
    if "Unknown API Key" in str(e):   # or check the HTTP status
        raise
    logger.exception("Initial Massive poll failed; will retry")
except Exception:
    logger.exception("Initial Massive poll failed; will retry")
```

### WR-05: Massive path has no OS-trust-store opt-in on the target machine

**File:** `backend/app/market/massive_client.py:8,44` and `backend/pyproject.toml:5-10`
**Issue:** The project's own stack notes say the `massive` client uses urllib3 plus certifi and
will probably hit `CERTIFICATE_VERIFY_FAILED` on this Windows and Avast machine. They state that
`truststore` must be added and `truststore.inject_into_ssl()` called at startup. Neither was done,
and `truststore` is not a dependency. With `MASSIVE_API_KEY` set locally, `RESTClient` requests
fail the TLS check, and combined with WR-04 the app fails to start. I did not execute the Massive
path, so this follows from the project's documented finding and is not a reproduced failure.
**Fix:** `uv add truststore`, then inject once before the client is built (not under Docker, where
it is harmless):
```python
import truststore
truststore.inject_into_ssl()   # top of massive_client.py, before RESTClient(...)
```
Never disable verification.

### WR-06: `change_percent` can raise ZeroDivisionError and kill the whole stream

**File:** `backend/app/market/models.py:33` (trigger at `backend/app/market/cache.py:24,31`)
**Issue:** `PriceCache.update` rounds every price to 2 dp. A first price below $0.005 (for
example a Massive sub-cent quote) caches as `0.0`, so `session_start_price == 0.0` and
`change_percent` divides by zero. `to_dict()` is evaluated for every ticker inside
`price_frames` and `build_watchlist`. One such ticker therefore ends the SSE generator for all
clients, and the browser's reconnect hits the same error in a loop. `GET /api/watchlist` returns
500 for every request. The Massive poller skips only `not price`, and a raw 0.004 passes that check.
**Fix:** Reject prices that round to zero at the write boundary:
```python
price = round(price, 2)
if price <= 0:
    return None   # or raise; callers skip a non-positive price
```
Alternatively, guard in `change_percent`: `return 0.0 if not self.session_start_price else ...`.

## Info

### IN-01: Overlapping fetches can apply a stale response (Header and WatchlistPanel)

**File:** `frontend/src/components/Header.tsx:17-29`, `frontend/src/components/WatchlistPanel.tsx:15-27`
**Issue:** `load()` has no cancellation or sequencing. On mount (and under StrictMode) plus the
`connected` transition, two requests are in flight and the last response to resolve wins, not the
latest request. Harmless while the data is read-only, but Phase 3 trades will make an older
`/api/portfolio` response overwrite a newer one. `WatchlistPanel.load` also sets `"loading"`
first, which unmounts every row and sparkline and re-plays any stale flash class on remount.
**Fix:** Track a request counter in a ref and ignore responses whose id is not the latest. Keep
the existing rows visible during a refetch instead of switching to the skeleton.

### IN-02: Header swallows portfolio errors silently

**File:** `frontend/src/components/Header.tsx:20`
**Issue:** `.catch(() => {})` discards the failure with no log. The user sees `--` with no
indication why, and nothing retries until the next status transition.
**Fix:** At least `console.error`, or surface a retry affordance like the watchlist panel has.

### IN-03: Interface docs say `remove_ticker` evicts from the cache unconditionally

**File:** `backend/app/market/interface.py:22-23`, `backend/app/market/simulator.py:155-157`, `backend/app/market/massive_client.py:76-78`
**Issue:** Both sources drop the ticker from the price cache. `API_CONTRACT.md` says a held ticker
keeps streaming after it leaves the watchlist (PLAN.md section 13 item 1). Nothing at this layer
protects held tickers, so the Phase 3 watchlist DELETE handler must check open positions before
calling `remove_ticker`, or `build_portfolio` will fall back to avg-cost valuation and log errors.
**Fix:** Document the caller's duty in the interface docstring, or add the held-ticker guard
where Phase 3 wires up the DELETE route.

### IN-04: Free-plan startup can exceed the stated 5 calls per minute

**File:** `backend/app/market/massive_client.py:16,96-106,120-128`
**Issue:** On a free key, startup makes one failing snapshot call plus up to `MAX_EOD_LOOKBACK`
(5) grouped-daily calls, up to 6 calls inside a minute when several consecutive days have no data
(long holiday weekends). That is more than the 5 per minute the constant's comment cites. The
test `test_grouped_daily_walk_back_is_capped_and_skips_weekends` locks in the 5 grouped calls.
`_poll` also overwrites `_eod_closes` with `{}` when no data is found, discarding earlier good
closes.
**Fix:** Cap the lookback at 4 when entering EOD mode after a failed snapshot, or keep the
previous `_eod_closes` when the new fetch is empty.

### IN-05: Stale REST price shown for a ticker that has left the live frame

**File:** `frontend/src/components/WatchlistRow.tsx:12-23`
**Issue:** Once the stream is running, `live` is `undefined` only when the ticker is no longer
tracked. The row then falls back to `item.price` and `item.change_percent` from the one-time REST
call, a frozen number presented as if it were current, with no dimming.
**Fix:** Fall back to REST values only until the first frame has arrived; afterwards treat a
missing ticker as `--`.

### IN-06: Minor quality items

**Files:** `frontend/src/lib/format.ts:27-33`, `backend/app/watchlist.py:6-7`, `README.md:34`, `test/playwright.config.ts:26`, `frontend/src/components/Sparkline.tsx:28`
**Issue:**
- `fmtQty` and `fmtSigned` are exported but used only by tests (forward-looking for Phase 3).
- `PRICE_FIELDS` duplicates the key list of `PriceUpdate.to_dict`; adding a field in one place
  breaks the other silently.
- README gives `LLM_MOCK=true uv run ...`, which is POSIX-only; the user's primary shell is
  PowerShell (`$env:LLM_MOCK="true"; uv run ...`).
- `DB_PATH` uses `Date.now()` and the throwaway `finally-e2e-*.db` (plus `-wal` and `-shm`) is
  never removed, so temp files accumulate.
- `attributionLogo: false` deviates from the project note to keep the default logo; the footer
  link and notice compensate, so this looks intentional but should be recorded as a decision.
**Fix:** Remove or defer the unused exports, derive `PRICE_FIELDS` from the model, and add the
PowerShell form to the README.

### IN-07: Timing-based backend tests may be flaky under load

**Files:** `backend/tests/market/test_massive.py:220-231`, `backend/tests/market/test_shutdown.py:26-35`
**Issue:** `test_poll_loop_survives_an_error...` needs three successful polls inside a fixed
`sleep(0.1)` with a 0.01 s interval, and each poll goes through `asyncio.to_thread`. The
simulator test asserts `version > 2` after 0.1 s. On a slow or loaded CI machine these can fail
without any product bug.
**Fix:** Poll for the condition with a deadline (`while cache.version < 3 and time.monotonic() < deadline: await asyncio.sleep(0.01)`) instead of one fixed sleep.

---

_Reviewed: 2026-10-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
