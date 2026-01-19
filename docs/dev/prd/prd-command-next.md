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

* Non-goals
  * Assigning or scheduling issues to specific people.
  * Integrating human availability or calendar data.

> Source issue: wf-74

## Users

* Primary users
  * Product Manager (PM) — wants a fast, defensible recommendation for the next item to work on.

* Secondary users (optional)
  * AI orchestrator / automation tooling — consumes `waif next --json` for programmatic decision-making.

* Key user journeys
  * PM runs: `waif next` → sees a one-row recommendation table plus a details section (from `bd show` when available).
  * PM runs: `waif next --json` → receives bd-format JSON augmented with a top-level `waif` object containing computed score and ranking metadata.
  * Automation: scheduled agent runs `waif next --json` to seed downstream orchestration workflows.

## Requirements

* Functional requirements (MVP)

1. `waif next` lists eligible candidates (open and unblocked) and returns the top-ranked issue. When `--assignee <name>` is provided, eligible candidates are limited to issues whose `assignee` matches the provided name (after trim), and the existing selection/ranking logic is applied to that filtered set.
2. `waif next` prints human-readable output as:
   - a one-row recommendation table
   - a blank line
   - a `# Details` heading
   - the full `bd show <id>` output when `bd` is available
3. When `bd` is not available, `# Details` falls back to: `<id>: <title>` (no selection rationale line is printed in human output).
3. `waif next --json` prints a JSON object with full issue details plus computed score and ranking metadata.
4. Ranking uses existing bv prioritization scores as the primary signal; tie-break deterministically by computed numeric score and, if equal, by `id` (lexicographic).
5. CLI flags: `--json`, `--verbose` (debug logs), `--assignee <name>` (alias `-a`) to filter eligible candidates by exact assignee name (string compare after trim).
6. On success, `waif next` copies the recommended issue id to the OS clipboard (best-effort).
7. Read-only operation: the command must not modify issue state.

* Non-functional requirements
  * Deterministic: given the same inputs, ranking output should be stable.
  * Testable: include unit tests for ranking and JSON output format.
  * Minimal dependencies: rely on `bd`/`bv` query outputs where possible.
  * Performance concerns for very large issue sets were considered and deemed unnecessary for MVP; the current implementation scores the candidate set returned by `bd ready --json` in-memory.

* Integrations
  * Beads CLI (`bd`) and bv ranking tool as data sources (or local computation of available metrics). Use `bd ready --json` / `bd list --json` to enumerate candidates.
  * CLI implementation must follow the repo's CLI conventions and be runnable as `waif next` subcommand.

* Security & privacy

  * The command only reads issue metadata; do not emit secrets or sensitive attachments.
  * Redaction was reviewed and deemed unnecessary for this project: issue metadata is considered safe to re-emit in JSON output for machine consumption.


## Release & Operations

* Rollout plan
  1. Implementation in a feature branch with tests.
  2. Merge to main and tag a minor release.
  3. Monitor usage and errors for the first two weeks.

* Quality gates / definition of done
  * Unit tests covering ranking logic and JSON output pass.
  * CLI integration test that runs against a test beads dataset.
  * PR reviewed and merged; `waif` documented in README/CLI docs.
  * Example usage added to `docs/Workflow.md` showing how it fits into Rule-of-Five.

* Risks & mitigations
  * Risk: Ranking surprises PMs (opaque rationale). Mitigation: include explicit rationale and ranking metadata (scores, contributing signals).
  * Risk: BV scores unavailable or stale. Mitigation: fallback to a reproducible local scoring heuristic and surface which signal was used.
  * Risk: Performance on large issue sets. Mitigation: paginate or limit candidates (e.g., top N by priority) before heavy scoring.

## Update: Search-Prioritized Selection (Intake)

This PRD is updated to cover the intake for adding an optional search string that allows the Producer to bias `waif next` recommendations. The Source issue for this intake is: wf-c2n.

### Problem (update)
Deciding the next issue in a large project is currently based purely on a mathematical calculation that relies on issues being accurately prioritized and the hierarchy being fully defined. In practice this is not a perfect science. Allowing a search term to filter/prioritize possible next issues will allow the Producer to influence the next issue decision when needed.

### Users
Primary: Producer (user running `waif next`). No secondary stakeholders identified.

### Acceptance criteria
1. `waif next` accepts an optional positional search string: `waif next "<search>"`.
2. When a search string is provided, the implementation requests the top N candidates from bv (top_n = 10 by default), then applies fuzzy matching to those candidates and re-ranks them using the weighting model below.
3. Matching model: fuzzy matching (recommendation: fuse.js) applied over issue title and description.
4. Weighting model (hard-coded defaults): title match = +20% score multiplier, description match = +10% score multiplier. These weights are configurable in follow-ups but hard-coded for the initial implementation.
5. Fallback behavior: if no candidate in the top N rises above the top non-matching candidate after weighting, the command should fall back to the existing selection process and clearly indicate a "no-match" result in the human output.
6. CLI UX: search string is a positional argument (e.g., `waif next "ui bug"`). Optional `--assignee <name>` applies a hard filter first; the positional search then re-ranks within the filtered set.
7. `waif next --json` must preserve its existing JSON contract and must NOT include additional match metadata in v1. JSON error path for `--assignee` no-match should return `{ "error": { "message", "code" } }` aligned with other commands.
8. Tests: unit tests for title vs description weighting and an integration test verifying top_n re-ranking and fallback behavior. Add cases covering assignee filtering, no-match error, and assignee+search determinism.

