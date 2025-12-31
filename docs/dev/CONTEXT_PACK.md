# CONTEXT PACK

## Generated entries

### [docs/.github/branch_protection.md](./docs/.github/branch_protection.md)

```
Branch protection recommendations
The repository should enforce the following branch protection rules for main (and any other protected branches):
Required protections
1) Require pull request reviews before merging
   - Require at least 1 approving review before merge. Consider 2 approvers for high-risk or release branches.
2) Require status checks to pass before merging
   - Include CI checks: ci/test, ci/lint, ci/build (configure names to match your CI provider).
3) Block force pushes
   - Prevent accidental history rewrites on protected branches.
4) Restrict who can push to the branch
```

### [docs/.github/handoff_note_template.md](./docs/.github/handoff_note_template.md)

```
Handoff Note Template
This file is a visible copy of the canonical handoff template (also stored in history/). Use the template when performing handoffs between agents or humans. Copy it into the originating bd issue as a comment or note and update fields before posting.
---
Handoff: [brief one-line summary]
bd: bd-<id>
Branch: <beads_prefix>-<id>/<short-desc>  # canonical branch for the bd issue (e.g., bd-123/short-desc)
(If parallel branches used) Sub-branch: <beads_prefix>-<id>/<patch|docs|ci>
From: @<sender> (agent or person)
To: @<receiver> (agent or person)
Type: [soft|hard]
```

### [docs/.github/permissions_matrix.md](./docs/.github/permissions_matrix.md)

```
Permissions & enforcement matrix
Purpose
Provide an unambiguous mapping of agent/human roles to allowed Git operations, and the escalation path for exceptions.
Default rule
- Humans own publishing actions (push/merge/tag).
- Agents can prepare changes locally and must ask (or be explicitly delegated) for publishing actions.
- Branch protection on `main` is the enforcement mechanism; agent permissions are the operational guardrails.
Roles and allowed operations (typical)
Legend:
- allow: normal operation
```

### [docs/commands/ask.md](./docs/commands/ask.md)

```
# ask — docs and E2E guide
Short summary and motivation
- The `waif ask` command is a one-shot CLI to send a short prompt to a named agent and print the agent's Markdown response. It integrates lazily with a local OpenCode server: the CLI will check for a configured server, start one via the OpenCode SDK if needed, then forward the prompt to the requested agent. When the OpenCode SDK or server is unavailable, `waif ask` falls back to a safe, non-fatal placeholder response so interactive workflows aren't blocked.
## Usage examples
- Default behavior (uses default agent "map"):
```bash
waif ask "Summarize this file for me"
```
- Use a different agent (defaults also follow `OPENCODE_DEFAULT_AGENT` when set):
```bash
```

### [docs/db_compaction.md](./docs/db_compaction.md)

```
db_compaction.md
Purpose
This document describes the recommended runbook and CLI usage for performing Beads (bd) database compaction in this repository. It is derived from the upstream examples (examples/compaction) and the feature request tracked in bd issue wf-2ch.
Goals
- Provide safe, repeatable compaction workflows (interactive and automated).
- Offer tiered compaction modes and thresholds to avoid low-value runs.
- Default to non-destructive preview/dry-run behavior.
- Produce observable output (logs, stats, and exit codes) suitable for CI and cron use.
Command surface (recommended)
bd compact [run|preview|stats] [--tier N] [--threshold N] [--dry-run] [--yes|--commit] [--log-file <path>]
```

### [docs/dev/CLI_PRD.md](./docs/dev/CLI_PRD.md)

```
# PRD (Outline): Agentic PM CLI (Beads + OpenCode + Copilot) (see wf-ba2)
## 1) Summary
### 1.1 One-liner
A repo-first, agentic product management CLI for a single PM that uses Beads as the canonical issue graph and OpenCode (with GitHub Copilot) as the conversational AI interface.
### 1.2 Problem statement
Product work fragments across docs, chat, and code. The goal is a single, auditable workflow where:
* product intent becomes an executable Beads issue graph,
* planning stays dependency-aware,
* release artifacts (release notes, roadmap, changelog) are generated consistently in Markdown,
* and every change is reviewable via git.
```

### [docs/dev/context_pack_PRD.md](./docs/dev/context_pack_PRD.md)

```
# Product Requirements Document: Context Pack + `waif context` / `waif ctx`
## Changelog
- 2025-12-30: Merged content from docs/dev/prd-context.md (context selection & eligibility) into this canonical PRD to avoid duplication. See history/prd-context.md for the original draft.
## Introduction
- One-liner
  - Provide a single, agent-oriented “signpost” document (`docs/dev/CONTEXT_PACK.md`) that gives agents *minimum efficient* context to navigate the repository, plus a CLI command (`waif context` / `waif ctx`) that generates/updates it.
