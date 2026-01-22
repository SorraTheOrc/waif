# Product Requirements Document

## Introduction

### One-liner

Create a `waif delegate <bead-id>` command that delegates a `stage:plan_defined` Beads issue subtree to GitHub Copilot by creating one self-contained GitHub Issue, assigning it to `copilot`, and updating the Beads subtree with traceable external refs and in-progress status.

### Problem statement

Producers need a repeatable, auditable way to hand off well-defined Beads work to GitHub Copilot without manual translation into GitHub Issues and without losing traceability between Beads and GitHub work items. Manual handoffs are error-prone and slow.

### Goals

- Fail fast and produce no side effects for ineligible beads (not `status=open` or missing `stage:plan_defined`).
- Create exactly one GitHub Issue per delegation and ensure idempotence for repeated runs (prefer existing `external_ref`).
- Record the same `external_ref` on every bead in the delegated scope and add a single bead comment linking to the GitHub Issue.
- Update the bead subtree (parent + descendants + required blockers) to `in_progress` and apply appropriate labels.
- Provide a clear, machine-parseable GitHub Issue body synthesized by OpenCode that contains a roll-up of descendant beads and acceptance criteria where present.
- Operational success: Copilot-authored PR merged with no human edits in ≥95% of delegations (measurement details to be finalized).

### Non-goals

- Do not push branches or merge PRs automatically on behalf of humans in v1.
- Do not directly edit `.beads/issues.jsonl`; all mutations use the `bd` CLI.

## Users

### Primary users

- Producer / Product Manager: wants a low-effort way to hand off plan-defined work to Copilot and maintain traceability.

### Secondary users (optional)

- Engineers: review and validate Copilot output; may convert the GitHub Issue into implementation tasks if needed.
- Automation / Observability: systems that will track delegation and success metrics.

### Key user journeys

- Delegate a bead subtree:
  - Producer runs `waif delegate <bead-id>`.
  - CLI validates eligibility and gathers the full subtree (parent + descendants + all blocking dependencies of type `blocks`). Blockers are mandatory and included by default.
  - CLI presents a `--dry-run` preview showing the synthesized GitHub Issue body and list of beads to be updated.
  - On confirmation (`--yes`), CLI creates or reuses a GitHub Issue, assigns it to `copilot`, updates each bead with `external_ref`, adds a bead comment `Delegated to GitHub: <issueUrl>`, and sets status/labels to `in_progress`.
  - CLI prints a concise audit trail and emits structured `--json` output when requested.

- Copilot implements the work:
  - Copilot reads the GitHub Issue, opens PR(s), and requests reviews as needed.
  - Successful implementation measured as a Copilot-authored PR merged with no human edits (per agreed verification).

## Requirements

### Functional requirements (MVP)

- CLI command `waif delegate <bead-id>` with `--dry-run` and `--yes` flags.
- Validate bead `X`: require `X.status == open` and a label including `stage:plan_defined` (case-insensitive). Fail with a clear, no-side-effects error otherwise.
- Gather full subtree: `X` plus all descendants (recursive) and include blocking dependencies (type `blocks`) required to implement the work — blockers are mandatory.
- Create exactly one GitHub Issue in the repository given by `git remote get-url origin`:
  - Use OpenCode to synthesize a rich, self-contained issue body: parent summary, roll-up of descendant beads (ids, titles, acceptance criteria where present), referenced repo file paths, suggested labels, an implementation checklist for Copilot, and a unique marker `beads-delegation:<bead-id>` for discovery.
  - Assign the issue to GitHub user `copilot` (v1 hard-coded).
  - Ensure the issue is actionable without requiring the Copilot agent to read beads.
- Idempotence:
  - If any bead in the parent subtree already has an `external_ref` that looks like a GitHub Issue URL, reuse that Issue and do not create a duplicate.
  - Otherwise create a new Issue and store its URL in `external_ref` for every bead in the collected scope.
  - Avoid duplicate comments/labels when re-running.
