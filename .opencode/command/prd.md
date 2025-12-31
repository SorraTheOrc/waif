---
description: Create or edit a PRD through interview
agent: build
---

You are helping create or update a Product Requirements Document (PRD) for an arbitrary product, feature, or tool.

First decision (must do): decide whether to CREATE a new PRD or EDIT an existing one.

How to decide:

- If the user provides an explicit path to an existing PRD file, EDIT that file.
- If the user provides a directory path, propose a new PRD filename in that directory (CREATE), unless an obvious existing PRD is present and the user confirms editing.
- If the repo already contains a PRD that matches the described product (based on title/filename), propose editing it and ask for confirmation.
- If the user provides no path or additional information, ask ONE question: "Create a new PRD, or update an existing PRD? If update, what file path?"

Inputs:

- The user may optionally provide arguments as `$ARGUMENTS`.
  - `$ARGUMENTS` can include:
    - a PRD target path (existing file = edit; directory = create; or a suggested filename)
    - a beads issue id to use as seed context
  - Arguments can be provided in any order.

Argument parsing (must do):

- Parse `$ARGUMENTS` into tokens.
- Classify tokens into:
  - `issueId`: first token matching `^bd-[A-Za-z0-9]+$` or `^beads-[A-Za-z0-9-]+$`
  - `targetPath`: first token that looks like a file/dir path (contains `/` or ends with `.md`) or resolves to an existing file/dir
- If multiple plausible `issueId` or `targetPath` tokens exist, ask for confirmation rather than guessing.

Hard requirements:

- Be environment-agnostic: do not assume tech stack, hosting, repo layout, release process, or tooling.
- Do not invent integrations or constraints; if unknown, ask.
- Respect ignore boundaries: do not include or quote content from files excluded by `.gitignore` or any ignore rules configured in OpenCode.
- Use the simplest interpretation that fits what the user says.

Beads issue seed context (when `issueId` is provided):

- Fetch the issue details using beads CLI: `bd show <issueId> --json`.
- Use at minimum: `title`, `description`, `acceptance` (if present), and `design` (if present).
- If `bd` is unavailable or the issue cannot be found:
  - Fail fast and ask the user to provide a valid issue id or paste the issue content.
- Prepend a short “Seed Context” block to the interview that includes the fetched details.
- Treat seed context as authoritative initial intent, but still ask clarifying questions.

Process (must follow):

1. Gather context: Read docs/dev/CONTEXT_PACK.md if present, otherwise scan `docs/`, `README.md`, and other high-level files for relevant context about the product/repo.
2. Interview: ask concise, high-signal questions (grouped to a soft-maximum of three questions in each iteration) until you have enough detail to draft or update a useful PRD.
   - If anything is ambiguous, ask clarifying questions without suggested answers.
   - Keep the interview efficient; offer suggested answers when possible, prefer short multiple-choice options when helpful.
   - Avoid open-ended questions unless absolutely necessary.
   - Perform a deeper review of any provided beads issue content and context documents to extract help formulate meaningful questions and suggested responses.
3. Draft or update the PRD in Markdown using the PRD outline below. Use the responses given and additional context gathered to fill in each section comprehensively.
4. Confirm the exact file path(s) that will be written.
5. Write the PRD file(s) to disk.

