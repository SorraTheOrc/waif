---
description: Create an intake brief (Workflow step 1)
tags:
  - workflow
  - intake
agent: build
---

You are running Workflow step 1: intake brief (see `docs/Workflow.md`, step 1).

Purpose

- Create a new bead with a description that is a focused, planning-ready intake brief suitable as a seed to the authoring of a PRD (no meta-review notes)
- Use an interview-driven approach to capture intent, constraints, success criteria, and related work.

Quick inputs

- The user may optionally provide a short working title or a single-line intake phrase as $ARGUMENTS.
  - Example: `/intake As a product manager I need to add an onboarding tutorial so that new users complete setup faster`
- If $ARGUMENTS is empty, the command must ask one brief question to obtain a working title before starting the interview.

Argument parsing (must do)

- Treat $ARGUMENTS as a single freeform string (do not attempt to parse CLI flags).
- From the string, attempt to detect an `issueId` token (first token matching `^bd-[A-Za-z0-9]+$` or `^beads-[A-Za-z0-9-]+$`) and a `targetPath` token (first token containing `/` or ending in `.md` or resolving to an existing file/dir).
- If multiple plausible tokens exist, ask the user to confirm which to use.

Hard requirements

- Use an interview style: concise, high-signal questions grouped to a soft-maximum of three per iteration.
- Do not invent requirements or constraints; if unknown, ask the user.
- Respect ignore boundaries: do not include or quote content from files excluded by `.gitignore` or OpenCode ignore rules.
- Prefer short multiple-choice suggestions when helpful, but always allow freeform responses.
- Keep interactions efficient: aim to finish the interview in 3–9 concise questions total unless the user requests more.

Seed context (when an issueId is provided)

- Fetch issue details via beads: `bd show <issueId> --json` and surface at minimum: `title`, `description`, `acceptance`, and `design`.
- Prepend a short "Seed Context" block to the interview and treat it as authoritative initial intent while still asking clarifying questions.
- If `bd` is unavailable, fail fast and ask the user to paste the relevant issue content.

Process (must follow)

1) Gather context (agent responsibility)

- Read `docs/dev/CONTEXT_PACK.md` if present; otherwise scan `docs/`, `README.md`, and other high-level files for product context.
- Derive 2–6 keywords from the user's working title and early answers to guide repository and Beads searches.

2) Interview (human-provided content)

- In interview iterations (≤ 3 questions each) gather the following core fields, offering templates/examples informed by repo context where helpful:
  - Problem (one paragraph): What is the problem or opportunity? Who experiences it?
  - Success criteria (one paragraph): How will we know this work succeeded? Prefer measurable targets or a clear done-test.
  - Constraints (one paragraph): Compatibility/compatibility expectations, non-goals, known blockers.
  - What exists today / desired change (if this is an update): Briefly describe current behavior and the desired change.
- If anything is ambiguous, ask for clarification rather than guessing.

3) Repo & Beads search (agent responsibility)

- Use derived keywords to search source and docs for related artifacts and to surface possible duplicates:
  - Scan `docs/`, `README.md`, and `src/` (or equivalent top-level code folders).
  - Use ripgrep (`rg`) where available. If `rg` is unavailable, use a best-effort scan and ask the user to install `rg` for future runs.
- Search Beads for related issues (`bd list --status open --json | rg -i "<keyword>"`) and `bd ready` when appropriate.
- Output clearly labelled lists:
  - "Likely duplicates / related docs" (file paths)
  - "Related issues" (ids + titles)
- If a single existing artifact clearly represents the work, prefer UPDATE over NEW and ask the user to confirm.

4) Clarifying questions (agent responsibility)

- Produce a short list (0–7) of clarifying questions that would unblock PRD creation or updating.
- Keep questions actionable and specific. When possible, provide suggested short answers (Y/N or 3-option choices).

5) Decide next step (agent + user confirmation)

