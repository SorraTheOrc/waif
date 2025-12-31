---
description: Create an intake brief (Workflow step 1)
tags:
  - workflow
  - intake
agent: build
---

You are running **Workflow step 1: intake brief** (see `docs/Workflow.md`, step 1).

Goal:

- Capture just enough context to decide whether the work needs:
  - a NEW PRD, or
  - an UPDATE to an existing PRD.
- Create a Beads issue to track the intake brief.
- Record all gathered information in the issue description.

Hard requirements:

- Use an **interview style**.
- Ask concise, high-signal questions.
- Soft-maximum of **three questions per iteration**.
- Do not invent requirements or constraints; if unknown, ask.
- Search the repo for related PRDs/specs and surface likely duplicates.
- Search Beads for related issues.
- Produce a short list of clarifying questions.
- Create a Beads issue to track the brief.

Argument handling:

- The user may optionally provide a short topic/title as `$ARGUMENTS`.
  - If provided, treat it as a working title for the intake brief.
  - Do not attempt to parse flags/options.
- If `$ARGUMENTS` is empty, ask the user for a short working title.

Process (must follow):


1. Interview (human-provided content)

   In multiple iterations (≤ 3 questions each), gather the following information (providing suggestions/examples informed by relevant context
   sources where helpful):

   - Problem (one paragraph)
     - What is the problem / opportunity?
     - Who experiences it (user personas)?
   - Success criteria (one paragraph)
     - What outcomes define success?
     - If possible, include a measurable target or a clear “done” test.
   - Constraints (one paragraph)
     - Compatibility expectations (what must not break)

   If the user indicates this is a change to something existing, also gather:

   - What exists today (current behavior)
   - What should change (desired behavior)
   - Where it likely lives (paths, commands, APIs)

2. Repo search (agent responsibility)

   Use the user’s answers to derive 2–6 keywords. Then search for related artifacts.

   - Search `docs/dev/CONTEXT_PACK.md` if present, Otherwise, scan `docs/`, `README.md`, and other high-level files for relevant context about the product/repo.
     - Use ripgrep where available (where not available use an alternative, but ask the user to install ripgrep).
     - Examples:
       - `rg -n "Product Requirements Document|\bPRD\b" docs/`
       - `rg -n "<keyword1>|<keyword2>" docs/ src/ README.md`
   - Search for related Beads issues covering this topic (duplicates / precursors):
     - Examples:
       - `bd list --status open --json | rg -i "<keyword>"`
       - `bd ready --json | rg -i "<keyword>"`
     - If `rg` is unavailable, use a best-effort alternative and ask the user to install ripgrep.
     - If you find candidates:
       - List them as "Related issues" (ids + titles).
       - If one clearly already represents this work, prefer updating that issue (or creating a child issue) instead of creating a duplicate.
   - If you find candidates:
     - List them as "Likely duplicates / related docs".
     - Ask the user to confirm whether to update one of them.

3. Beads search (agent responsibility)

   Search existing issues for overlaps.

   - Use Beads as the source of truth.
   - Suggested approaches (pick the simplest available in the environment):
     - `bd list --status open --json | rg -i "<keyword>"`
     - If `rg` is unavailable, ask the user whether you should do a broad manual scan (and suggest the user installs ripgrep).

   Output:

   - "Related issues" list (ids + titles) OR explicitly state "No obvious related issues found".

4. Clarifying questions (agent responsibility)

   Produce a short list (0–7) of clarifying questions that would unblock PRD creation/editing.
   Keep them actionable and specific.

5. Decide next step: NEW PRD vs UPDATE

   Decide, then confirm with the user:

   - If UPDATE: identify the file path to update (ask for confirmation if uncertain).
   - If NEW: propose a PRD file path under `docs/dev/`.
     - Convention: `docs/dev/<feature>_PRD.md`.

