---
phase: "4"
slug: "charts-portfolio-visualizations"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-09"
---

# Phase 4 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| browser -> `GET /api/portfolio/history` | Any local client (one or many tabs) polls the route every 30 s and after portfolio changes; each request may write one row | Portfolio totals (non-sensitive, single user) |
| request handler -> SQLite | The snapshot guard's read-then-insert must be atomic across concurrent requests | `portfolio_snapshots` rows |
| API/SSE data -> DOM | Tickers, history values, P&L values and server errors reach chart headings, tile text, `title` and `aria-label` | Server-validated tickers, numbers |
| browser resources | One canvas chart instance per chart lives for the page's lifetime | Client memory/CPU |
| npm registry -> frontend/node_modules | Third-party code (d3-hierarchy and its types) enters the build in plan 04-04 | Package code |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-04-01 | Denial of service | `portfolio_snapshots` growth from repeated history requests | medium | mitigate | `record_if_due` inserts only after `MIN_INTERVAL_SECONDS = 10` AND a changed value; reads `LIMIT 2000` (`backend/app/history.py:11,31,48`); pinned by `test_interval_boundary_nine_seconds_skips_ten_records`, `test_unchanged_value_keeps_one_point_however_old_the_seed`, `test_history_returns_the_newest_2000_ascending` | closed |
| T-04-02 | Tampering | Concurrent requests both inserting | low | mitigate | Read-latest and insert inside one `transaction(conn)` (`history.py:21`); `test_concurrent_requests_record_at_most_one_snapshot` | closed |
| T-04-03 | Tampering (integrity) | Client-supplied snapshot values | low | mitigate | Route takes no body/query; value is `build_portfolio(conn, cache)["total_value"]` (`history.py:30`); `test_post_to_history_is_a_json_404` | closed |
| T-04-04 | Tampering (SQL injection) | History queries | low | mitigate | `?` placeholders only; no f-string SQL in `history.py` | closed |
| T-04-05 | Information disclosure | Error responses | low | mitigate | Existing `{"error"}` envelope; route returns only `total_value` and `recorded_at` | closed |
| T-04-06 | Tampering (XSS) | Ticker text in main chart headline, select button `title`/`aria-label` | low | mitigate | React escaping only; no `dangerouslySetInnerHTML`/`innerHTML` anywhere in `frontend/src` | closed |
| T-04-07 | Information disclosure | Main chart error state | low | mitigate | Fixed UI-SPEC copy; `api.ts` throws fixed `"<resource> <status>"` messages | closed |
| T-04-08 | Denial of service (client) | Chart instance churn on ticker switch | low | mitigate | Chart created once on mount; `MainChartPanel.test.tsx:148` asserts `createChart` called once across a switch | closed |
| T-04-09 | Denial of service | Refetch storms (StrictMode, overlapping polls, many tabs) | low | mitigate | Single `setInterval` cleared on unmount (`PnlChartPanel.tsx:32,35`), skipped while `inFlight > 0` (`historyStore.ts`); server guard T-04-01 bounds writes | closed |
| T-04-10 | Information disclosure | P&L error overlay | low | mitigate | `getPortfolioHistory` throws `"history " + status` (`api.ts:19`); "secret detail" test in `api.test.ts:46-48` | closed |
| T-04-11 | Tampering (integrity) | Client-side live point | low | mitigate | Live point is display-only; the only frontend reference to the history path is the GET in `api.ts:18`; route accepts no body | closed |
| T-04-12 | Tampering (XSS) | Ticker and values in heatmap tile text and attributes | low | mitigate | React escaping only; no raw-HTML prop in `frontend/src` | closed |
| T-04-13 | Information disclosure | Heatmap error overlay | low | mitigate | Fixed UI-SPEC copy; `getPortfolio` throws `"portfolio " + status` (`api.ts:13`) | closed |
| T-04-14 | Tampering | TLS during `npm install` | high | mitigate | No `NODE_TLS_REJECT_UNAUTHORIZED`, `strict-ssl` or `--insecure` in any phase 4 commit; trust store via `NODE_EXTRA_CA_CERTS` only | closed |
| T-04-SC | Tampering | npm install of d3-hierarchy and @types/d3-hierarchy | high | mitigate | Blocking-human approval 2026-10-09 recorded in 04-01-SUMMARY.md "Approved packages"; exact pins `3.1.2` / `3.1.7` in `frontend/package.json`; lockfile with integrity hashes committed in 3debd08; registry audit: no install-time scripts, no runtime dependencies | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-04-01 | T-04-SC (plans 04-02, 04-03) | Plans 04-02 and 04-03 install no packages; the phase-level T-04-SC install risk is mitigated in 04-01/04-04 | plan-time disposition | 2026-10-09 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-09 | 15 | 15 | 0 | secure-phase orchestrator (L1 grep verification; short-circuit: register authored at plan time, ASVS 1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-09
