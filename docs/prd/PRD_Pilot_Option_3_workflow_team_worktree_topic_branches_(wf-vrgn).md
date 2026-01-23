# Product Requirements Document

## Introduction

### One-liner

Pilot and validate an Option 3 Git workflow: one long-lived team worktree (`core`) + short-lived per-issue topic branches + optional agent sub-branches for parallelism.

### Problem statement

Current workflow guidance tends to map one Beads issue to one team branch. This does not fit persistent teams that execute many issues over time. Teams need a repeatable flow that supports frequent, small PRs without per-issue team branches or worktree conflicts, while keeping ownership, handoffs, and traceability explicit.

### Goals

* Validate the Option 3 workflow end-to-end using real Beads issues.
* Reduce merge friction versus long-lived team branches (fewer conflicts, faster resolution).
* Improve clarity for new contributors/agents: branch/worktree state is understandable from Beads + PR alone.
* Produce concrete artifacts (PRs, handoff note, summary) that can be used to refine docs.

### Non-goals

* Changing release policy, repository permissions, or branch protection settings.
* Introducing new infrastructure, secrets, or CI/CD systems.
* Replacing Beads as the source of truth for work tracking.

## Users

### Primary users

* Persistent teams (e.g., `core`) that deliver many Beads issues over time.

### Secondary users (optional)

* Agents working in parallel on the same Beads issue.
* Producers/reviewers who need traceability, small PRs, and predictable handoffs.

### Key user journeys

* Create team worktree once, then repeatedly create per-issue topic branches from an up-to-date base.
* Run 1-2 issues through the new flow and ship via PRs.
* When parallel work is needed, create sub-branches and merge back into the topic branch under an explicit merge owner.
* Record handoffs and commands run in Beads so the work can be resumed or reviewed without guessing.

## Requirements

### Functional requirements (MVP)

* Team worktree convention
  * Standardize a path convention: `../worktree_team_core` for the pilot team.
  * Standardize a creation command sequence (illustrative; may vary by environment): fetch base + add worktree from the base branch.
* Canonical per-issue topic branch
  * Use the canonical naming format `bd-<id>/<short-desc>`.
  * Require the Beads id to appear in the branch name and in the PR title.
  * Require checking for an existing matching branch (local and remote) before creating a new one.
* Parallel work pattern (optional but tested in this pilot)
  * If 2+ agents/people work simultaneously, use short-lived sub-branches off the canonical topic branch, e.g. `bd-<id>/patch`, `bd-<id>/docs`, `bd-<id>/ci`.
  * Designate a merge owner and record that delegation in Beads.
* Merge ownership (pilot-specific)
  * Default merge owner: the `ship` agent.
  * Record in Beads using a consistent delegation marker, e.g. `delegated-to:@ship (merge owner)`.
* Handoffs
  * Use the repo handoff note template and post at least one hard handoff note to the relevant Beads issue.
* Pilot deliverables
  * Create at least 2 PRs using the team worktree + topic branch flow.
  * Exercise at least one parallel sub-branch merge into a topic branch.
  * Post a summary comment on `wf-vrgn` with outcomes, gotchas, and recommended doc tweaks.

### Non-functional requirements

* Repeatability: steps are deterministic and can be followed by a new team member/agent.
* Low risk: avoid destructive git operations on shared branches (no force-push unless explicitly authorized).
* Traceability: Beads contains enough information to reconstruct what happened (branch names, commands run, files touched, handoffs).
* Minimal overhead: the workflow should not add significant ceremony for small PRs.

### Integrations

* Version control system supporting branches and worktrees (or an equivalent multiple-working-copy mechanism).
* Beads issue tracker (`bd`) for:
  * status updates
  * handoff notes
  * recording merge owner / delegation

### Security & privacy

* Security note: Do not introduce new secrets or credentials as part of the pilot; avoid logging sensitive paths or values in handoff notes.
* Security note: Prefer protected base branch policies (PR-based merges, no force-push) where available; pilot should operate within existing protections.
* Security note: Avoid force-pushing any shared branch unless explicitly authorized and recorded in Beads.
* Privacy note: Handoff notes should avoid including personal data; limit to technical context (commands run, paths, outcomes).

## Release & Operations

### Rollout plan

* Pilot team: `core`.
* Run the pilot on 1-2 real Beads issues, selected from: `wf-ndsh`, `wf-nqlf`, `wf-ty2z`.
* For each pilot issue:
  * create/reuse `bd-<id>/<short-desc>`
  * open PR(s) into the repo primary branch (the default integration branch)
  * merge via normal review process
* If the workflow causes confusion or blocks progress, rollback to the prior per-issue branch approach for that team and document why.

### Quality gates / definition of done

* Two PRs are created using the team worktree + topic branch flow.
* At least one parallel sub-branch is used and merged into the topic branch.
* At least one hard handoff note is posted using the repo template.
* `wf-vrgn` has a summary comment describing:
  * cycle time observations (rough)
  * merge/conflict friction notes
  * clarity/readability of branch/worktree state
  * recommended doc updates

### Risks & mitigations

* Risk: Confusion about “canonical branch” vs sub-branches.
  * Mitigation: Explicitly define canonical topic branch naming and require merge owner designation.
* Risk: Parallel work increases conflicts.
  * Mitigation: Use small, scoped sub-branches; merge frequently; keep PRs small.
* Risk: Worktree path conflicts across developers.
  * Mitigation: Standardize `../worktree_team_core` for this pilot and document expectations.

## Open Questions

* Which 1-2 issues (from `wf-ndsh`, `wf-nqlf`, `wf-ty2z`) should be prioritized first for the pilot?
* Should the docs recommend `bd-<id>/<short-desc>` only, or also support an optional `topic/` prefix for some teams?
