# Product Requirements Document

## Introduction

### One-liner

Add a `waif` CLI command that delegates a `stage:plan_defined` Beads issue subtree to GitHub Copilot by creating a single GitHub Issue that contains all work needed and then marking the Beads subtree as in-progress with traceability.

### Problem statement

Producers need a repeatable, auditable way to hand off well-defined Beads work to GitHub Copilot without manual translation to GitHub Issues and without losing traceability between Beads and GitHub work items.

### Goals

- Provide a safe, idempotent `waif delegate <bead-id>` command that: validates eligibility, creates exactly one GitHub Issue containing all required work, assigns the issue to `copilot`, and updates the entire Beads subtree with a shared external reference and in-progress status.
- Preserve traceability: all beads in the delegated subtree must record the same external-ref (the GitHub Issue URL) and a concise bead comment noting delegation.
- Fail fast and with no side effects for ineligible beads (not open or missing `stage:plan_defined`).

### Non-goals

- Do not implement automatic pushing, automatic PR merges, or automatic human review flows. The command only creates the GitHub Issue and updates Beads metadata.
- Do not assume a specific implementation language, hosting, or CI process — design is stack-agnostic.

## Users

### Primary users

- Producers / Product managers who prepare plan-defined Beads and want to delegate execution to GitHub Copilot while preserving bead traceability and auditability.

### Secondary users (optional)

- Engineers who review Copilot-generated PRs and maintainers or automation that reports on delegation outcomes.

### Key user journeys

- Delegate (happy path): Producer runs `waif delegate wf-v5ox` on a bead in `status: open` and labeled `stage:plan_defined`. The CLI validates eligibility, gathers the full subtree (parent + descendants + necessary blockers), creates a single GitHub Issue in the repo pointed to by `origin`, assigns it to `copilot`, writes the issue URL into each bead's `external_ref`, adds a short bead comment, and marks each bead `in_progress`.
- Re-run (idempotence): Producer re-runs the command for a bead already delegated. The CLI detects the existing external-ref and reuses it (no duplicate GitHub Issue); it may idempotently add missing labels or comments.
- Abort on ineligible bead: If the bead is not `status: open` or lacks `stage:plan_defined`, the command exits with a clear error and no side effects.

## Requirements

### Functional requirements (MVP)

- Validate bead eligibility: command must verify bead status is `open` and that bead labels include `stage:plan_defined` (case-insensitive). Abort safely otherwise.
- Gather the full subtree for a bead id: parent plus all descendants (children, grandchildren, etc.) and optionally blockers required to implement the work (see Open Questions for blocker policy).
- Create exactly one GitHub Issue in the repository given by `git remote get-url origin` (prefer `gh` for creation when available). The issue body must be self-contained and actionable: include parent summary, roll-up of all descendant work (ids, titles, acceptance criteria where present), any referenced repo files, and a Beads references section listing all included bead ids. The issue should be assignable to `copilot`.
- On successful issue creation, update every bead in the collected subtree with:
  - `bd update <id> --status in_progress`
  - `bd update <id> --add-label "status:in_progress"`
  - `bd update <id> --external-ref "<issueUrl>"` (same issueUrl value for all)
  - `bd comments add <id> "Delegated to GitHub: <issueUrl>"` (idempotent — do not duplicate comments)
- Idempotence: if a bead already has an external-ref that appears to be a GitHub Issue URL, the command must reuse that URL and avoid creating a duplicate GitHub Issue. Re-applying missing labels/comments is allowed if done idempotently.

### Non-functional requirements

- Reliability: no partial state changes — if GitHub Issue creation fails, no bead mutations are applied.
- Observability: CLI prints concise progress logs and returns structured `--json` output when requested containing the created/found issue URL and list of updated bead ids.
- Usability: provide `--dry-run` to preview actions (issue body preview, bead updates) without mutating remote services.
- Accessibility: ASCII-safe terminal output; messages suitable for programmatic parsing.

### Integrations

- Beads CLI (`bd`) — all bead operations must use `bd` (no direct edits to `.beads/issues.jsonl`).
- Git/Git remote `origin` — used to derive the target GitHub repository.
- GitHub CLI (`gh`) or GitHub API — preferred for creating/searching issues; fallback to direct API calls if `gh` is not available.

### Security & privacy

Security note: The command must avoid leaking secrets into issue bodies, bead comments, or CLI logs. Do not include sensitive environment variables or large diffs in the generated GitHub Issue body.

Privacy note: Bead comments and external-refs must not contain secrets or large code dumps. If repository files are referenced, link to paths rather than pasting full file contents.

## Release & Operations

### Rollout plan

1) Implement command with `--dry-run` and unit tests for eligibility checks, subtree gathering, idempotence, and external-ref reuse. 2) Beta rollout to a small set of producers. 3) Collect telemetry and iterate on issue body format and blocker policy.

### Quality gates / definition of done

- Unit tests covering eligibility checks, subtree traversal, and idempotence behavior.
- Integration test that simulates GitHub Issue creation (use `gh` stub or GitHub test token) and verifies bead updates.
- CLI `--dry-run` outputs validated by reviewers and matches the final issue body when run without `--dry-run`.

### Risks & mitigations

- Risk: Creating an incomplete or ambiguous GitHub Issue that Copilot cannot act on. Mitigation: require the issue body to include all parent and descendant work items, referenced files, and a clear checklist; make this template configurable.
- Risk: Duplicate GitHub Issues on re-run. Mitigation: prefer existing `external_ref` on beads for idempotence and add a unique marker inside created issues to make searches reliable.
- Risk: Accidental leakage of secrets when including repo file references. Mitigation: only link to files/paths; never embed secrets or large diffs.

## Open Questions

1. Blocker inclusion policy: Should the subtree automatically include blocking dependencies (type `blocks`) or should the command only include parent + descendants and leave blockers out unless explicitly requested? (Default: leave blockers out; recommend opt-in flag `--include-blockers`.)
2. Exact issue body template: The user requires the issue to be self-contained and include everything Copilot needs to complete the work (parent + children + blockers where requested). Should the issue also include a unique searchable marker (recommended) and suggested labels? (Recommended: include marker `beads-delegation:<bead-id>` and suggested labels.)
3. External-ref format: Use the full GitHub Issue URL in `external_ref` for traceability (answered: yes). Confirm preferred bead comment phrasing (suggested: `Delegated to GitHub: <issueUrl>`).
4. Actor identity: Which BD_ACTOR should be used for bead updates/comments when automation runs? (Default: use current environment/Bd actor; make `--actor` override available.)

---

Seed Context

- Beads issue: `wf-v5ox` — "Feature: Delegate stage:plan_defined beads to GitHub Copilot" (intake exists in beads; selected fields used as authoritative intent).
- From the bead: command must fail-fast for ineligible beads, gather full subtree, create exactly one GitHub Issue assigned to `copilot`, and update beads with `in_progress`, labels, `external_ref`, and a delegation comment.
- User answers (interview): Issue body must be complete and self-contained so Copilot can act without reading beads; idempotence should reuse existing `external_ref`; and the operational success metric is "merged with no human edits" (copilot may edit in response to human review) with no time limit.
