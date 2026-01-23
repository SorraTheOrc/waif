# CLI Wrappers

WAIF includes a small set of helpers and example commands intended to make it easy to author consistent, safe CLI wrappers around existing tools (such as `bd` and `git`).

Goals:
- Provide safe defaults (`--dry-run`, fail-fast when prerequisites are missing).
- Prefer idempotent operations when mutating Beads metadata.
- Keep wrappers minimal and composable.

## Example: start work on a bead

Command:

```bash
wf id start <bead-id>
```

Behavior:
- Requires a clean git working tree (aborts if dirty).
- Uses `bd` to move the bead to `in_progress` (when not already).
- Creates or checks out a local topic branch named `bd-<bead-id>/<slug>`.
- Records a Beads external ref `branch:<branch-name>` if the bead has no external ref.
- Adds a single bead comment: `Branch created: <branch> (local)`.

Dry run:

```bash
wf id start <bead-id> --dry-run
```

Notes:
- This command does not push branches or open PRs automatically.
- Suggested next step: `git push -u origin <branch>`.