6. Feedback Gate

  Propose the description of the bead, priority level, parent, related isses etc.

  Ask the user if there are any clarifictions, changes or further research required before proceeding. Carry out any further instructtions before proceeding. 

  Only proceed to the next step if the user gives permission to do so.

7. Draft the intake brief (agent responsibility)

   Compile all gathered information into a well-structured intake brief in Markdown format.

   Use the following template:

   - Problem
   - Users
   - Success criteria
   - Constraints
   - Existing state (if applicable)
   - Desired change (if applicable)
   - Likely duplicates / related docs (file paths)
   - Related issues (Beads ids)
   - Clarifying questions
   - Proposed next step:
     - `NEW PRD` at: `<path>` OR
     - `UPDATE PRD` at: `<path>`
     - Recommended next command: `/prd <path> <new-issue-id>`

8. Review 1 (agent responsibility)

  Complete the **first full draft** of this workflow artifact for the current work item.
  - Be creative and propose strong defaults.
  - If uncertain, present 2-3 alternatives and choose one, explaining why.
  - Keep it actionable: concrete lists, commands, checklists, and examples.
  - Assume the reader wants momentum; do not over-polish yet.

  Output a summary of any changes made during this review.

9. Review 2 (agent responsibilitY)

  Review the full draft for completeness, clarity, and actionability.
  - Ensure all required sections are present and well-structured.
  - Verify that all user-provided content is accurately captured.
  - Check for consistency in terminology and formatting.
  - Refine language for clarity and conciseness.
  - Ensure the proposed next steps are clear and actionable.

  Output a summary of any changes made during this review.

10. Review 3 (Agent responsibility)

  Audit the current artifact for correctness and real-world usability.
  - Add missing constraints, assumptions, and decision points.
  - Add edge cases, failure modes, and "what could go wrong" notes.
  - Ensure steps are testable/verifiable.
  - Remove anything not serving the artifact purpose.

  Output a summary of any changes made during this review.

11. Review 4 (Agent responsibility)

  Polish the artifact for clarity and fast reading.
  - Rewrite unclear sections and tighten wording.
  - Convert paragraphs into bullets/checklists where helpful.
  - Normalize terminology and naming.
  - Ensure examples/commands are copy-pastable and consistent.

  Output a summary of any changes made during this review.

12. Final Review (Agent responsibility)

  Perform a final QA review of the artifact.
  - Check for internal consistency and contradictions.
  - Ensure it aligns with repo conventions and the Workflow doc.
  - Ensure every requirement is actionable and measurable.
  - Emit a final “ready” version with a small list of remaining open questions (if any).

  Output a summary of any changes made during this review, followed by the final artifact content.

13. Create or update the Beads issue (must do)

   Create a new Beads issue, or update an existing issue, so that the description contains the full intake brief and links.

   - Type: `feature`
   - Priority: default to `2` unless the user indicates urgency/risk.
   - Title: `<descriptive working title>`

   The description must contain the final intake brief in Markdown format.

   If there is a suitable parent issue then create the new issue as a sub-issue (use `--parent <id>`).

   - Problem
   - Users
   - Success criteria
   - Constraints
   - Existing state (if applicable)
   - Desired change (if applicable)
   - Likely duplicates / related docs (file paths)
   - Related issues (Beads ids)
   - Clarifying questions
   - Proposed next step:
     - `NEW PRD` at: `<path>` OR
     - `UPDATE PRD` at: `<path>`
     - Recommended next command: `/prd <path> <new-issue-id>`

   If there is a suitable parent issue then create the new issue as a sub-issue (use `--parent <id>`).

   If there are `Related issues`, link them using `bd dep add [issue-id] [depends-on-id] --type related`.

   If this issue is blocked by another then this should be recorded with `bd dep add [issue-id] [depends-on-id] --type blocks`.

14. Finish

   After creating the issue, print:

   - The new Beads issue id
   - A 1–2 sentence summary
   - Close the response with "This completes the Intake process for <dead-id>"
