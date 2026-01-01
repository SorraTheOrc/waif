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

Primary: Product Managers. Secondary: agent orchestrators, release managers, QA.

## Success Criteria

PMs can run a  command and be told, concisely and clearly, which stage of the workflow they are at and which stage of the command implementing that workflow is underway.

## Constraints

Must be additive to Beads (.beads/issues.jsonl), not change existing issue IDs, and be low-risk for initial iteration.

## Existing State

No dedicated PRD or implementation currently exists in  or  for stage tracking. Related issues:
- wf-3ur (WAIF version 0.2)
- wf-3ur.1 (Add --number/-n option)
- wf-ba2.1.9 (Rule of Five)

## Desired change

Add a persistent  signal to issues (and optionally a small structured worklog). Provide a  command for concise output for PMs and an API for agents to update stage entries idempotently.

## Open Questions

1) Which canonical stages to support initially?
2) Single current stage vs historical worklog?
3) Who can programmatically update stages?

## Per-bead worklog & state

To support clear, concise, and machine-friendly tracking of the current workflow state for an issue (bead) while preserving a lightweight human-readable audit trail, introduce a small, standardized convention for recording per-bead worklogs and the current workflow_state.

Purpose
- Provide a minimal, consistent history for actions taken against a bead (claims, handoffs, state changes) useful to PMs and agents.
- Keep the primary, machine-consumable current state in issue metadata while offering a readable comment-based audit for humans.

Canonical fields and storage
- Human-readable audit (preferred for manual review): use a bead comment block prefixed with the single-line token "WORKLOG:". Agents and humans can append short line-oriented entries to this comment.
- Machine-consumable fields (preferred for tooling): add two optional fields in the bead metadata in .beads/issues.jsonl:
  - "worklog": an array of line-oriented strings (the most recent entries first is recommended)
  - "workflow_state": a single string representing the current canonical stage (e.g., idea, prd, planning, in_progress, review, done)

When to use comment vs metadata
- Use metadata when agents or automated tooling need to read/write the current state or append entries programmatically.
- Use the WORKLOG comment when a concise human-readable audit trail is required, when making short manual notes, or when preserving history for reviewers.
- Both can be maintained in parallel: update metadata for tooling and append the same line to WORKLOG for human readers. Ensure entries are idempotent where possible.

Line-oriented worklog entry format
- Single-line entries, UTF-8, no newlines inside an entry.
- Recommended format (pipe-free):
  <ISO-8601-UTC> <actor> <action> -> <resulting_state> [#reference]

- Example entry:
  2025-12-31T20:00:00Z @alice claim -> in_progress #bd-wf-rjh

Examples (three realistic entries)
- Claim / start work:
  2025-12-31T20:00:00Z @alice claim -> in_progress #bd-wf-rjh
- Handoff / reassign to another agent or person:
  2025-12-31T22:10:03Z @alice handoff->@bob -> in_progress #note:awaiting-bob
- Close / completed:
  2026-01-02T09:15:00Z @bob close -> done #gh-pr-123

Sample WORKLOG comment block (multi-line, appended to bead comments)

WORKLOG:
2025-12-31T20:00:00Z @alice claim -> in_progress #bd-wf-rjh
2025-12-31T22:10:03Z @alice handoff->@bob -> in_progress #note:awaiting-bob
2026-01-02T09:15:00Z @bob close -> done #gh-pr-123

Guidance and limits
- Keep entries concise: recommended limit 200 characters per entry. Shorten links by using issue references (#bd-xxx or #gh-pr-123) when possible.
- Privacy: never include secrets, credentials, or detailed PII in worklog entries. If a sensitive detail is necessary, redact and store an internal reference instead.
- Retention: the WORKLOG comment and metadata should be kept as a short history. If an issue accumulates many entries over time, create a linked archival note (e.g., a history chore) and truncate the live WORKLOG to recent entries.

Usage checklist for agents (always follow)
1) When claiming or updating work, append a single-line worklog entry (metadata.worklog[] and WORKLOG comment) following the format above.
2) Update metadata.workflow_state to the canonical stage string.
3) If the change discovers new work or blockers, create a bd issue and add a discovered-from:<current-bead-id> dependency.
4) Add a bead comment (not the WORKLOG) summarizing files edited or PR created (include PR URL) so humans can find artifacts quickly.
5) Keep entries short and avoid sensitive data.

Rationale
This small convention balances machine-readability and human auditability: storing a single current state in metadata enables tools and agents to reason about workflow stage idempotently, while a short WORKLOG comment preserves an easy-to-scan trail for PMs and reviewers without requiring them to parse the full history database.

## Next steps

- Gather canonical stage list and permissions.
- Prototype with issue  field + linked chore for history.
- Implement  CLI and tests.
