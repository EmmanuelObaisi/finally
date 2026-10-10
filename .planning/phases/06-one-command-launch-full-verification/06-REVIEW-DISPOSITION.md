---
phase: 06
review: 06-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "`trade-chat.spec.ts` is not re-runnable against a persistent database"
  - id: WR-02
    severity: warning
    disposition: open
    title: "Broken-start check can pass vacuously and does not prove the cause"
  - id: WR-03
    severity: warning
    disposition: open
    title: "`zz-reconnect` leaves a possibly-rejecting `waitForRequest` promise unattended"
  - id: IN-01
    severity: info
    disposition: open
    title: "PowerShell scripts change the caller's working directory"
  - id: IN-02
    severity: info
    disposition: open
    title: "Start-script inconsistencies between platforms"
  - id: IN-03
    severity: info
    disposition: open
    title: "`hostHasKey` can disagree with compose's `.env` parsing"
  - id: IN-04
    severity: info
    disposition: open
    title: "Heatmap colour assertion depends on `rgb()` computed values"
  - id: IN-05
    severity: info
    disposition: open
    title: "Duplicated helpers and a Windows `bash` ambiguity in the e2e drivers"
open: 8
total: 8
recorded: 2026-10-10T03:15:30.085Z
---

# Phase 06: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
