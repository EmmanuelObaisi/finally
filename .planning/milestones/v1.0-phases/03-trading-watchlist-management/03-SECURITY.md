---
phase: "3"
slug: "trading-watchlist-management"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-08"
---

# Phase 3 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser -> `POST /api/portfolio/trade` | Untrusted JSON order body | ticker, side, quantity (simulated money) |
| Browser -> `POST` / `DELETE /api/watchlist` | Untrusted ticker in body and path | ticker text |
| Server -> browser error bodies | Server text rendered in the UI | fixed-template error strings that may quote the input |
| SSE stream -> positions table | Live prices drive client-side P&L | display-only prices |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-03-01 | Tampering | `TradeRequest`, `execute_trade` quantity | high | mitigate | `Field(strict=True, allow_inf_nan=False)`, 6 dp round and `not quantity > 0` in `backend/app/trading.py`; CHECK constraints in `backend/app/db.py` | closed |
| T-03-02 | Tampering | Concurrent trades (double spend) | high | mitigate | `db.transaction` runs `BEGIN IMMEDIATE`; `test_concurrent_buys_only_one_can_afford` | closed |
| T-03-03 | Tampering | SQL built from the ticker | medium | mitigate | `normalize_ticker` (ASCII, `fullmatch`) in `backend/app/tracking.py`; no f-string or `.format` SQL in `backend/app` | closed |
| T-03-04 | Information disclosure | Error bodies | low | mitigate | `DomainError` / `NotFoundError` fixed templates; generic 500 `Internal server error` in `backend/app/errors.py` | closed |
| T-03-05 | Denial of service | Symbols left streaming after failed buys | low | mitigate | `finally: await sync_ticker(...)` in `place_trade`; `test_tracking.py` | closed |
| T-03-06 | Tampering | Micro-quantity orders whose cost rounds to $0.00 | low | accept | See Accepted Risks Log | closed |
| T-03-07 | Repudiation | Trade history | low | mitigate | `INSERT INTO trades` inside the same transaction as cash and position writes | closed |
| T-03-08 | Tampering | Ticker input on add | medium | mitigate | `normalize_ticker` before any market or DB call; parameterized SQL in `backend/app/watchlist.py` | closed |
| T-03-09 | Denial of service | Unknown symbols polled forever | low | mitigate | `add_to_watchlist` ends in `finally: await sync_ticker(...)`; `test_unpriced_ticker_is_rejected_and_not_left_tracked` | closed |
| T-03-10 | Tampering | Held position losing its price on removal (IN-03) | medium | mitigate | `remove_from_watchlist` calls `sync_ticker`; `test_removing_a_held_ticker_keeps_it_streaming_and_priced` | closed |
| T-03-11 | Denial of service | Long input echoed in `Invalid ticker: ...` | low | accept | See Accepted Risks Log | closed |
| T-03-12 | Tampering (XSS) | `FormMessage` rendering server error text | medium | mitigate | React text node only; `dangerouslySetInnerHTML` absent from `frontend/src` | closed |
| T-03-13 | Tampering | Accidental orders (Enter, double click) | medium | mitigate | `type="button"`, `onSubmit` preventDefault, pending lock in `TradeBar.tsx`; `TradeBar.test.tsx` | closed |
| T-03-14 | Tampering (display integrity) | Stale GET overwriting a trade result | low | mitigate | Ticket guard in `frontend/src/lib/portfolioStore.ts`; `portfolioStore.test.ts` | closed |
| T-03-15 | Information disclosure | GET failure details | low | mitigate | Fixed-string errors; `api.test.ts` "secret detail" test | closed |
| T-03-16 | Spoofing (stale data shown as live) | Positions live cells while disconnected | low | mitigate | `opacity-60` dim in `PositionRow.tsx`; `PositionsTable.test.tsx` | closed |
| T-03-17 | Tampering (display integrity) | Client-side P&L recomputation | low | accept | See Accepted Risks Log | closed |
| T-03-18 | Tampering (XSS) | `watchlist-message` rendering `Invalid ticker: <input>` | medium | mitigate | Rendered via `FormMessage` text node in `WatchlistPanel.tsx` | closed |
| T-03-19 | Tampering (display integrity) | Out-of-order mutation responses | low | mitigate | Shared `busy` lock disables input, Add and remove buttons; `WatchlistPanel.test.tsx` | closed |
| T-03-20 | Tampering | Ticker text in the DELETE path | low | mitigate | `encodeURIComponent` in `frontend/src/lib/api.ts`; server parameterized SQL and 404 | closed |
| T-03-SC | Tampering | Package installs | low | accept | See Accepted Risks Log | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-03-01 | T-03-06 | At most half a cent per fill of simulated money for a single local user; contract fixes 2 dp money and 6 dp quantities | plan 03-01 threat model | 2026-10-08 |
| AR-03-02 | T-03-11 | Contract requires quoting the input; single local user; request body size is bounded by the server | plan 03-02 threat model | 2026-10-08 |
| AR-03-03 | T-03-17 | Display-only; the server portfolio from each trade or GET stays authoritative | plan 03-04 threat model | 2026-10-08 |
| AR-03-04 | T-03-SC | No packages were installed in this phase | plans 03-01..03-05 threat models | 2026-10-08 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-08 | 21 | 21 | 0 | secure-phase (ASVS L1 grep verification) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-08
