<!-- Seed Context: wf-ba2.3.7
Title: Design: integrate waif CLI with OpenCode PRD agent
Description: Allow the Node/TypeScript `waif` CLI to initiate and run an interactive PRD authoring session driven by the OpenCode `/prd` command. M0: spawn `opencode run --command /prd --format json --session <session-id>` and mediate the interactive event loop.
Notes: Implementation tasks: Session Manager, CLI adapter (stdin piping), Event Parser, Interaction Adapter, File Manager, Beads Linker, Audit Logger, tests.
-->

# Product Requirements Document

## Introduction

* One-liner
  * Provide a waif CLI workflow that drives OpenCode `/prd` to produce auditable PRDs seeded from beads issues.

* Problem statement
  * There is no integrated, local CLI flow that drives the OpenCode `/prd` PRD agent while mediating an auditable, idempotent write of the resulting PRD into the repository and linking it to the originating beads issue.

* Goals
  * `waif prd --issue wf-ba2.3.7 --out docs/dev/wf-ba2.3.7_PRD.md` completes and writes the PRD file to disk.
  * The system interviews the user (via waif) to gather missing details during the session, and the agent may propose file edits that the user accepts or rejects.
  * After success, beads receives a single `Linked PRD: docs/dev/wf-ba2.3.7_PRD.md` comment and a `PRD: docs/dev/wf-ba2.3.7_PRD.md` external-ref (idempotent).

* Non-goals
  * Implementing a full OpenCode SDK integration (M2) or automatic branch/PR creation by default.

## Users

* Primary users
  * Product designers and PMs who author PRDs via an interactive CLI-driven interview.

* Secondary users
  * Engineers and automation systems that need reproducible PRD files and two-way traceability with beads issues.

* Key user journeys
  * Start an interview seeded from a beads issue, answer agent questions, accept proposed file changes, and close the session with a written PRD and beads link.

## Requirements

* Functional requirements (MVP)
  1. Invocation: `waif prd --issue wf-ba2.3.7 --out docs/dev/wf-ba2.3.7_PRD.md [--backend cli|serve|sdk] [--session <id>]` must start an interactive session.
  2. Backend (M0): when `--backend cli` (default), waif must spawn: `opencode run --command /prd --format json --session <session-id>` and stream JSON events.
  3. Event mediation: waif must display `question` events, accept user answers, forward answers to `/prd` (stdin piping for M0), show `file-proposal` previews, accept/reject them, and handle `file-write` events by performing atomic writes.
  4. File writes: write to a temp file in session dir, run `remark` formatting, fsync, and rename over target; if content is identical, avoid mtime change.
  5. Session resume: `--session <id>` resumes `.waif/sessions/<id>/`.
  6. Beads linking: after success run idempotent linking (see Idempotent Beads Linking) and record actions in audit.
  7. Audit: write `.waif/audit/<session-id>.json` with redacted prompt excerpt and metadata.
  8. Exit codes: `0` success; `2` missing `opencode` when `--backend cli`; `3` interrupted & partial saved; `4` schema/parse error.

* Non-functional requirements
  * Tests: unit tests for Event Parser, Beads Linker (mocked bd), File Manager atomic writes; integration tests gated by presence of `opencode`.
  * Security: redact secrets from prompts before writing audits; reject proposals outside repo root.
  * Platform: Linux/macOS supported for M0.

* Integrations
  * OpenCode CLI (`opencode`) for `/prd` runs.
  * Beads CLI (`bd`) for issue seed and linking.
  * `remark` for Markdown formatting.

* Security & privacy
  * Audit logs are stored under `.waif/audit/` and are gitignored by default.
  * Prompts must be redacted (PEM blocks, tokens) before storage.

## Release & Operations

* Rollout plan
  1. Implement M0 `cli` backend and core components with unit tests.
  2. Add a mocked `opencode` harness for CI integration tests; gate live integration on `opencode` availability.
  3. Incrementally add `serve` and `sdk` backends.

* Quality gates / definition of done
  * Unit tests pass locally (`npm test`).
  * Integration tests (mocked) exercise the event loop and validate file writes and beads linking.
  * `waif prd --issue wf-ba2.3.7 --out <path>` completes end-to-end in a dev environment when `opencode` is present.

* Risks & mitigations
  * Missing `opencode` or `bd`: the tool must surface clear fallback instructions and write audit entries indicating manual linking steps.
  * Schema drift in `/prd` events: detect missing required fields, write raw event to session dir, and exit with code `4`.
  * Disk full / permission errors: abort file writes, revert temp files, record error in audit, and surface clear error to user.
  * Malicious or accidental out-of-repo paths: reject proposals outside repo root and record in audit.

## Open Questions

* Should `--create-pr` be implemented as opt-in to auto-stage/commit the PRD when desired? (recommended: opt-in)
* Decide agent permission model: `--allow-agent-permissions` boolean vs role-based allowlist. (M0: boolean)

## Appendix: Acceptance Criteria (testable)

* Running: `waif prd --issue wf-ba2.3.7 --out docs/dev/wf-ba2.3.7_PRD.md` writes `docs/dev/wf-ba2.3.7_PRD.md` and produces `.waif/audit/<session-id>.json`.
* Beads: `bd show wf-ba2.3.7 --json` includes an external-ref `PRD: docs/dev/wf-ba2.3.7_PRD.md` and a comment `Linked PRD: docs/dev/wf-ba2.3.7_PRD.md` (idempotent on repeated runs).
* File formatting: `npx remark` was run successfully on the file.

## Approved Example Exchange

The following is the exact approved example exchange that must be preserved in the PRD. This is the canonical sample run that demonstrates how the CLI should mediate the OpenCode `/prd` session, including question/answer flow, file-proposal preview and acceptance, atomic file write, and session completion.

- Invocation:
  - User: `waif prd --issue wf-ba2.3.7 --out docs/dev/wf-ba2.3.7_PRD.md`
  - waif spawns: `opencode run --command /prd --format json --session <session-id>`

- Question (opencode → waif → user → opencode stdin):
  - opencode event: `{ "type": "question", "id": "q1", "text": "What is the one-line purpose of this feature?" }`
  - waif displays and collects answer and writes to opencode stdin: `{ "type": "answer", "questionId": "q1", "text": "..." }`

- File-proposal (preview):
  - opencode event: `{ "type":"file-proposal","id":"f1","path":"docs/dev/wf-ba2.3.7_PRD.md","preview":"### Purpose\n..." }`
  - waif prompts accept? [y/N] → on accept send `{ "type":"file-accept","fileId":"f1","accepted":true }` to opencode stdin

- File-write:
  - opencode event: `{ "type":"file-write","id":"w1","path":"docs/dev/wf-ba2.3.7_PRD.md","content":"<full markdown>" }`
  - waif runs atomic write: tmp -> remark -> fsync -> rename; audits and replies `{ "type":"file-written","fileId":"w1","status":"ok" }`

- Session complete:
  - opencode event: `{ "type":"session-complete","summary":{"files":["docs/dev/wf-ba2.3.7_PRD.md"]} }`
  - waif runs final remark, computes affected-files, idempotently links beads, writes `.waif/audit/<session-id>.json`, emits final JSON summary, exit 0.

## Source issue: wf-ba2.3.7
