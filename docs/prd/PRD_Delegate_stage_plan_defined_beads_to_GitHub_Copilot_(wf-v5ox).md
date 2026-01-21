Seed Context

- Bead id: `wf-v5ox`
- Title: Feature: Delegate stage:plan_defined beads to GitHub Copilot
- Current bead status: `in_progress`
- Short description: add a `waif` CLI command that delegates a `stage:plan_defined` Beads issue subtree to GitHub Copilot by creating a GitHub Issue in the repo's `origin` remote, assigning it to `copilot`, and updating the Beads subtree to `in_progress` with traceability via `bd update --external-ref`.
- Selected options from intake: GitHub Issue template = `Rich`; Idempotence detection = `both` (prefer `external_ref`, fallback to searching GitHub); Success metric = `PR merged with no human edits`.

# Product Requirements Document

## Introduction

### One-liner

Create a `waif` CLI command that delegates a `stage:plan_defined` Beads issue subtree to GitHub Copilot by creating a single GitHub Issue, assigning it to `copilot`, and updating the Beads subtree with traceable external refs and status transitions.

### Problem statement

Producers need a repeatable, auditable way to hand off well-defined Beads work to GitHub Copilot without manual translation to GitHub Issues and without losing traceability between Beads and GitHub work items. Manual handoffs are error-prone and slow.

### Goals

- Fail fast and produce no side effects for ineligible beads (not `status=open` or missing `stage:plan_defined`).
- Create exactly one GitHub Issue per delegation and ensure idempotence for repeated runs.
- Record an `external_ref` on each bead and add a single bead comment linking to the GitHub Issue.
- Update the bead subtree (parent + descendants) to `in_progress` and add a `status:in_progress` label.
- Provide clear, machine-parseable GitHub Issue content (selected: `Rich` template) that includes a roll-up of descendant beads and acceptance criteria where present.
- Measure operational success as: Copilot-authored PR merged with no human edits in ≥95% of delegations (measurement details to be finalized).

 - Update the bead subtree (parent + descendants) to `in_progress` and add a `stage:in_progress` label.
 - Provide clear, machine-parseable GitHub Issue content (selected: `Rich` template) that includes a roll-up of descendant beads and acceptance criteria where present.
 - Measure operational success as Copilot-authored PR merged with no human edits in ≥95% of delegations. Measurement details TBD.

### Non-goals

- Do not implement automatic branch pushes or PR merges on behalf of humans in the first release.
- Do not modify `.beads/issues.jsonl` directly; all mutations use the `bd` CLI.
- Assume `gh` is present in the environment for GitHub operations; do not document an API fallback in v1.

## Users

### Primary users

- Producer / Product Manager: wants a low-effort way to hand off plan-defined work to Copilot and maintain traceability.

### Secondary users (optional)

- Engineers: review and validate Copilot output; may convert the GitHub Issue into implementation tasks if needed.
- Automation / Observability: consumers that will track delegation and success metrics.

### Key user journeys

- Delegate a bead subtree:
  - Producer runs `waif delegate <bead-id>`.
  - CLI validates eligibility, gathers the subtree, and presents a dry-run summary (if `--dry-run`).
  - On confirmation, CLI creates or reuses a GitHub Issue, assigns it to `copilot`, posts the Issue URL back to each bead via `bd update --external-ref`, adds a bead comment `Delegated to GitHub: <issueUrl>`, and sets status/labels to `in_progress`.
  - CLI prints a concise audit trail of actions taken.

- Copilot implements the work:
  - Copilot (external actor) reads the GitHub Issue, opens PR(s), and requests reviews as needed.
  - Successful implementation measured as a Copilot-authored PR merged with no human edits (per agreed verification step).

## Requirements

### Functional requirements (MVP)

- CLI command `waif delegate <bead-id>` with `--dry-run` and `--yes` flags.
- Validate input bead `X`:
  - `X.status == open` and label includes `stage:plan_defined` (case-insensitive). Fail with a helpful error otherwise.
- Gather full subtree: `X` plus all descendants (recursive).
- Create exactly one GitHub Issue in the repo determined by `git remote get-url origin`:
  - Use the `Rich` template: summary, roll-up of descendant beads with ids/titles/acceptance criteria, 'Beads references' section listing bead ids, and an implementation checklist for Copilot.
  - Assign the issue to GitHub user `copilot` (hard-coded in v1 per intake).
  - Apply minimal labels: `delegated`, `stage:in_progress` (configurable later).
