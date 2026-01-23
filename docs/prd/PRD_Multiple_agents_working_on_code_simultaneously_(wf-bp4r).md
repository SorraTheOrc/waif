# Product Requirements Document

## Introduction

### One-liner

Define a repeatable, low-friction workflow for multiple agents to work in parallel on a shared epic/feature by owning separate work items, coordinated via an integration branch + integration PR, with clear ownership and minimal merge/CI churn.

### Problem statement

When 2+ agents work concurrently toward the same epic/feature, teams often hit avoidable merge conflicts, duplicated effort, unclear ownership, and CI failures from drift. This PRD defines a happy path that supports parallelism while keeping integration safe, reviewable, and auditable.

Context (WAIF): WAIF uses Beads ("bd") for work tracking. The pilot assumption is that agents may push branches and open PRs, while merges remain controlled by a designated integration owner and protected-branch rules.

### Goals

* Enable safe parallel agent work across multiple work items under a shared epic/feature without excessive coordination overhead.
* Provide a repeatable way to identify and slice work that is safe to run in parallel (low likelihood of merge conflicts).
* Reduce merge friction: fewer conflicts and less time spent resolving them.
* Reduce CI churn caused by integration drift (rebases/merges triggering failures).
* Make ownership and current state reconstructable from the work tracker + PRs (who is doing what, where, and why).

### Non-goals

* Changing repository governance (branch protections, release policy, merge permissions) as part of this PRD.
* Standardizing a single workflow for all repos/teams; this PRD targets WAIF internal teams first.
* Replacing the existing "one work item -> one topic branch" convention; this PRD only adds a parallelization pattern.

Note: This PRD assumes "parallel work" is achieved by decomposing an epic/feature into multiple work items and running those work items in parallel, not by having multiple agents committing simultaneously to the same work item.

## Users

### Primary users

* WAIF internal contributors coordinating multiple agents across work items for one epic/feature.

### Secondary users (optional)

* Reviewers and maintainers who need a clear integration story and minimal PR noise.
* CI/release owners who want mainline stability and fewer failed runs.

### Key user journeys

* Parallel implementation: multiple agents work in parallel on separate work items that roll up to a shared epic/feature, delivering isolated PRs.
* Integration and landing: a single integration owner maintains an integration branch + integration PR, resolves conflicts once, and lands changes safely.
* Handoff: ownership can change mid-stream with enough recorded context to resume work quickly.

## Requirements

### Functional requirements (MVP)

* Define a default happy path for parallel work using an integration branch + stacked PRs:
  * There is one integration branch for the epic/feature (owned by an integration owner).
  * Each work item is worked by at most one agent at a time, on its own short-lived branch.
  * Each work item PR targets the integration branch (not main) to preserve review isolation and minimize conflicts.
  * One integration PR targets main and is the only PR merged to main for the epic/feature.
* Define integration owner responsibilities and selection:
  * Default integration owner is the epic/feature assignee.
  * Integration owner is responsible for integration order, conflict resolution, and landing the integration PR.
  * Integration owner keeps the integration branch and integration PR green (or explicitly marks them blocked).
* Define a process for identifying parallelizable work with low conflict risk:
  * Require an explicit slicing decision (by integration owner) before assigning work items in parallel.
  * Use a short checklist to label work as low/medium/high conflict risk.
  * If risk is high or unclear, prefer sequential execution until interfaces stabilize.
  * Record the risk label and slice plan in the epic/feature work item (or equivalent parent record).
* Define a sequential agent pipeline per work item via assignee changes:
  * Assignee changes reflect who may work next (e.g., Patch -> Probe -> Scribbler -> Ship).
  * Only the current assignee (or delegated actor) works on that work item.
* Define required work tracker hygiene:
  * Each agent records involvement, branch name(s), and PR link(s) in the work item.
  * Hard handoffs use a standard handoff note template.
* Define branch and PR conventions:
  * Branch names include the work item id (and the epic/feature id when applicable).
  * Work item PR titles include the work item id; the integration PR title includes the epic/feature id.
  * PR body includes a short scope statement and what slice the agent owns.
* Define safe integration rules that minimize churn:
  * Avoid rewriting public history on shared branches.
  * Prefer integration-owner managed integration to avoid duplicate rebases across multiple branches.

#### Example Git workflow (illustrative)

```bash
# Create or update integration branch for the epic/feature
git fetch origin
git checkout -b wf-EPICID/integration origin/main

# For each work item that will run in parallel, create a branch from the integration branch
git checkout -b wf-WORKID/patch wf-EPICID/integration

# Work + commit
git status
git add -A
git commit -m "wf-WORKID: implement slice"

# Push and open a PR whose base is the integration branch
git push -u origin wf-WORKID/patch

# Integration owner keeps integration branch up to date
git checkout wf-EPICID/integration
git pull --rebase origin wf-EPICID/integration

# Integration owner merges work item PRs into the integration branch in the agreed order
# (via the PR UI or merge commits locally per repo policy)

# Finally: open the integration PR to main from wf-EPICID/integration
```

