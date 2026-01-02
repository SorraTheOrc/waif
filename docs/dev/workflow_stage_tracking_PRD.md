<!-- Seed Context (from wf-3ur.2) -->
**Source issue: wf-3ur.2**

- **Title:** Add workflow stage tracking to WAIF CLI

---

# Product Requirements Document: Workflow Stage Tracking

## Introduction

(Short one-liner)

## Problem

It can be hard for humans to track what stage a feature is at across the named workflow steps (Project Definition, Define Milestones, Feature Decomposition, Vertical Slices) and the associated bead-stage tokens (idea, prd, milestone, planning, in_progress, review, done). This problem will worsen as agents operate in parallel. We need a way to persist the current stage of work and expose it succinctly to PMs.

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

## Per-bead workflow-stage recording (notes-only)

Decision: record only transitions between canonical workflow stages (not every minor status change). The canonical place to record those stage transitions is the bead "notes" field.

Canonical bead-stage tokens (machine-friendly):
- idea
- prd
- milestone
- planning
- in_progress
- review
- done

Named workflow steps taken from docs/Workflow.md: Project Definition; Define Milestones; Feature Decomposition; Vertical Slices.

Mapping (token -> Workflow.md step / meaning):
- idea -> early proposal (pre-PRD)
- prd -> Project Definition (PRD created)
- milestone -> Define Milestones
- planning -> Feature Decomposition
- in_progress -> Vertical Slices (implementation)
- review -> Review and sign-off
- done -> Completed / released

Updates MUST be made using the bd CLI notes flag, e.g.:

  bd update <bead-id> --notes "prd -> in_progress"

Guiding principles
- Only record stage transitions. Do not record every small status update or transient activity.
- The notes field is the canonical source of truth for current stage transitions that humans will read.
- Do not overwrite other notes present in the bead. Agents and humans must append or add a stage-only note; they must not delete or replace unrelated notes.
- Use short, idempotent entries that name the canonical stage and (optionally) a short actor or reference.

Recommended entry format
- Single-line, UTF-8, recommended max 200 characters.
- Recommended form: <stage> [@actor] [#reference]
  - Examples:
    - prd @alice #bd-wf-rjh
    - in_progress @alice #gh-pr-93
    - review @bob #gh-pr-123

Examples of recording stage transitions
- Claim / start work:
  bd update bd-wf-rjh --notes "in_progress @alice #bd-wf-rjh"
- Move to review:
  bd update bd-wf-rjh --notes "review @alice #gh-pr-93"
- Close / done:
  bd update bd-wf-rjh --notes "done @bob #gh-pr-93"

Agent behavior and constraints
- Agents MUST use the bd CLI to append stage notes. They must not directly edit .beads/issues.jsonl to change the notes field outside of bd tooling.
- When adding a stage note, ensure you do not overwrite existing notes. Use bd's notes update semantics (which appends or adds a note) rather than replacing freeform notes.
- Agents may maintain local tooling caches or metadata for convenience, but these MUST be considered a non-authoritative cache. The bead notes are the human-facing record.
- If an agent discovers new work, create the corresponding bd issue and add a discovered-from:<current-bead-id> dependency as usual.

Usage checklist for agents
1) Decide canonical target stage for this transition (from the agreed stage list).
2) Run: bd update <bead-id> --notes "<stage> [@actor] [#reference]"
3) Do not modify or remove other notes in the bead. If you need to add more context, create a separate non-stage note.
4) If the transition spawns new work, create a bd and link it discovered-from:<bead-id>.
5) When making code/docs changes, add a normal bead comment (separate from stage notes) with files edited or PR URL so reviewers can find artifacts.

Rationale

Keeping a single, minimal record of stage transitions in the bead notes keeps the human-facing trail concise and reduces noise. Requiring updates through the bd CLI standardizes how changes are recorded and avoids accidental overwrites of unrelated notes or metadata that other tools rely on.

## Next steps

- Gather canonical stage list and permissions.
- Prototype with issue  field + linked chore for history.
- Implement  CLI and tests.

End of new content.
