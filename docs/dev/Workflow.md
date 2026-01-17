# PRD-Driven Workflow (Human + Agent Team)

## Introduction

This document describes a issue and PRD-driven workflow for building new products and features using a mix of human collaborators (PM / Producer) and agent collaborators (PM, coding, documents, test, shipping). The workflow emphasizes:

- A single source of truth in the repo (PRDs, issues, code, release notes)
- Clear handoffs and auditability (who decided what, and why) (see wf-ba2.8)
- Keeping `main` always releasable via feature flags and quality gates

By default, this workflow is tool-agnostic about the implementation stack (language, framework, test runner). It assumes this repository is the system of record.

## Prerequisites

You need the following available to follow this workflow end-to-end:

- Repo access with permission to create/edit files.
- A shared issue tracking mechanism.
  - In this repo, use `bd` (beads) for issue tracking.
- An agreed PRD template.
  - In this repo, use the OpenCode command `/prd` to create an PRD via Agent based interview (stored under `.opencode/command/prd.md`). (see wf-ba2.3)
- A minimal quality bar for “releasable `main`” (tests/coverage gates, feature-flag policy, and review policy).

## Steps

The following steps describe the end-to-end workflow for delivering a new feature or product. A product is a collection of features that deliver end-user value. A feature is a discrete unit of user value that can be delivered independently (e.g., a new command, UI screen, or API endpoint). An epic is a collection of related features that deliver a larger user story.

In summary the workflow is:

- Define the project: state scope, measurable success metrics, constraints, and top risks.
- Define Milestone(s): map end-to-end user outcomes, milestones (M0/M1), and cross-functional owners.
- Decompose each epic into features: for each feature specify acceptance criteria, minimal implementation, and the prototype or experiment to validate assumptions.
- Implement each milestone/epic as vertical, end-to-end slices: deliver the smallest end-to-end feature (code, tests, infra, docs, observability) per iteration.

In more detail, the steps are:

### Project Definition

Define the bounding intent for the work: scope, measurable success metrics, constraints, and the top risks. Capture a one-paragraph project summary at the top of the PRD and include:

- **Success signals:** precise, automatable metrics and baseline measurements to evaluate the outcome.
- **Constraints:** timeline, budget, compatibility, and regulatory limits that affect tradeoffs.
- **Top risks:** short list of the highest-impact uncertainties and a proposed first-mitigation.

Agent Commands:
1) Create initial tracking bead: `/intake <Project Title>` (OpenCode) or `wf intake <Project Title>` (CLI)
2) Create PRD via interview: `/prd <Bead ID>` (OpenCode) or `wf prd <Bead ID>` (CLI)

Summary: a clear, testable project definition that guides epics and prioritization.

### Define Milestones

Map the end-to-end user outcomes into one or more master epics that represent deliverable milestones (for example `milestone:M0`, `milestone:M1`). For each master epic record cross-functional owners and high-level milestones.

- **Outcome map:** list the user flows the epic must enable and the acceptance criteria at the epic level.
- **Milestones:** define at least one short feedback milestone (M0) and one fuller delivery milestone (M1).
- **Ownership:** assign an owner for PM, engineering, infra, security and UX per epic.

Agent Commands:
1) Decompose the PRD into master epic(s): `/milestones <PRD Path>` (OpenCode) or `wf milestones <PRD Path>` (CLI)

Summary: master epics turn the project definition into parallel, owned workstreams.

### Feature Decomposition

Break each epic into discrete features: each feature should have a concise acceptance criteria statement, a minimal implementation plan, and—where applicable—a prototype or experiment to validate assumptions.

- **Acceptance:** expressable, pass/fail acceptance criteria suitable for automated tests or a short manual checklist.
- **Prototype:** when assumptions are risky, describe a lightweight experiment (fake-API, mock UI, A/B) and success thresholds.
- **Taskization:** create `bd` tasks for implementation, infra, docs, and tests; link to the PRD and epic.

Agent Commands:
1) Decompose epics into features and tasks: `/plan <Epic ID>` (OpenCode) or `wf plan <Epic ID>` (CLI)

Summary: features make epics executable and testable in small increments.

### Implement Milestones/Epics

Implement each milestone/epicas vertical, end-to-end slices: each iteration delivers a working path from UI/CLI through backend, infra, tests, docs, and observability.

- **Complete slice:** include code, unit/integration tests, CI configuration, deployment config, runtime observability (metrics/logs), and a rollback/feature-flag plan.
- **Demo-ready:** each slice should be deployable to a staging environment and demoable with a short script.

Agent Commands:
1) For each issue, generate implementation plan: `/plan <Issue ID>` (OpenCode) or `wf plan <Issue ID>` (CLI)
2) For each issue, generate user documentation: `/doc <Issue ID>` (OpenCode) or `wf doc <Issue ID>` (CLI)
3) For each issue, generate test plan: `/testplan <Issue ID>` (OpenCode) or `wf testplan <Issue ID>` (CLI)
4) For each issue implement the feature and tests: `/implement <Issue ID>` (OpenCode) or `wf implement <Issue ID>` (CLI) 

Summary: vertical slices reduce integration risk and make progress visible.