- Idempotence:
  - If the parent bead has an `external_ref` that looks like a GitHub Issue URL, reuse that Issue; otherwise create a new Issue.
  - If no `external_ref`, and if configured, search GitHub issues for a unique marker (e.g., `Beads: <bead-id>`) and reuse a matching issue.
  - Do not duplicate comments, labels, or external refs when re-running.
- After successful (or reused) Issue creation, update beads for `X` and all descendants:
  - `bd update <id> --status in_progress`
  - `bd update <id> --add-label "stage:in_progress"`
  - `bd update <id> --external-ref "<issueUrl>"` (same value for all items)
  - `bd comments add <id> "Delegated to GitHub: <issueUrl>"` (add only once per bead)

### Non-functional requirements

- Performance: delegation of a subtree up to 200 beads should complete in under 10s for local validation steps; network calls are separate.
- Reliability: ensure retries for transient GitHub/API failures and idempotent operations.
- Scalability: support subtrees of varying sizes; protect against extremely large subtrees (warn or require a force flag).
- Accessibility: all CLI outputs should be ASCII-safe and machine-parseable when `--json` is provided.

### Integrations

- Beads CLI (`bd`) for all bead reads/updates and comments.
- Git (`git remote get-url origin`) to determine target repo.
- GitHub (`gh` CLI) to create/read/update Issues and to search for markers.

### Security & privacy

Security note: storing GitHub Issue URLs in `external_ref` is informational; ensure the `external_ref` value does not leak secrets. Operations that modify beads must respect the actor identity (`BD_ACTOR`) and fail if the actor lacks permission to update beads.

Privacy note: Issue bodies may contain acceptance criteria or internal details; verify that producers consent to publishing bead content to the target GitHub repo before delegation.

Security note: verify the target remote and warn on public repositories or insufficient permissions before publishing bead content.

Privacy note: producers must confirm no PII or secrets are included in bead content; redact or obtain consent as needed.

## Release & Operations

### Rollout plan

1. Internal canary: release to a small set of producers and run 50 delegations to validate idempotence and telemetry.
2. Broader internal rollout: enable for all producers in the organization.
3. Public release (if applicable): document behavior and safe defaults; enable by opt-in.

### Quality gates / definition of done

- Unit and integration tests covering:
  - Eligibility checks and error cases.
  - Subtree collection correctness.
  - Idempotence: repeated runs do not create duplicate Issues or comments.
  - Beads updates: status, labels, external_ref, and comment behavior.
- End-to-end (manual) test: delegate a sample bead subtree, verify created Issue contents, Copilot PR flow, and final metric calculation.
- Linting and `remark` formatting applied to PRD and any user-facing docs.

### Tracking bead

Track detailed operational acceptance and metric collection in a follow-on bead created for this purpose. Created bead: `wf-ybsh` — "Track: delegation completion (wf-v5ox)". Suggested fields:

- Description: "Capture end-to-end acceptance: verify idempotence on re-run, confirm GitHub Issue content matches bead roll-up, and collect Copilot success metric (PR merged with no human edits)." 
- Acceptance criteria:
  - Confirm `external_ref` applied to all subtree beads.
  - Run re-delegation to validate idempotence (no duplicate Issue or comments).
  - Record first 50 delegations and compute initial Copilot success rate.
  - Provide remediation steps for failed delegations.


### Risks & mitigations

- Risk: accidental exposure of internal plan text to a public GitHub repo.
  - Mitigation: require an explicit confirmation prompt unless `--yes` is provided; detect likely public remotes and warn.
- Risk: creating duplicate or orphaned GitHub Issues if idempotence fails.
  - Mitigation: prefer `external_ref` for detection and perform a safe GitHub search fallback; log actions and provide clear remediation steps.
- Risk: incorrect bead status transitions.
  - Mitigation: perform dry-run and add a `--dry-run` default for unfamiliar users; require `--yes` to apply changes.

## Open Questions

- Exact GitHub Issue body template: intake selected `Rich` template; confirm final section ordering and required fields (e.g., should we include a per-bead acceptance criteria subsection?).
- Measurement details for the 95% Copilot success metric: how to attribute authorship and prove "no human edits" reliably across workflows.
- Labels and milestone conventions: which labels should be applied to delegated issues by default in this org?
- Should `waif delegate` support an explicit `--assignee` flag in future releases (intake currently hard-codes `copilot`)?