6. Automated review stages (must follow; no human intervention required):

   After writing the PRD file(s) to disk the command MUST run five automated review stages in sequence. Each stage MUST print a clear "starting" message and a "finished" message. The finished message MUST include a short, plain-text summary of any improvements applied during that stage.

   - General requirements for the automated reviews:
     - Run without human intervention.
     - Each stage runs sequentially in the order listed below.
     - For each stage the command MUST first output exactly: "Starting <Stage Name> review..."
     - When the stage completes the command MUST output exactly: "Finished <Stage Name> review: <brief notes of improvements>"
       - If no improvements were made, the brief notes MUST state: "no changes needed".
     - Improvements should be conservative and clearly scoped to the stage (see descriptions below). If an automated improvement could change intent, the reviewer should avoid making that change and instead record an Open Question in the PRD.

   - Review stages and expected behavior:

     1) Structural review
        - Purpose: Validate the PRD follows the required outline and check for missing or mis-ordered sections.
        - Actions: Ensure headings appear exactly as specified in the PRD outline; detect missing sections; propose and apply minimal reordering or section insertion to satisfy the outline.
        - Output messages:
          - Starting Structural review...
          - Finished Structural review: <brief notes of improvements>

     2) Clarity & language review
        - Purpose: Improve readability, clarity, and grammar without changing meaning.
        - Actions: Apply non-destructive rewrites (shorten long sentences, fix grammar, clarify ambiguous phrasing). Do NOT change intent or add new functional requirements.
        - Output messages:
          - Starting Clarity & language review...
          - Finished Clarity & language review: <brief notes of improvements>

     3) Technical consistency review
        - Purpose: Check requirements and technical notes for internal consistency with gathered context.
        - Actions: Detect contradictions between Requirements, Users, and Release & Operations sections; where safe, adjust wording to remove contradictions (e.g., normalize terminology). Record unresolved inconsistencies as Open Questions.
        - Output messages:
          - Starting Technical consistency review...
          - Finished Technical consistency review: <brief notes of improvements>

     4) Security & compliance review
        - Purpose: Surface obvious security, privacy, and compliance concerns and ensure the PRD includes at least note-level mitigations where applicable.
        - Actions: Scan for missing security/privacy considerations in relevant sections and add short mitigation notes (labelled "Security note:" or "Privacy note:"). Do not invent security requirements beyond conservative, informational notes.
        - Output messages:
          - Starting Security & compliance review...
          - Finished Security & compliance review: <brief notes of improvements>

     5) Lint, style & polish
        - Purpose: Run automated formatting and linting (including markdown lint) and apply safe autofixes.
        - Actions: Run `remark` with autofix enabled, apply whitespace/formatting fixes, ensure consistent bulleting and code block formatting. Summarize what lint fixes were applied.
        - Output messages:
          - Starting Lint, style & polish review...
          - Finished Lint, style & polish review: <brief notes of improvements>

   - Traceability after automated reviews:
     - If any file was modified by a review, update the PRD's header or a short changelog section with a one-line entry such as: "Automated review: <Stage Name> applied - <short note>".
     - Maintain idempotence: running the command again must not repeatedly add the same changelog lines.

   - Failure handling:
     - If any automated review encounters an error it cannot safely recover from, the command MUST stop and surface a clear error message indicating which stage failed and why. Do not attempt destructive fixes in that case; instead record an Open Question in the PRD and abort the remaining automated stages.

   - Human handoff:
     - Although the reviews are automated, the output messages and changelog entries MUST be sufficient for a human reviewer to understand what changed and why.


Editing rules (when updating an existing PRD):

- Preserve the document structure and intent; only change what is necessary.
- If you are making significant structural changes, call them out and ask for confirmation.
- Update the Open Questions section based on what is newly resolved vs still unknown.
- Before signing-off run a markdown lint process using `remark` with autofix enbled

PRD traceability (must do):

- If an `issueId` was provided, include a short reference in the PRD such as: `Source issue: <issueId>`.
- After writing the PRD file, ensure the beads issue is updated to reference the PRD. The issue should include a plain-text link in a comment:

  - `bd comment db-id "Linked PRD: <path/to/PRD.md>"`

  This cross-linking must be idempotent (do not add comments when re-running).

- The PRD reference should also be included in the issue external references:

  - `bd update <issueId> --external-ref "PRD: <path/to/PRD.md>"`

- The PRD should clearly contain the `Source issue: <issueId>` reference and the beads issue should contain `Linked PRD: <path>` so traceability is two-way and machine- and human-friendly.

PRD outline (use headings exactly):

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

When you are ready to write:

- Provide a short summary of assumptions.
- Then write the file(s) exactly once.
