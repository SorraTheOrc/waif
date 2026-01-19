# Producer: convenience CLI wrappers (epic) — Intake Draft

Problem

Producers repeatedly perform small, error-prone steps to start work on a Beads issue: claim the bead, create a correctly named topic branch, optionally launch an OpenCode interview. These steps are mechanical and frequently cause friction, mistakes (wrong branch name, unpushed local branch, forgotten claim), and lost time.

Users

- Primary: Producers (people who create / act on beads)
- Secondary: Reviewers and Integrators who benefit from consistent branch names and bead metadata

Success criteria

- `waif id start` (or `wf id start`) idempotently claims a bead and creates a local topic branch using a predictable naming rule
- Safe defaults: abort on dirty working tree or missing tools; provide explicit remediation steps
- Idempotence: repeated runs do not create duplicate branches, bead comments, or external refs
- Minimal surface area: first deliverable performs local branch creation only (no automatic push or PR)
- Documentation: update `docs/dev/CLI_PRD.md` with a "Producer convenience CLI wrappers" section and usage examples

Constraints and rules

- ALL bead operations must use `bd` (never edit `.beads/issues.jsonl` directly)
- Respect `BD_ACTOR` / environment identity when making bead comments or updates
- Default behaviour: do not push branches or create PRs automatically
- Maintain auditability: add a single concise bead comment when a branch is created; prefer `bd update <id> --external-ref "<note>"` to record external refs

Existing state

- Related commands and helpers exist in `src/lib/bd.ts` and `src/commands/*` (use existing helpers where possible)
- Small, related beads exist (e.g., `wf-70j.2.1` - waif intake command)
- Draft saved at `.opencode/tmp/intake-draft-Producer_convenience_CLI_wrappers.md` in the repo; treat as the single source for this intake draft.

Proposed change

Create an epic "Producer: convenience CLI wrappers (epic)" (P1) that delivers a small family of convenience commands. The first scoped deliverable:

- CLI orchestration command `waif id start` (alias `wf id start` optional) that:
  - Verifies clean working tree and required tools (`git`, `bd`) are present; otherwise abort with remediation steps
  - Idempotently claims the bead via `bd update <id> --status in_progress` (no forced takeover)
  - Creates a local topic branch with the canonical name: `bd-<id>/<short-desc>`
    - `bd-<id>` is the bead numeric id (e.g., `bd-123`); `short-desc` is derived from the bead title: lowercase, punctuation removed, spaces -> hyphens, max 40 chars
    - Examples: bead title `Add intake wrapper` -> branch `bd-123/add-intake-wrapper`
  - Leaves branch local (no push); prints a one-line audit message and suggests `git push -u origin <branch>` when user is ready
  - Adds a single bead comment like: `Branch created: bd-123/add-intake-wrapper (local)` and also runs `bd update <id> --external-ref "branch:bd-123/add-intake-wrapper"` to record the ref
  - Supports `--dry-run` to show intended actions without making changes

Non-goals (initial)

- Do not push branches or create PRs automatically
- Do not automatically complete or close beads
- Do not perform interactive OpenCode interviews by default; launching OpenCode (if supported) must be explicit and interactive

Idempotence and safety details

- If branch already exists locally: command checks it points at expected commit (if determinable) and reuses it; do not recreate
- If bead already claimed by same actor: do not re-comment repeatedly; optionally update comment timestamp or leave a single marker comment
- If bead is claimed by a different actor: abort and explain options (request transfer via bd, or user can force with explicit flag)

Risks & assumptions

- Assumes `bd` CLI is available and the user has permission to update beads
- Assumes branch naming convention is acceptable to teams; we may need to tune `short-desc` sanitation rules for edge cases
- Idempotent commenting may require reading existing bead comments which could be slow; keep minimal interactions

Related beads / history

- wf-70j.2.1 — waif intake command (related; do NOT subsume — keep as separate child/related item)
- wf-ba2.3.6 — Wire waif prd command to PRD Agent workflow
- wf-mj5 — Docs: Resolve TBDs in docs/dev/CLI_PRD.md

Open questions

1) Branch push behaviour: default is local-only. Do we include a `--push` flag in v1? (RECOMMEND: defer; add `--push` later)
2) Alias support: include `wf` alias in v1 or defer? (RECOMMEND: defer)
3) Exact external-ref format: we propose `branch:<branch-name>`; accept or change?

Next actions (for intake completion)

1. Review this draft and approve or provide edits
2. Run conservative five-stage review: Completeness, Capture fidelity, Related-work & traceability, Risks & assumptions, Polish & handoff. (I will run these reviews and make small conservative edits where helpful.)
3. When approved, create a new beads epic (P1) using this draft as the body; label `Status: Intake Completed` and assignee `Build`
4. Update `docs/dev/CLI_PRD.md` with a short section linking to the bead and describing the initial command
5. Implement CLI command in `src/commands` referencing `src/lib/bd.ts` helpers; add tests under `tests/`

Draft authoring notes

- Created by OpenCode agent in session; intended to be conservative and focused for rapid delivery
- File path: `.opencode/tmp/intake-draft-Producer_convenience_CLI_wrappers.md`

-- End of draft