#### Parallelization checklist (low/medium/high conflict risk)

* Low: changes touch disjoint directories/modules; no shared hot files; no API/schema surface changes; tests are isolated.
* Medium: shared API surface or shared files likely, but changes can be sequenced (interface-first PR) and reviewed independently.
* High: multiple slices need to edit the same files or the same behavioral surface at the same time; prefer sequential work or an explicit interface-first stabilization step.

#### Notes on approach selection (pros/cons)

* Integration PR + stacked PRs (default)
  * Pros: clear single landing point; review isolation per slice; conflicts handled once (by integration owner); agents can work in parallel without touching the same branch.
  * Cons: more PRs to manage; requires explicit landing order; integration branch must be kept healthy.
* Topic branch + agent sub-branches (alternative)
  * Pros: fewer PRs; straightforward when slices are tightly coupled; familiar to many Git users.
  * Cons: conflicts can happen multiple times (sub-branches into topic branch and topic into mainline); review scope can blur; easier to accidentally share history.
* "Same branch in multiple worktrees" (discouraged)
  * Pros: simplest mental model.
  * Cons: highest collision risk; poor auditability; tends to increase conflict frequency.

### Non-functional requirements

* Auditability: a third party can reconstruct current state (owners, branches, PRs, blockers) without synchronous meetings.
* Predictability: clear defaults; exceptions must be recorded.
* Low overhead: the workflow should add minimal extra steps beyond "branch + PR + record in tracker".
* Safety: avoid destructive operations unless explicitly delegated.

### Integrations

* Work tracking system (issue/task tracker) for ownership, handoffs, and links to PRs.
* Version control (Git or equivalent) supporting multiple branches.
* Code review system (PRs) supporting cross-referencing and ordered landing.
* CI system with required checks to prevent landing broken changes.
* OpenCode (explicit): agents are expected to do most implementation and integration work via OpenCode-guided commands and constraints; the workflow must work when an integration owner is an agent.

Reference guidance (WAIF)

* `docs/dev/git_workflow.md`
* `docs/.github/permissions_matrix.md`
* `docs/.github/branch_protection.md`
* `docs/.github/handoff_note_template.md`

OpenCode integration requirements

* Agents must be able to:
  * create and push branches
  * open PRs targeting the integration branch
  * (integration owner) open and maintain the integration PR targeting main
* The integration owner agent must keep a high-signal paper trail:
  * post landing order
  * record rebases/merges performed
  * record any conflict resolution notes

### Security & privacy

Security note: Prefer least-privilege publishing for agents. If agents can push and open PRs, merges remain controlled by a designated integration owner and protected-branch rules.

Security note: Treat the integration branch as sensitive shared state; avoid force-pushes and document any exceptional history rewrites explicitly.

Security note: Document prohibited operations for agents by default (force-push, rewriting shared history, merging to protected branches) unless explicitly delegated.

Privacy note: Tracker notes and PR bodies must avoid secrets (tokens, credentials) and avoid pasting large diffs or sensitive logs.

Privacy note: Avoid pasting CI logs verbatim into tracker comments; link to runs instead.

## Release & Operations

### Rollout plan

* Publish this PRD and a short "how to run the workflow" doc referencing existing repo workflow guidance.
* Pilot on 1-2 real work items that require parallel agent effort.
* Capture pilot metrics in the work tracker and summarize learnings.

### Quality gates / definition of done

* PRD approved by stakeholders and stored in the repo.
* Pilot completed with at least:
  * 2+ work items worked in parallel by agents, each with its own PR targeting an integration branch.
  * An integration PR targeting main, owned and maintained by the integration owner.
  * Integration owner landing order + conflict resolutions documented.
* Metrics captured for the pilot:
  * Merge conflicts (count and time-to-resolve).
  * CI churn attributable to integration drift (reruns and failures).

### Risks & mitigations

* Risk: PR management overhead (too many small PRs).
  * Mitigation: require scope labeling (slice ownership) and keep stacks shallow (2-3 PRs per epic/feature in the pilot).
* Risk: Unclear integration order causes rework.
  * Mitigation: integration owner posts/updates an explicit "landing order" note in the work tracker.
* Risk: Agents accidentally perform destructive Git operations.
  * Mitigation: document default prohibitions; require explicit delegation for exceptions; rely on protected-branch rules.
* Risk: Parallel slices still touch the same files and conflict.
  * Mitigation: require a parallelization checklist (module boundaries, file ownership, interface-first changes) and downgrade to sequential execution when unclear.

## Open Questions

1. Should the workflow require a specific stacking mechanism (tooling feature) or stay tooling-agnostic and describe the behavior only?
2. What is the minimum required content for the tracker comment when an agent starts work (branch, slice, intended PR title)?
3. Should we add automation to validate PR title format and required metadata for parallel-work PRs, or keep this manual for the pilot?
4. Who is allowed to change assignees to move a work item through the Patch -> Probe -> Scribbler -> Ship pipeline (integration owner only, or anyone with a rule)?
