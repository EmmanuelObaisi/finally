---
phase: 01
review: 01-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "The `/api/*` catch-all turns wrong-method requests on real endpoints into 404 instead of 405"
  - id: IN-01
    severity: info
    disposition: open
    title: "Validation-error message formatting is inconsistent for non-field locations (carried forward)"
  - id: IN-02
    severity: info
    disposition: fixed
    title: "`test_health_is_side_effect_free` asserts nothing about side effects (carried forward)"
  - id: IN-03
    severity: info
    disposition: open
    title: "`.gitignore` gaps (carried forward)"
  - id: IN-04
    severity: info
    disposition: open
    title: "`CONFIG_VARS` is defined twice"
  - id: IN-05
    severity: info
    disposition: open
    title: "Non-root image will not be able to write a root-owned `/app/db` mount"
  - id: IN-06
    severity: info
    disposition: open
    title: "Minor robustness and consistency nits in the health path"
open: 5
total: 7
recorded: 2026-10-08T08:28:48.188Z
---

# Phase 01: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | fixed | b9e94ca |
| IN-01 | info | open | - |
| IN-02 | info | fixed | 91dfc2e |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| IN-06 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.

## Prior review (f932e62), closed by gap plans 01-06, 01-07 and 01-08

The re-review above reuses finding IDs, so the earlier decisions are kept here rather than in the table. The re-review confirmed every fix below.

| Prior ID | Severity | Finding | Disposition |
|----------|----------|---------|-------------|
| CR-01 | critical | Copying `.env.example` to `.env` crashes the backend at startup | fixed (2824808) |
| WR-01 | warning | Dockerfile masks a failed `uv sync` | fixed (85f71e1) |
| WR-02 | warning | Runtime container runs as root | fixed (85f71e1) |
| WR-03 | warning | Test suite depends on, and leaks, process environment | fixed (5f97c53) |
| WR-04 | warning | `getHealth` ignores HTTP status | fixed (63f1589) |
| WR-05 | warning | Non-GET/POST methods on unknown `/api/*` paths do not return 404 | fixed (40a5611) |
