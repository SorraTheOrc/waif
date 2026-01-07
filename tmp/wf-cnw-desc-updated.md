# Project Initialization: `waif init`

## Problem
New projects need a reproducible way to get WAIF’s local config and scripts in place so developers can start the WAIF workflow quickly. Copying required files (OpenCode plugin, `config/`, and `scripts/`) is currently manual and error-prone, delaying onboarding and increasing support requests.

## Users
- Primary: repository maintainers and developers who want to onboard WAIF into a new project quickly.
- Secondary: PMs and agent operators who need predictable local environments for running agent-driven workflows and tests.

## Success criteria
Running `cd project_dir; waif init; ./scripts/start-workflow-tmux.sh` starts a tmux session where panes are configured per `config/workflow_agents.yaml` and a full WAIF workflow environment (OpenCode plugin files, `config/`, and `scripts/`) is present. `waif init` is idempotent and safe to re-run. It must NOT copy `.beads/` (users should run `beads init` separately to create repository beads).

## Constraints
- Must NOT copy the repository’s `.beads/` folder.
- Default behavior on conflicts: abort and explain how to use idempotent runs; do not overwrite silently.
- Must not require elevated privileges or alter remote state; must be safe on repeated runs.
- Must be compatible with existing `waif` CLI behavior and tests.

## Existing state
- `scripts/start-workflow-tmux.sh` (tmux startup script)
- `config/workflow_agents.yaml` (tmux pane definitions)
- `docs/dev/opencode_integration_PRD.md` (related setup PRD)
- `docs/dev/context_pack_PRD.md` (related agent context PRD)
- `docs/Workflow.md` (workflow guidance)

## Desired change
Add a `waif init` CLI command that:
- Runs `bd init --branch beads-wync --prefix <prefix>` in the target repo before copying files to create the beads sync worktree and avoid copying `.beads/`.
- Copies the following template files into a target project: the entire `.opencode/` directory, `config/`, `scripts/`, and `docs/dev/`.
- Do NOT copy `.beads/`.
- Default conflict policy: abort with an explanation and guidance on idempotent re-runs.
- Provide `--dry-run`, `--minimal` (only `config/`), and `--full` (config + scripts + `.opencode/` + `docs/dev/`) modes.
- Optionally provide `--force-backup` for implementers to support backups (PRD will define exact flags).
- Validate that `./scripts/start-workflow-tmux.sh` exists and is executable; output the command to start the workflow.

## Likely duplicates / related docs
- `docs/dev/opencode_integration_PRD.md`
- `docs/dev/context_pack_PRD.md`
- `docs/Workflow.md`
- `config/workflow_agents.yaml`
- `scripts/start-workflow-tmux.sh`
- `config/waif_pacakges.yaml`

## Related issues (Beads ids)
- `wf-ba2.3.5` — Per-repo config file (template + lint rules)
- `wf-jax`, `wf-jax.1` — Context/plugin PRD updates
- `wf-moa` — Context pack default behavior
- `wf-ba2.5.4.4` — Overflow handling for context pack

## Clarifying questions
1. Confirmed default file set: copy `.opencode/`, `config/`, `scripts/`, and `docs/dev/` (do not copy `.beads/`).
2. Overwrite policy: default abort on conflict; PRD will define `--force-backup` and `--dry-run` flags.
3. Modes: `--minimal` and `--full` are proposed; confirm names in PRD.
4. Should `waif init` include a `--link` (symlink) mode? (default: no, copy only)
5. Acceptance tests: include an E2E smoke test that runs `waif init` in a temp dir and asserts the presence of the expected files.
6. Parenting: create standalone feature or attach to `wf-ba2.3.5` as parent? (left standalone)

## Proposed next step
- NEW PRD at: `docs/dev/waif_init_PRD.md`
- Recommended next command (after bead creation): `/prd docs/dev/waif_init_PRD.md <new-issue-id>`
