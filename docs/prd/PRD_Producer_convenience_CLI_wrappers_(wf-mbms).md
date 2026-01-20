# Product Requirements Document

## Introduction

### One-liner

Define and deliver a lightweight, extensible framework for authoring WAIF CLI wrapper commands that compose or adapt existing tools (e.g., `bd`, `wf`, `waif`). Individual wrapper features (claim, record, branch helpers) will be implemented as child feature beads of this epic.

### Problem statement

Teams repeatedly write small wrapper scripts around existing CLIs to apply project conventions, safety checks, and bead bookkeeping. Without a shared framework each new wrapper duplicates argument parsing, dry-run support, error handling, and bead audit logic, leading to inconsistent UX and higher maintenance cost.

### Goals

- Provide a minimal, well-documented framework (library + CLI scaffold) that makes creating consistent wrapper commands fast and low-friction.
- Ship example wrapper features (as child beads) to validate the framework and demonstrate patterns (e.g., bead audit, optional branch helpers).
- Enforce safe defaults across wrappers: `--dry-run`, required-tool checks, clear remediation, and idempotence for stateful operations.

### Non-goals

- Implement every desired wrapper within this epic — concrete commands are child feature beads.
- Impose a single, mandatory branching strategy; wrappers that need branches may opt into branch helpers provided by the framework.

## Users

### Primary users

Developer-producers and contributors who need simple, safe wrappers to perform bead-related and small workflow tasks without reimplementing boilerplate.

### Secondary users (optional)

Repo maintainers, automation engineers, and CI integrators who will reuse consistent wrappers for onboarding and automation.

### Key user journeys

- Author wrapper: developer uses scaffold and helpers to create a new wrapper with tests and docs in <15 minutes.
- Run wrapper (happy path): user runs a wrapper; it verifies prerequisites, performs the action, and records a concise bead audit note or external-ref if applicable.
- Extend framework: contributor adds a helper (e.g., external-ref helper) and existing wrappers can adopt it with minimal changes.

## Requirements

### Functional requirements (MVP)

- Provide reusable helpers: argument parsing, `--dry-run` semantics, tool availability checks, safe execution wrapper, logging, and bead audit helpers (comments + external-ref helper).
- Provide a CLI scaffold generator or template to bootstrap new wrapper commands with tests and docs.
- Include at least two example wrapper implementations as child features demonstrating common flows (bead audit, optional branching helper, dry-run).
- Ensure wrappers produced by the framework include consistent user messages, clear error remediation, and idempotence where applicable.
 - Support wrapping multi-step shell workflows: framework helpers must make it safe and easy to compose BASH-style command sequences (dry-run, argument escaping, error handling, and single-point logging for audit).

### Non-functional requirements

- Reusability: helpers are modular and importable from multiple wrappers.
- Testability: generated wrappers include unit tests and (where feasible) integration tests with stubs/mocks for external CLIs.
- Low friction: bootstrapping a new wrapper should take <15 minutes for an experienced contributor.

### Integrations

- Existing CLIs: `bd`, `git`, `waif`/`wf` — wrappers may invoke these but tests should not require them (provide mocks).
- Testing: integrate with the repo's existing test runner and linters.
 - Shell environments: explicit support for BASH-compatible execution contexts (helpers for escaping, piping, and running multi-command scripts) so wrappers can safely compose shell workflows.

### Security & privacy

Security note: Framework must provide safe-execution helpers that avoid unescaped environment leakage and prevent accidental logging of secrets.

Privacy note: Bead comments and external refs must not contain secrets or large diffs.

Security note: Because wrappers may execute BASH-style sequences, the framework must include guidance and helpers to avoid command injection, ensure proper quoting/escaping, and clearly mark when a wrapper will execute user-supplied commands. Do not execute untrusted input without explicit user consent and strong validation.

## Release & Operations

### Rollout plan

1) Implement framework core and generate documentation. 2) Implement two example child wrappers and ship to a beta group. 3) Iterate based on feedback and add more example wrappers.

### Quality gates / definition of done

- Core framework library implemented and documented in `docs/dev/CLI_PRD.md` or `docs/dev/wrappers.md`.
- At least two child feature beads implemented with tests and example usage in docs.

### Risks & mitigations

- Risk: the framework becomes overly opinionated — Mitigation: keep helpers minimal and opt-in; document extension points.
- Risk: wrapper code leaks credentials — Mitigation: include safe-exec helpers and code review of generated wrappers.

## Open Questions

1. How many example child features should be created now? (I propose 2–3; recommended: 2)
2. Priority: should core framework be P1 and examples P2? (recommended)

## Child features (initial examples)

- Feature: Wrapper framework (core) — implement helpers, scaffold command, tests, and docs — parent: `wf-mbms` — priority: P1
- Feature: `bd update` convenience wrapper — example using bead audit helper and dry-run — parent: `wf-mbms` — priority: P2
- Feature: `waif id start` example wrapper — demonstrates optional branch helper usage and idempotence — parent: `wf-mbms` — priority: P2
 - Feature: `wf` convenience wrapper — example demonstrating wrapper usage for `wf` CLI commands — parent: `wf-mbms` — priority: P2
 - Feature: General script runner — example wrapper that safely runs multi-step BASH-style scripts using framework helpers — parent: `wf-mbms` — priority: P2

---

Seed Context

This PRD supersedes the earlier branch-focused draft and re-scopes the epic to deliver a reusable wrapper framework. Child feature beads will implement concrete wrappers (e.g., `bd update` wrapper, `waif id start`) to validate and demonstrate the framework.
