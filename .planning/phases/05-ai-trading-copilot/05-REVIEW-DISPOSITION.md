---
phase: 05
review: 05-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: fixed
    title: "A message containing a lone surrogate executes trades, then returns 500 and stores nothing"
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "Any non-DomainError during an action aborts the whole turn after earlier actions committed"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "Chat history order depends on request-start time, so overlapping turns interleave"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "Client length limit differs from the server rule, so valid messages are blocked"
  - id: IN-01
    severity: info
    disposition: open
    title: "A failed send leaves the optimistic user bubble and restores the draft, so a resend shows the message twice"
  - id: IN-02
    severity: info
    disposition: open
    title: "`live_smoke.py` duplicates the `acompletion` call instead of using `complete()`"
  - id: IN-03
    severity: info
    disposition: open
    title: "Needless function-local import of `ChatReply` in the real branch"
  - id: IN-04
    severity: info
    disposition: open
    title: "Every chat reply replaces the portfolio object and so refetches portfolio history"
open: 4
total: 8
recorded: 2026-10-09T22:03:08.820Z
---

# Phase 05: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | fixed | 05-REVIEW-FIX.md |
| WR-01 | warning | fixed | 05-REVIEW-FIX.md |
| WR-02 | warning | fixed | 05-REVIEW-FIX.md |
| WR-03 | warning | fixed | 05-REVIEW-FIX.md |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