- After successful (or reused) Issue creation, update beads for `X`, descendants, and included blockers:
  - `bd update <id> --status in_progress`
  - `bd update <id> --add-label "stage:in_progress"` (or org-preferred label)
  - `bd update <id> --external-ref "<issueUrl>"` (same value for all)
  - `bd comments add <id> "Delegated to GitHub: <issueUrl>"` (idempotent — only once per bead)

### Non-functional requirements

- Reliability: no partial state changes — if GitHub Issue creation or OpenCode synthesis fails, do not mutate beads.
- Observability: CLI prints concise progress logs and supports `--json` output including the issue URL and list of updated bead ids.
- Usability: `--dry-run` shows the exact synthesized issue body and the exact bead updates that would be applied.
- Performance: local validation and synthesis for typical subtrees (up to ~200 beads) should complete quickly; network calls may be retried.

### Integrations

- Beads CLI (`bd`) for all bead reads/updates and comments.
- Git (`git remote get-url origin`) to determine the target repository.
- GitHub (`gh` CLI) or GitHub API to create/search Issues (prefer `gh` when available).
- OpenCode to synthesize and format the GitHub Issue body from bead content so the resulting issue is self-contained and actionable for Copilot.

### Security & privacy

Security note: The command must avoid leaking secrets into issue bodies, bead comments, or CLI logs. Do not include sensitive environment variables or large diffs in the generated GitHub Issue body.

Privacy note: Bead comments and external-refs must not contain secrets or large code dumps. If repository files are referenced, link to paths rather than pasting full file contents.

Security note: When using OpenCode to synthesize the GitHub Issue body, validate and sanitize the generated text to ensure it does not embed secrets, sensitive data, or unintended large code snippets. Prefer referencing file paths and small, vetted snippets only when necessary and safe.

## Release & Operations

### Rollout plan

1) Implement command with `--dry-run` and unit tests for eligibility checks, subtree gathering, idempotence, and external-ref reuse. 2) Beta rollout to a small set of producers (internal canary). 3) Broader internal rollout and telemetry collection; iterate on issue body format and blocker inclusion behavior.

### Quality gates / definition of done

- Unit and integration tests covering eligibility checks, subtree traversal, idempotence, and bead updates.
- End-to-end manual validation: delegate a sample bead subtree and verify created Issue contents, Copilot PR flow, and final metric calculation.
- CLI `--dry-run` preview must match actual issue body when run without `--dry-run`.

### Risks & mitigations

- Risk: creating incomplete or ambiguous GitHub Issues that Copilot cannot implement. Mitigation: require OpenCode-synthesized, self-contained issue bodies with a checklist; require producer verification via `--dry-run` before applying.
- Risk: duplicate or orphaned GitHub Issues. Mitigation: prefer `external_ref` reuse; add unique marker; provide clear remediation steps and logs.
- Risk: publishing internal plans to public repositories. Mitigation: warn on public remotes and require explicit confirmation (`--yes`) to proceed.

## Open Questions

1. Confirm any edge-cases where certain blockers should be excluded despite the default (blockers are mandatory by default).
2. Finalize the GitHub Issue body section ordering and exact fields (per-bead acceptance criteria subsection recommended).
3. Metrics: how to attribute authorship and prove "no human edits" for the 95% success metric across diverse workflows.
4. Actor identity: default `BD_ACTOR` to use for bead updates; provide `--actor` override.

---

Seed Context

- Beads issue: `wf-v5ox` — "Feature: Delegate stage:plan_defined beads to GitHub Copilot" (intake used as authoritative initial intent).
- From the bead: command must fail-fast for ineligible beads, gather parent+descendants+blockers, create exactly one GitHub Issue assigned to `copilot`, and update beads with `in_progress`, labels, `external_ref`, and a delegation comment.
- Interview answers: the GitHub Issue must be self-contained (Copilot should not need beads), idempotence should reuse existing `external_ref`, and the operational success metric is "Copilot-authored PR merged with no human edits" (no time limit).
