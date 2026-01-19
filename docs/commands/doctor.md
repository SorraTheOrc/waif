Doctor (wf doctor)

The `doctor` command validates the beads plan and surfaces common issues. It is read-only and will never modify issues.

Usage and behavior
- Command: `wf doctor` (alias: `doctor`) scans open/in_progress beads by default; use `--include-closed` to include closed issues.
- Filters: `--type <kind>` filters to one category (intake, dependency, cycles, orphans, missing-stage — aliases `stage`, `stages` accepted).
- Output: by default the command renders human-friendly grouped tables. Use `--json` to emit structured JSON only (suitable for automation).
- Safety: `wf doctor` does not change anything. If you need to add or update labels, use the `bd` CLI or a dedicated command that explicitly performs edits.

Examples
- Human output for all checks:

  wf doctor

- JSON for only missing-stage results (automation):

  wf doctor --type stage --json

Related docs
- Stage labels and canonical tokens: `docs/stage-labels.md`

Notes
- The `doctor` command intentionally keeps detection and remediation separate. Any write operations must be performed explicitly via `bd update` or dedicated WAIF commands that require explicit user consent.
