---
phase: 03
review: 03-REVIEW.md
titles: json
findings:
  - id: WR-06
    severity: warning
    disposition: open
    title: "The sub-cent guard makes dust positions permanently unsellable"
  - id: WR-07
    severity: warning
    disposition: open
    title: "The post-failure watchlist refresh can overwrite a newer result"
  - id: IN-01
    severity: info
    disposition: open
    title: "Rejected buys of unknown tickers still hit the market source (carried forward)"
  - id: IN-04
    severity: info
    disposition: open
    title: "Effect dependency list is incomplete (carried forward)"
  - id: IN-06
    severity: info
    disposition: open
    title: "Cancellation can run the final sync while the trade thread is still committing"
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "Sub-cent fills move no cash, so shares can be acquired for free"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "Header total values missing-stream positions at avg_cost, not the server's current_price"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "The tracking rule is check-then-act with no serialization"
  - id: WR-04
    severity: warning
    disposition: fixed
    title: "Body-level validation errors produce malformed messages"
  - id: WR-05
    severity: warning
    disposition: fixed
    title: "A failed remove leaves a stale row that can never be cleared"
  - id: IN-02
    severity: info
    disposition: open
    title: "Micro positions show a spurious P&L in the table"
  - id: IN-03
    severity: info
    disposition: open
    title: "The portfolio is fetched twice on every page load"
  - id: IN-05
    severity: info
    disposition: open
    title: "E2E specs depend on each other and cannot be re-run against a persistent container"
open: 8
total: 13
recorded: 2026-10-09T01:04:43.126Z
---

# Phase 03: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-06 | warning | open | - |
| WR-07 | warning | open | - |
| IN-01 | info | open | - |
| IN-04 | info | open | - |
| IN-06 | info | open | - |
| WR-01 | warning | fixed | 03-REVIEW-FIX.md (not in the current review) |
| WR-02 | warning | fixed | 03-REVIEW-FIX.md (not in the current review) |
| WR-03 | warning | fixed | 03-REVIEW-FIX.md (not in the current review) |
| WR-04 | warning | fixed | 03-REVIEW-FIX.md (not in the current review) |
| WR-05 | warning | fixed | 03-REVIEW-FIX.md (not in the current review) |
| IN-02 | info | open | - (not in the current review) |
| IN-03 | info | open | - (not in the current review) |
| IN-05 | info | open | - (not in the current review) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