- Recommend NEW PRD or UPDATE and confirm with the user.
- If UPDATE: propose the PRD file path to update; if uncertain, ask the user to confirm the path.
- If NEW: propose a PRD filename under `docs/dev/` using the convention `docs/dev/<feature>_PRD.md` and ask the user to confirm.

6) Draft "Key details" (agent responsibility)

- Produce a short, copy-pastable "Key details" draft suitable for the Beads issue description. Use this template:
  - Problem
  - Users
  - Success criteria
  - Constraints
  - Existing state (if applicable)
  - Desired change (if applicable)
  - Likely duplicates / related docs
  - Related issues (Beads ids)
  - Clarifying questions
  - Recommended next step (NEW PRD at: <path> OR UPDATE PRD at: <path>)

- Present the draft to the user and ask for any alterations or clarifications. Do not proceed until the user approves the draft or supplies edits.

7) Five mini-review stages (agent responsibility; must follow)

- After the user approves the Key details draft, run five review iterations. Each review MUST print a clear "starting" and "finished" message using the exact pattern used by the PRD command: 
  - "Starting <Stage Name> review..."
  - "Finished <Stage Name> review: <brief notes of improvements>"
  - If no improvements were made: "Finished <Stage Name> review: no changes needed"

- The five Intake review mini-prompts (names and intents):
  1) Completeness review
     - Ensure Problem, Success criteria, Constraints, and Suggested next step are present and actionable. Add missing bullets or concise placeholders when obvious.
  2) Capture fidelity review
     - Verify the user's answers are accurately and neutrally represented. Shorten or rephrase only for clarity; do not change meaning.
  3) Related-work & traceability review
     - Confirm related docs/issues are correctly referenced and that the recommended next step references the correct path/issue ids.
  4) Risks & assumptions review
     - Add missing risks, failure modes, and assumptions in short bullets. Do not invent mitigations beyond note-level comments.
  5) Polish & handoff review
     - Tighten language for reading speed, ensure copy-paste-ready commands, and produce the final 1–2 sentence summary used as the issue body headline.

- For each review stage the agent should apply only conservative edits. If a proposed change could alter intent, add a clarifying question instead of changing content.
- Record a one-line summary of edits made during each stage.

8) Present final artifact for approval (human step)

- After the five reviews, present:
  - The 1–2 sentence headline summary for the issue
  - The full intake brief (Key details) in Markdown
  - A short list of the five review summaries (one line each)
  - Any remaining Open Questions (if present)

- Ask the user to approve the final artifact or request further changes. Do not create the Beads issue until the user gives explicit approval.

9) Create or update the Beads issue (must do)

- When the user approves, create a Beads issue (or update an existing one). The issue must:
  - Type: `feature`
  - Priority: default `2` unless user indicates otherwise
  - Title: the working title (confirm with user)
  - Description: include the full intake brief (Key details) in Markdown
- If creating a new issue and a parent is suitable, create it as a sub-issue (`--parent <id>`).
- Link related issues/documents with `bd dep add` as appropriate.

10) Closing (must do)
- Remove all temporary files created during the process.
- Record the new issue id, a 1–2 sentence summary, and close by printing: "This completes the Intake process for <bd-id>".

Traceability & idempotence

- When the agent updates or creates a Beads issue, it must do so idempotently: running the command again should not create duplicate links or duplicate clarifying-question entries.
- If an `issueId` was provided as a seed, include a `Source issue: <issueId>` reference near the top of the issue description.

Editing rules & safety

- Preserve author intent; where the agent is uncertain, add a clarifying question instead of making assumptions.
- Keep edits minimal and conservative.
- Respect `.gitignore` and other ignore rules when searching the repo.
- If any automated step fails or is ambiguous, surface an explicit Open Question and pause for human guidance.

When finished

- Print the Beads issue id and a 1–2 sentence summary.
- Do not proceed to writing the PRD for this intake issue.
- End with: "This completes the Intake process for <bd-id>".
