---
phase: 03
review: 03-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "Sub-cent fills move no cash, so shares can be acquired for free"
  - id: WR-02
    severity: warning
    disposition: open
    title: "Header total values missing-stream positions at avg_cost, not the server's current_price"
  - id: WR-03
    severity: warning
    disposition: open
    title: "The tracking rule is check-then-act with no serialization"
  - id: WR-04
    severity: warning
    disposition: open
    title: "Body-level validation errors produce malformed messages"
  - id: WR-05
    severity: warning
    disposition: open
    title: "A failed remove leaves a stale row that can never be cleared"
  - id: IN-01
    severity: info
    disposition: open
    title: "Rejected buys of unknown tickers still hit the market source"
  - id: IN-02
    severity: info
    disposition: open
    title: "Micro positions show a spurious P&L in the table"
  - id: IN-03
    severity: info
    disposition: open
    title: "The portfolio is fetched twice on every page load"
  - id: IN-04
    severity: info
    disposition: open
    title: "Effect dependency list is incomplete"
  - id: IN-05
    severity: info
    disposition: open
    title: "E2E specs depend on each other and cannot be re-run against a persistent container"
open: 10
total: 10
recorded: 2026-10-08T21:41:54.559Z
---

# Phase 03: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| WR-05 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