- Problem statement
  - Agents starting work on a new issue need fast, reliable orientation to the project’s structure, rules, and canonical docs.
  - Today that information is fragmented across the repo and is not optimized for agent consumption.
  - Without a stable context pack, agents spend time searching and risk missing critical guardrails.
```

### [docs/dev/git_workflow.md](./docs/dev/git_workflow.md)

```
Overview
This document defines recommended Git and branch practices for WAIF's multi-agent, multi-team workflow. The goals are to minimize merge friction, keep `main` releasable, and make coordination explicit and auditable.
TL;DR (default happy path)
1) Start from an up-to-date `main`.
2) Create a short-lived topic branch for a single beads issue. Branch names MUST use the beads prefix and id and follow the form `<beads_prefix>-<id>/<short-desc>` (for example `bd-123/fix-ask-prompt` or `wafi-73k/add-feature`).
3) Keep work small; re-sync frequently; avoid rewriting shared history.
4) Open a PR into `main` with the bd id in the title and use the PR template.
5) Record handoffs, commands run, and files touched in bd. When an agent works on a branch, it MUST record involvement in bd comments.
Scope and assumptions
- Teams are persistent (they deliver many bd issues over time).
```

### [docs/dev/idle_scheduler_module.md](./docs/dev/idle_scheduler_module.md)

```
# Idle Scheduler Drop-In Module (wf-6pe)
This document summarizes the implementation tracked in Beads issue `wf-6pe`.
## Overview
This drop-in Bash module executes a user-defined task whenever the terminal becomes idle. Idle detection is achieved by hooking into `PROMPT_COMMAND`, so the task only runs immediately before Bash renders a prompt (i.e., no foreground job is running).
Key properties:
- **Per-terminal isolation** — each shell session tracks its own schedule.
- **Randomized intervals** — after each execution, the next run occurs between 20 and 40 seconds (default; configurable).
- **User-overridable task** — define an `idle_task()` function before sourcing to customize the action.
- **Safe chaining** — existing `PROMPT_COMMAND` logic is preserved (arrays and strings supported).
- **Interactive-only** — exits early when not in an interactive shell.
```

### [docs/dev/integrations.md](./docs/dev/integrations.md)

```
# Tooling Integrations
WAIF is designed to be repo-first and to reuse best-in-class external tools rather than re-implementing them. This document describes the external tooling that WAIF integrates with during development and how to install, verify, and upgrade those tools.
The integrations described here are optional in the sense that WAIF can still run without them in limited modes, but the intended workflow assumes these CLIs are installed and available on your `PATH`.
## Beads
Beads (`bd`) is a git-friendly, dependency-aware issue tracker that stores issue state in-repo (typically under `.beads/`).
WAIF uses Beads as the canonical issue system of record.
- Repo (fork used by this project): https://github.com/SorraTheOrc/beads
- How WAIF uses it:
  - Shells out to `bd` for issue reads/updates (e.g., `bd show <id> --json`).
  - Prefers `bd update <id> --body-file -` to update issue bodies.
```

### [docs/dev/ooda_implementation_plan.md](./docs/dev/ooda_implementation_plan.md)

```
OODA Implementation Plan (short)
Overview
This document lists immediate implementation tasks to move the current event-driven OODA monitor from PoC to a stable v1 and into follow-up v2/v3 work.
Tasks
1) Plugin filters and noise control (priority: high)
   - Add an ignore-list for event types (e.g., `session.diff`) in `.opencode/plugin/waif-ooda.ts` or the opencode log helper configuration.
   - Add unit tests to ensure noisy events are not emitted to `.opencode/logs/events.jsonl`.
2) Snapshot persistence (priority: high)
   - Implement `--log <path>` in `src/commands/ooda.ts` to append canonical snapshot JSON objects to `history/ooda_snapshot_<ts>.jsonl`.
   - Ensure snapshots contain only sanitized fields: `time`, `agent`, `status`, `title`, `reason`.
