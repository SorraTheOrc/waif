<!-- Seed Context (rewritten from wf-3ur.2)
Source issue: wf-3ur.2
--> 

# Product Requirements Document: Workflow Stage Tracking (labels-only)

## One-line summary
Record and expose a canonical, machine-friendly workflow stage for each bead using structured labels so PMs and agents can reliably query, filter, and automate around the current stage.

## Introduction / Motivation
As human and agent activity scales, PMs and orchestrators need a single, authoritative source to determine the workflow stage of work items (beads). Labels provide a reliable, machine-friendly surface for programmatic queries, dashboards, and agent automation. This PRD specifies a labels-only approach (no notes required) that is low-risk to roll out and compatible with existing repository practices.

## Problem
Freeform notes are useful for history but fragile for automation and discovery. Relying on notes makes it difficult to compute the current progress across many beads reliably. We require a single canonical stage label that tooling can read without parsing freeform text.

## Users
- Primary: Product Managers (PMs)
- Secondary: agent orchestrators, release managers, QA, engineers, dashboards

## Success criteria
- PMs or automation can query the canonical stage for a bead with a single label lookup and get a concise, authoritative answer.
- Agents can idempotently update the current stage using bd CLI label operations.
- No existing issue IDs or bead schema are changed; rollout is additive and reversible.

## Constraints
- Use the existing Beads labels array on issues; do not edit .beads/issues.jsonl directly outside bd tooling.
- Minimize permissions and rollout friction.

## Desired change (labels-only)
1) Define a canonical stage label namespace: stage:<token>
   - The bead's canonical current stage is represented by a stage:* label on the issue.
   - Example labels (ordered by maturity): stage:intake_complete, stage:prd_complete, stage:milestones_defined, stage:plan_defined, stage:in_progress, stage:review, stage:done

2) Consumers (CLI, agents, dashboards) MUST read the stage:* labels and derive the canonical stage using the selection rule below.

## Canonical stage tokens and mapping
Tokens MUST be treated case-insensitively when parsed. The canonical tokens and their meanings (listed in order of maturity):
- idea — intake/idea stage
- prd_complete — PRD / Project Definition finalized
- milestones_defined — master milestones defined (no milestone identifier)
- planned — feature decomposition / implementation plan defined
- in_progress — implementation (vertical slices)
- in_review — review / sign-off
- done — completed / released

### Selection rule when multiple stage:* labels exist
Only one stage:* label SHOULD be present to indicate the canonical current stage. If multiple stage:* labels are present, the most mature label (the one that appears later in the canonical list above) MUST be treated as the canonical stage. Tooling MUST detect multiple stage:* labels and flag the issue for human review.

## Label syntax and rules
- Canonical form: stage:<token>
- Labels are case-insensitive when interpreted (store them in a consistent lowercase form: stage:in_progress).
- Examples:
  - stage:intake_complete
  - stage:prd_complete
  - stage:milestones_defined
  - stage:plan_defined
  - stage:in_progress
  - stage:review
  - stage:done

## Recommended update sequence
When transitioning a bead from old_stage -> new_stage, agents/humans SHOULD follow this sequence:

1) Discover existing stage labels:
   - Example command (run locally):
     bd label list <bead-id> | grep "stage:" | sed 's/^[[:space:]-]*//'
     - Example: bd label list wf-3ur.2 | grep "stage:" | sed 's/^[[:space:]-]*//'

2) Update labels (add new, remove old):
   - Use bd to add and remove the stage labels in a single update invocation where bd supports it, for example:
     bd update <bead-id> --add-label "stage:new_stage" --remove-label "stage:old_stage"
   - Example: bd update wf-3ur.2 --add-label "stage:in_progress" --remove-label "stage:plan_defined"

Notes:
- The selection rule above determines which label is canonical if multiple stage:* labels exist during transition.
- Do not rely on label timestamps; label systems do not provide reliable label-added timestamps. Use the maturity order above to select canonical stage when needed.

## Agent behavior & constraints
- Agents MUST use bd CLI label operations (bd update --add-label / --remove-label) to set the canonical stage. Agents MUST NOT edit .beads/issues.jsonl directly.
- Agents SHOULD check existing stage labels (see discovery command) and be idempotent: do not re-add the same stage label if already present.
- Agents MUST avoid modifying unrelated labels.

## Acceptance criteria (implementation)
- CLI: implement wf stage <bead-id> (alias for waif stage) that reads stage:* labels and prints the canonical stage according to the maturity selection rule (strip the "stage:" prefix).
- Tests: unit tests that validate selection behavior when multiple stage:* labels are present (choose most mature), and that bd update commands add/remove labels correctly without touching unrelated labels.
- Tooling: add a bd task or CI lint that flags issues that contain more than one stage:* label.

## Rollout / Phased plan (minimal)
1) Publish PRD (this file) and announce change to the team.
2) Implement read-only CLI: wf stage <bead-id> that reads stage:* labels and prints the canonical stage (no writes yet).
3) Add stage column to wf in-progress table output (strip the "stage:" prefix). In space-constrained environments, reduce stage display to a 1-3 letter code using this mapping:
- idea -> "in"
- prd_complete -> "prd"
- milestones_defined -> "mst"
- planned -> "pln"
- in_progress -> "inp"
- in_review -> "rev"
- done -> "don"

## Open questions / decisions required
1) Permissions: which agents are authorized to set stage:* labels automatically? (Recommendation: limit to named agents and trusted CI accounts.)
2) Enforcement: do we want CI/linters to reject pushes that introduce multiple stage:* labels? (Recommended to flag but not block initially.)

## Open Questions added from automated reviews
- Should tool output prefer a short-code or full token when both are available and terminal width allows? (Requires product decision.)
- Who has authority to set stage:* labels programmatically? (Specify trusted agent/CI identities or a human-only policy.)

## Risks and mitigations
- Risk: Multiple stage:* labels may be added by mistake. Mitigation: tooling warns and provides a remediation chore; selection rule uses maturity order and issues are flagged for manual review.
- Risk: Agents may change unrelated labels accidentally. Mitigation: helpers/tests enforce namespace scoping and agent guidance.

- Security note: Restrict which agents and CI identities may set stage:* labels. Record label changes in operational logs where possible and limit credentials used by automation to trusted accounts. Consider adding a permission policy entry (e.g., "trusted-agents-only") to .opencode/permissions_matrix.md.

## Next steps / Deliverables
- Implement wf stage <bead-id> (read-only) — ticket + tests.
- Add CI/linters to flag multiple stage:* labels.
- Update docs and agent developer guidance to use the bd label discovery and update commands above.

End of PRD (labels-only)
