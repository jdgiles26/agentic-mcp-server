---
description: Re-run the architecture audit. Updates DRIFT.md.
---

Run the drift detector and show the summary.

```bash
node "$(git rev-parse --show-toplevel)/scripts/audit.mjs"
```

After it finishes, read `DRIFT.md` and surface only the HIGH findings + the count of MED/LOW. No commentary unless the user asks. If there are 0 HIGH findings, say "0 HIGH findings" and stop.