```

### [docs/dev/opencode_integration_PRD.md](./docs/dev/opencode_integration_PRD.md)

```
Title: WAIF — OpenCode Integration PRD
Overview
WAIF must provide a reproducible, testable integration with OpenCode so developers can install, register, and use an OpenCode runtime for local development and agent workflows. This PRD defines the waif setup flow, the package manifest location, hook lifecycle, CLI primitives (waif prime/opencode), acceptance criteria, security constraints, test plan, and rollout guidance.
Goals / Success criteria
- Developers can run a single command (waif setup opencode-hooks) that validates prerequisites, optionally installs required system packages (with confirmation), and registers WAIF plugin(s) with a local OpenCode server.
- A waif prime/opencode command exists to inject compact priming context during lifecycle events (session.start, pre-compact).
- Priming payloads are budgeted to ~1k–2k tokens by default; summarization/token utilities exist (summarize(text,targetTokens), countTokens(text)).
- Installer exposes a health-check: emits a test OpenCode event and verifies OODA loop consumption.
- Security: priming context never leaks secrets; a redaction utility and threat-model checklist exist before enabling any skills.
- Full CI coverage: E2E tests run on Linux runners exercising installer, priming, event emission, and OODA detection.
```

### [docs/dev/PRD-command-in-progress.md](./docs/dev/PRD-command-in-progress.md)

```
# Product Requirements Document
Source issue: wf-10f
## Introduction
* One-liner
  * Define the product requirements for the `waif in-progress` command output, with a focus on making active blockers visible inline.
* Problem statement
  * `waif in-progress` currently prints a table of in-progress Beads issues, but it does not clearly communicate which specific issues are blocking each in-progress item.
  * While the output can include a numeric blocker count, users still have to manually run `bd show` or inspect issues to understand what is blocking active work.
  * This adds friction during day-to-day execution and reduces at-a-glance clarity in narrow terminal panes (e.g., tmux).
* Goals
```

### [docs/dev/prd-command-next.md](./docs/dev/prd-command-next.md)

```
# Product Requirements Document
## Introduction
* One-liner
  * CLI tool `waif` exposing subcommand `next` that returns the single best issue to work on now, printing a compact human output and supporting `--json` machine output.
* Problem statement
  * PMs and AI orchestrators spend time deciding what to work on next. This command reduces decision friction by selecting the top, unblocked, high-value issue using repository issue metadata and existing bv prioritization scores.
* Goals
  * Deliver a reliable CLI tool that lists the single best open, unblocked issue and explains why it was chosen.
  * Provide `--json` output matching `bd`'s JSON issue format, with computed scoring metadata included under a top-level `waif` metadata object for automation.
  * Use only issue metadata and bv prioritization scores (no human availability or external calendars).
```

### [docs/dev/prd-ooda-loop.md](./docs/dev/prd-ooda-loop.md)

```
# Product Requirements Document
## Introduction
* One-liner
  * A lightweight, headless OODA monitor CLI (`waif ooda`) that consumes OpenCode events emitted by an in-repo OpenCode plugin and renders a concise agent status table (agent | Busy/Free | Title) or JSON output. The monitor ingests JSONL events written to `.opencode/logs/events.jsonl` and operates without requiring tmux.
* Problem statement
  * Operators and PM agents currently rely on brittle terminal heuristics (tmux pane inspection) to determine agent status. This is slow and difficult to audit. A simple, event-driven status monitor will provide a canonical, scriptable view and durable audit trail.
* Goals
  * Deliver a first-iteration CLI command that reads OpenCode events and prints a width-aware, read-only table summarizing agent status.
  * Make output human-friendly and scriptable (plain text table or JSON) and persist canonical event snapshots for auditing in `history/`.
  * Keep scope conservative for v1: read-only monitoring that consumes OpenCode events; no automation that sends commands to agents.
