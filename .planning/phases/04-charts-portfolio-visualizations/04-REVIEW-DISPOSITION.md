---
phase: 04
review: 04-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "Selection tests assert effect-derived state right after `findByTestId`, so they can fail intermittently"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "`portfolio-charts.spec.ts` only passes on a pristine database, so it is not re-runnable against a long-lived server"
  - id: IN-01
    severity: info
    disposition: open
    title: "Databases created before this phase never receive the seed snapshot"
  - id: IN-02
    severity: info
    disposition: open
    title: "`PnlChartPanel` fetches history twice at startup and its `useMemo` is ineffective"
  - id: IN-03
    severity: info
    disposition: open
    title: "Live P&L point is dropped when the browser clock is behind the server's"
  - id: IN-04
    severity: info
    disposition: open
    title: "`MainChartPanel` has no REST fallback for the change percent"
  - id: IN-05
    severity: info
    disposition: open
    title: "Test hygiene: fetch stubs leak across tests in two files"
open: 5
total: 7
recorded: 2026-10-09T09:41:30.892Z
---

# Phase 04: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | fixed | 04-REVIEW-FIX.md |
| WR-02 | warning | fixed | 04-REVIEW-FIX.md |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
