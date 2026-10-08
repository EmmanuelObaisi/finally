---
schema_version: 1
open_count: 0
waived_count: 0
fixed_count: 1
total_count: 1
last_updated: 2026-10-08T14:10:01.649Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 02 | stub | frontend/src/components/WatchlistRow.tsx | 31 | Sparkline cell is an empty placeholder div; plan 02-07 replaces it with the Lightweight Charts sparkline | fixed |  | 2026-10-08T13:54:46.418Z | 2026-10-08T14:10:01.649Z |

````json
[
  {
    "id": 1,
    "kind": "stub",
    "phase": "02",
    "file": "frontend/src/components/WatchlistRow.tsx",
    "line": 31,
    "description": "Sparkline cell is an empty placeholder div; plan 02-07 replaces it with the Lightweight Charts sparkline",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-10-08T13:54:46.418Z",
    "resolved_at": "2026-10-08T14:10:01.649Z",
    "milestone": null
  }
]
````