### Constraints
- Must be a no-op when no search string is provided.
- Performance: interactive latency remains a goal; scoping to top N candidates reduces search work.
- Determinism: tie-breaking and scoring must be deterministic and stable.

### Existing state
- Current implementation lives at `src/commands/next.ts` and test stubs at `tests/next.test.ts`.

### Desired change
- Update `src/commands/next.ts` to accept a positional search term, request top_n candidates from bv, apply fuzzy matching (fuse.js), re-rank with the weighted model, and implement the fallback behavior above.
- Add/modify unit and integration tests in `tests/next.test.ts` to cover the new behavior.

### Likely duplicates / related docs
- docs/dev/prd-command-next.md (this document)
- docs/Workflow.md (selection rules)
- docs/dev/CLI_PRD.md

### Related Beads issues
- wf-3ur.1 Add --number/-n option to 'waif next' to return multiple suggestions (BLOCKER)
- wf-35m.4 Reduce code duplication across next/recent/in-progress commands
- wf-ba2.1.5 Rule of Five: Select next issue (Workflow step 4.1)
- wf-ba2.3.6 Wire waif prd command to PRD Agent workflow (adjacent)
- wf-32r Beads search command (related search UX)

### Clarifying questions (recorded)
1. Fuzzy matching chosen (fuse.js recommended). No other library required for v1.
2. Weights are hard-coded for v1: title +20%, description +10%.
3. top_n candidate strategy removes the need for an explicit numeric threshold.
4. Positional CLI arg chosen for UX.
5. No additional JSON metadata in v1.

### Proposed next step
- UPDATE PRD at: docs/dev/prd-command-next.md (this file updated)
- Recommended next command: `/prd docs/dev/prd-command-next.md wf-c2n`

# Source issue: wf-c2n
# Linked issue: wf-c2n

## Update: Epic-aware selection (wf-uctv)

Problem (update)

- When the selected top issue is an Epic currently in the `in_progress` state, Producers need `waif next` to recommend the next most important work specifically for that Epic (direct children or immediate blockers), rather than a global top-ranked issue. The recommendation must make Epic context explicit so the Producer can direct agents/humans effectively.

Users

- Primary: Producer / PM running `waif next` in an environment where an Epic is in progress.
- Secondary: Engineers and agents picking the recommended bead to work on.

Acceptance criteria

1. Epic detection: when the top-ranked candidate (by existing selection/ranking logic) is an issue of type `epic` and status `in_progress`, `waif next` enters Epic-aware selection mode.
2. Candidate scope: Epic-aware selection considers the Epic's direct children and any immediate blockers (i.e., issues that have a `blocks` relationship to the Epic or vice-versa where applicable). Only direct relations are considered to keep latency low.
3. Selection rule (v1):
   - If any child is `in_progress`, recommend that child (prioritize finishing work already started).
   - Otherwise, among the set of children and blockers, pick the issue with the highest bv priority score. If bv is unavailable or ties occur, fall back to numeric priority (lower number higher priority), then recency (earlier created_at wins), then id deterministic tie-break.
4. Assignee filtering: the existing `--assignee <name>` flag applies a hard filter before Epic-aware selection; if not provided, selection considers all assignees.
5. Human output: in human mode, `waif next` must clearly display:
   - A one-row recommendation table (as before)
   - An explicit `Epic context:` line after the table, e.g. `Epic context: wf-1234 (in_progress)`
   - The recommended child/blocker id and title and a short rationale (e.g. `recommended: wf-2345 (child, in_progress) — finish in-progress child`).
   - If a child/blocker is already in_progress, highlight this as the most important work to complete.
6. JSON output: `waif next --json` will include an additional `waif.epic_context` object when Epic-aware selection is used. The object MUST include at minimum: `{ "epic_id": "<id>", "epic_status": "in_progress", "selection_reason": "in_progress_child|bv_priority|priority_fallback", "recommended_id": "<id>" }` so automation consumers can detect Epic-scoped recommendations.
7. Tests: add unit tests covering the selection branch (in_progress child preferred; bv-selection fallback; assignee filter interaction) and an integration test that simulates bd outputs and validates both human and JSON output formats.
8. Idempotence & safety: the command must be read-only by default and MUST NOT modify bead state (no auto assignment). Any annotations or comments created by follow-up tooling must be idempotent and opt-in.
9. Idempotence (repeat runs): Running the command repeatedly must not mutate bead state; any proposed annotations or comments remain proposal-only and should be deduplicated by downstream tooling if emitted. Default behavior is proposal-only.

Constraints

- Performance: only direct children and immediate blockers are considered; do not traverse the full graph for v1.
- Determinism: tie-breaking follows the documented ordered fallback.
- Backward compatibility: when no Epic context applies, the existing `waif next` behavior is unchanged.

Implementation notes

- Primary code location: `src/commands/next.ts` — add an Epic-aware selection branch into the existing selection flow.
- Data sources: use `bd show <epic-id>` and `bd list --status=open --json` as needed to enumerate children and blockers; prefer `bd` outputs when available.
- Tests: extend `tests/next.test.ts` with unit tests for the new selection method and add an integration test exercising `--json` output.
- UX examples: add a short human-output example in the PR to guide reviewers.

Related Beads & docs

- Related Beads: wf-70j.5, wf-70j.4, wf-5e2, wf-c2n
- Update NOTE: Ensure PR references `wf-uctv` when opening the implementation PR.

Source issue

- wf-uctv
