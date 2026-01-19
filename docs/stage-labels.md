Workflow Stage Labels

This document describes the `stage:*` label namespace and how the WAIF CLI displays and interprets stage labels.

Canonical stage tokens (machine-friendly):
- idea
- prd
- milestone
- planning
- in_progress
- review
- done

Selection rule
- WAIF reads `labels[]` from a bead and extracts labels prefixed with `stage:` (case-insensitive).
- If no `stage:*` labels are present, the computed stage is `unknown`.
- If one `stage:*` label is present, the computed stage is that token (lowercased, without the `stage:` prefix).
- If multiple `stage:*` labels are present, WAIF selects the most "mature" token according to the PRD maturity order (idea < prd < milestone < planning < in_progress < review < done).

WAIF behavior
- `waif show <id> --json` includes a computed `stage` field.
- `waif show <id>` prints a one-line warning when multiple `stage:*` labels are present and reports which stage was selected.
- Issues tables (next/recent/in-progress/show) include a non-droppable `Stage` column. When the terminal width is constrained, WAIF shortens stages to a 3-letter code (e.g., `inp` for `in_progress`).

Examples
- Add a stage label:

  bd update wf-123 --labels "stage:prd"

- Multiple stage labels (WAIF will warn and select the most mature):

  bd update wf-123 --labels "stage:idea,stage:planning"

