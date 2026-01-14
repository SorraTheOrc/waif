---
description: Create or edit a PRD through interview
agent: build
---

You are helping create or update a Product Requirements Document (PRD) for an arbitrary product, feature, or tool.

## Quick inputs

  - The user *must* provide a beads issue id as the FIRST argument.
    - Example input: `/prd id-ab1`
      - Issue id: `id-ab1` (accessed via $1)
    - $ARGUMENTS contains all arguments passed to the command
    - $1 contains the first argument (the beads issue id)
  - The user *may* provide additional freeform arguments AFTER the issue id.
    - Example Input: `/prd id-ab2 Add user authentication feature`
      - Issue id: `id-ab2` (accessed via $1)
      - Example context: `Add user authentication feature` (can be extracted from $ARGUMENTS)
  - If $1 is empty, print "I cannot parse the issue id from your input '$ARGUMENTS'" and ask for the user to provide a seed issue ID in your first interview question (see below).

## Argument parsing

- Pattern: If the raw input begins with a slash-command token (a leading token that starts with `/`, e.g., `/prd`), strip that token first.
- The first meaningful token after any leading slash-command is available as `$1` (the first argument). `$ARGUMENTS` contains the full arguments string (everything after the leading command token, if present).
- This command expects a single beads id as the first argument. Validate that `$1` is present and that `$2` is empty; otherwise, ask the user to re-run with a single bead id argument.

## Hard requirements

- Be environment-agnostic: do not assume tech stack, hosting, repo layout, release process, or tooling.
- Use an interview style: concise, high-signal questions grouped to a soft-maximum of three per iteration.
- Do not invent integrations or constraints; if unknown, ask.
- Respect ignore boundaries: do not include or quote content from files excluded by `.gitignore` or any OpenCode ignore rules.
- Prefer short multiple-choice suggestions where possible, but always allow freeform responses.
- If the user indicates uncertainty at any point, add clarifying questions rather than guessing.

## Seed context

- Read `docs/dev/CONTEXT_PACK.md` if present; otherwise scan `docs/` (excluding `docs/dev`), `README.md`, and other high-level files for product context.
- Fetch and read the issue details using beads CLI: `bd show <issueId> --json`.
- Fetch and read any documents or beads referenced in the issue external references.
- If a PRD already exisgts at the path indicated in the bead then assume we are updating an existing PRD.
- If `bd` is unavailable or the issue cannot be found, fail fast and ask the user to provide a valid issue id or paste the issue content.
- Prepend a short “Seed Context” block to the interview that includes the fetched details and treat it as authoritative initial intent while still asking clarifying questions.

## Process (must follow)

1) Interview

- In interview iterations (≤ 3 questions each) build a full understanding of the work, offering templates/examples informed by repo context where possible.
- If anything is ambiguous, ask for clarification rather than guessing.
- Keep asking the user questions until all core PRD information is captured and clarifications are made.
- Once you feel you are able to do so, write a draft PRD using the template below and including noting any areas that could benefit from further expansion.
- Present the draft to the user and ask the user to review it and provide feedback.
- The user may:
  - Respond with edits or clarifications, in which case you must incorporate them, and go back to the previous step of drafting the intake brief, 
  - Ask you to continue asking questions, in which case you must continue the interview to gather more information, or
  - Approve the current draft, in which case you must proceed to the next step.

2) Automated review stages (must follow; no human intervention required)

After the user approves the draft PRD, run five review iterations. Each review MUST provide a new draft if any changes are recommended and then print a clear "finished" message as follows: 
  - "Finished <Stage Name> review: <brief notes of improvements>"
  - If no improvements were made: "Finished <Stage Name> review: no changes needed"

- General requirements for the automated reviews:
  - Run without human intervention.
  - Each stage runs sequentially in the order listed below.
  - For each stage the command MUST first output exactly: "Starting <Stage Name> review..."
  - When the stage completes the command MUST output exactly: "Finished <Stage Name> review: <brief notes of improvements>"
    - If no improvements were made, the brief notes MUST state: "no changes needed".
  - Improvements should be conservative and clearly scoped to the stage. If an automated improvement could change intent, the reviewer should avoid making that change and instead record an Open Question in the PRD.

- Review stages and expected behavior:

  1) Structural review
     - Purpose: Validate the PRD follows the required outline and check for missing or mis-ordered sections.
     - Actions: Ensure headings appear exactly as specified in the PRD outline; detect missing sections; propose and apply minimal reordering or section insertion to satisfy the outline. If structural changes may alter intent, add an Open Question instead of applying them.
  2) Clarity & language review
     - Purpose: Improve readability, clarity, and grammar without changing meaning.
     - Actions: Apply non-destructive rewrites (shorten long sentences, fix grammar, clarify ambiguous phrasing). Do NOT change intent or add new functional requirements.
     
  3) Technical consistency review
     - Purpose: Check requirements and technical notes for internal consistency with gathered context.
     - Actions: Detect contradictions between Requirements, Users, and Release & Operations sections; where safe, adjust wording to remove contradictions (e.g., normalize terminology). Record unresolved inconsistencies as Open Questions.
     
  4) Security & compliance review
     - Purpose: Surface obvious security, privacy, and compliance concerns and ensure the PRD includes at least note-level mitigations where applicable.
     - Actions: Scan for missing security/privacy considerations in relevant sections and add short mitigation notes (labelled "Security note:" or "Privacy note:"). Do not invent security requirements beyond conservative, informational notes.
     
  5) Lint, style & polish
     - Purpose: Run automated formatting and linting (including markdown lint) and apply safe autofixes.
     - Actions: Run `remark` with autofix enabled, apply whitespace/formatting fixes, ensure consistent bulleting and code block formatting. Summarize what lint fixes were applied.
     
- Failure handling:
  - If any automated review encounters an error it cannot safely recover from, the command MUST stop and surface a clear error message indicating which stage failed and why. Do not attempt destructive fixes in that case; instead record an Open Question in the PRD and abort the remaining automated stages.

- Human handoff:
  - Although the reviews are automated, the output messages and changelog entries MUST be sufficient for a human reviewer to understand what changed and why.

## Editing rules (when updating an existing PRD)

- Preserve the document structure and intent; only change what is necessary.
- If you are making significant structural changes, call them out and ask for confirmation.
- Update the Open Questions section based on what is newly resolved vs still unknown.
- Before signing-off run a markdown lint process using `remark` with autofix enabled.

## Finishing steps (must do)

  - Remove the label: "Status: Intake Completed" ` bd update <bead-id> --remove-label "Status: Intake Completed" --json`
  - Add a Label: "Status: PRD Completed" `bd update <bead-id> --add-label "Status: PRD Completed" --json`
- Run `bs sync` to sync bead changes.
- Run `bd show <bead-id>` (not --json) to show the entire bead.
- End with: "This completes the PRD process for <bd-id>".

## PRD outline (use headings exactly):

# Product Requirements Document

## Introduction

- One-liner
- Problem statement
- Goals
- Non-goals

## Users

- Primary users
- Secondary users (optional)
- Key user journeys

## Requirements

- Functional requirements (MVP)
- Non-functional requirements
- Integrations
- Security & privacy

## Release & Operations

- Rollout plan
- Quality gates / definition of done
- Risks & mitigations

## Open Questions

- List remaining unknowns as questions