```

### [docs/dev/release_management.md](./docs/dev/release_management.md)

```
# Release Management
This document will eventually describe the full release process for WAIF.
For now, it provides an initial recommended process that matches the current repository and CLI behavior.
## Goals
- Ship changes without breaking `main`.
- Make it easy to answer: “What version is running?” and “What changed?”
- Keep releases reproducible and verifiable.
## Definitions
- **Release artifact**: A built distribution intended for users (e.g., npm package / published tarball). It will not include `.git/`.
- **Working tree**: A developer checkout with `.git/` present.
```

### [docs/dev/team.md](./docs/dev/team.md)

```
# AI Team Roles & RACI
## Purpose
This document defines the minimal human roles (Producer and Prompt Engineer) and the agent-driven organization used for game development in this project. All non-human operational roles are executed by AI agents under the guidance and accountability of the `Producer`.
## Human Roles
- Producer (human): Accountable for feature vision, priorities, approvals, acceptance criteria, and final sign-off. The Producer delegates work to agent roles, reviews outputs, and ensures safety and alignment with goals.
- Prompt Engineer (human): Author and maintain prompt libraries, templates, guardrails, and reproducible prompt patterns. Ensures agents are given clear, testable instructions and that prompts are versioned and auditable.
## Agent Roles (AI-driven)
These are logical roles performed by one or more AI agents (agents may delegate to other agents):
- Designer AI: generates design variants, mechanics proposals, and creative options.
- Implementation AI: produces code or engine-level prototypes, wiring mechanics and integration hooks.
```

### [docs/dev/tmp/idle_scheduler_notes.md](./docs/dev/tmp/idle_scheduler_notes.md)

```
# Idle Scheduler Notes (wf-6pe)
- **Module file**: `scripts/idle-scheduler.sh`
- **Scope**: Provide an interactive-shell-only idle task runner with randomized intervals and safe `PROMPT_COMMAND` chaining.
- **Key features**:
  - Random interval between `IDLE_SCHEDULER_MIN_INTERVAL` (default 20s) and `IDLE_SCHEDULER_MAX_INTERVAL` (default 40s)
  - Guard against multiple sourcing via `__IDLE_SCHEDULER_ACTIVE`
  - Allows overriding `idle_task()` before sourcing
  - Handles `PROMPT_COMMAND` defined as a string or array, prepending the scheduler hook
  - Exits early when not in an interactive shell
- **Manual validation plan**:
```

### [docs/dev/TUI_PRD.md](./docs/dev/TUI_PRD.md)

```
# PRD (MVP): Agentic PM TUI (tmux Companion) (see wf-ca1, wf-dt1)
## 1) Summary
### 1.1 One-liner
A `tmux`-based (or similar) terminal UI that runs alongside OpenCode and the CLI, providing fast, dependency-aware visibility into Beads issues and common actions for a single PM.
### 1.2 Relationship to CLI PRD
This PRD complements the CLI scope in docs/dev/CLI_PRD.md. The CLI owns the “source of truth” actions (`bd` commands and file writes); the TUI is a focused operator interface for viewing state and triggering a small set of safe workflows.
## 2) Goals (MVP)
Rule of Five policy: artifact authoring/review uses 5-pass prompts (see wf-ba2.1).
- Make Beads issue state visible at a glance during daily PM work.
- Optimize the intake → triage → plan → ship loop for a single PM.
```

### [docs/dev/workflow_stage_tracking_PRD.md](./docs/dev/workflow_stage_tracking_PRD.md)

```
<!-- Seed Context (from wf-3ur.2) -->
**Source issue: wf-3ur.2**
- **Title:** Add workflow stage tracking to WAIF CLI
---
# Product Requirements Document: Workflow Stage Tracking
## Introduction
(Short one-liner)
## Problem
It can be hard for humans to track what stage a feature is at (idea, PRD, plan, implementation, etc.). This problem will worsen as agents operate in parallel. We need a way to persist the current stage of work and expose it succinctly to PMs.
## Users
```

### [docs/release_management.md](./docs/release_management.md)

```
# Release Management
This document will eventually describe the full release process for WAIF.
For now, it provides an initial recommended process that matches the current repository and CLI behavior.
## Goals
- Ship changes without breaking `main`.
- Make it easy to answer: “What version is running?” and “What changed?”
- Keep releases reproducible and verifiable.
## Definitions
- **Release artifact**: A built distribution intended for users (e.g., npm package / published tarball). It will not include `.git/`.
- **Working tree**: A developer checkout with `.git/` present.
```

### [docs/Workflow.md](./docs/Workflow.md)

```
# PRD-Driven Workflow (Human + Agent Team)
## Introduction
This document describes a PRD-driven workflow for building new products and features using a mix of human collaborators (PM, design, engineering, QA) and agent collaborators (coding agents, doc agents, review agents). The workflow emphasizes:
- A single source of truth in the repo (PRDs, issues, release notes)
- Clear handoffs and auditability (who decided what, and why) (see wf-ba2.8)
- Keeping `main` always releasable via feature flags and quality gates
By default, this workflow is tool-agnostic about the implementation stack (language, framework, test runner). It assumes this repository is the system of record.
## Prerequisites
You need the following available to follow this workflow end-to-end:
- Repo access with permission to create/edit files under `docs/`.
```

## How to query live state

- Beads issues: bd ready --json
- Current in-progress: bd list --status=in_progress --json