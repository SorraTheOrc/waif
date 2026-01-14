---
description: Implement a beads issue by id
agent: patch
model: github-copilot/gpt-5.1-codex-max
permission:
  bash:
    "git status*": allow
    "git rev-parse*": allow  
    "git switch*": allow
    "bd*": allow
---

You are implementing a Beads issue in this repository.

## Argument parsing

- Pattern: If the raw input begins with a slash-command token (a leading token that starts with `/`, e.g., `/implement`), strip that token first.
- Pattern: If the raw input begins with a slash-command token (a leading token that starts with `/`, e.g., `/implement`), strip that token first.
- The first meaningful token after any leading slash-command is available as `$1` (the first argument). `$ARGUMENTS` contains the full arguments string (everything after the leading command token, if present).
- This command expects a single beads id as the first argument. Validate that `$1` is present and that `$2` is empty; if not, ask the user to re-run with a single bead id argument.

Project rules (must follow):

- Use `bd` for ALL task tracking; do not create markdown TODOs.
- Keep changes between `git push` invocations minimal and scoped to the issue.
- Validate changes with the most relevant tests/commands available.
- Use a git branch + PR workflow (no direct-to-main changes).
- Ensure the working branch is pushed to `origin` before you finish.
- Do NOT close the Beads issue until the PR is merged.

Context files:

- Tracker workflow: @AGENTS.md
- Copilot rules: @.github/copilot-instructions.md

Live context (do not guess; use this output):

- Current issue JSON: !`bd show $1 --json`
- Git status: !`git status --porcelain=v1 -b`
- Current branch: !`git rev-parse --abbrev-ref HEAD`
- Origin remote: !`git remote get-url origin 2>/dev/null || echo "(no origin remote)"`
- Default origin branch (best effort): !`git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null || true`

Process:

0. Safety gate: handle dirty working tree

   - Before making any changes, check whether the working tree is clean (`git status --porcelain=v1 -b`).
   - If there are _any_ uncommitted changes (modified, staged, or untracked files), **stop and ask the user what to do**. Do not assume changes are irrelevant.
   - Offer clear options and wait for an explicit choice:
     - A) Carry changes into this issue branch (continue as-is).
     - B) Commit current changes first (either on current branch or a separate "prep" branch).
     - C) Stash changes (and confirm whether to pop later).
     - D) Revert/discard changes (only with explicit confirmation).
     - E) Abort implementation so the user can inspect.

1. Understand the issue

   - Restate the acceptance criteria and constraints from the issue JSON.
   - If there are any open or in-progress dependencies/blockers in the beads explain what is missing and ask the user how to proceed.
   - Review the issue `description`, `notes`, and any `comments` for references to PRDs, implementation plans, or other linked docs; if present, open and read those sources before proceeding.
   - Pay special attention to the test and docs beads that will be children of the feature bead (siblings of the implementation bead).

1.1 Definition gate (must do before implementation)

    Before writing any code, confirm the Beads issue is sufficiently well-defined to implement.

    Minimum definition checklist:

    - Clear scope: what is in-scope vs out-of-scope
    - Concrete acceptance criteria (testable, not just aspirational)
    - Constraints/compatibility expectations (if any)
    - Obvious unknowns captured as questions (or resolved)

    If the issue is not sufficiently defined:

    - Stop implementation.
    - Work through the **intake brief interview** first to fully define the work.
       - Use `.opencode/command/intake.md` as the guide for the questions and searches.
       - IMPORTANT: when intake is performed as part of `/implement`, it must **always update the existing issue `$1`**. Do **not** create a new Beads issue.
       - After the intake interview + repo/Beads search, update the current issue so it becomes actionable:
          - Prefer updating the issue `description` and/or `acceptance` with the intake brief output.
          - Example: `bd update $1 --description "<intake brief markdown>" --json`
          - Ensure the updated issue contains: problem, users, success criteria, constraints, related docs/issues, clarifying questions, and testable acceptance criteria.
    - Only resume `/implement` once the work item is clearly actionable.

2. Create a working branch

   - If you are already on a topic branch for this issue, or a parent of this issue, keep it.
   - Otherwise create a new branch named like `feature/$1-<short-suffix>` or `bug/$1-<short-suffix>`.
   - Do not commit directly on `main`.

3. Claim the issue

   - Run `bd update $1 --status in_progress --assignee "$USER" --json`.
   - If `--assignee` is not accepted in this environment, rerun without it.

4. Implement

   - Identify the smallest set of files to change.
   - Review the current souurce code and scenes to understand where the changes need to be made.
   - Make the code changes.
   - If you discover additional required work, create new linked issues using `bd create ... --deps discovered-from:$1 --json`.

5. Validate

   - Author appropriate tests that validate the intended behaviour (see the sibling test beads for guidance).
   - Identify the most relevant tests/validation commands for this issue from the project context and/or issue notes.
   - Run the most specific checks available for the changed area (tests/lint/build).
   - If tests fail, fix the issues before proceeding.
   - Once tests pass pause for user confirmation before proceeding to the next step.

6. Update the docs

   - If the issue has linked PRDs or design docs, update them with a summary of the work done, and references to imprtant files altered during the work.
   - Update any relevant README.md files to reflect changes in usage, setup, or configuration.

7) Automated code review stages (must follow; no human intervention required)

- After implementing the change (before final summary/commit), run five self-review passes on the code. Each review may make small changes to the code, but should not be changing functionality: "Finished <Stage Name> review: <brief notes of improvements>"

- General requirements for the automated reviews:
   - Run without human intervention.
   - Each stage runs sequentially in the order listed below.
   - Keep edits minimal and scoped to the stage; avoid reworking intent or scope.
   - If a change would alter intent (e.g., new behaviour, scope expansion), do NOT apply it automatically; log it as an Open Question instead.
- If any stage identifies significant issues that cannot be fixed automatically, log them as Open Questions for human review.

- Review stages and expected behavior:

   1) Completeness review
      - Purpose: Ensure the implementation covers the acceptance criteria and all necessary files (code, tests, docs) are touched.
      - Actions: Add obviously missing test/doc updates; note uncertain gaps as Open Questions.

   2) Dependencies & safety review
      - Purpose: Check correctness risks from dependencies (init order, null checks, threading, feature flags, config) and build impact.
      - Actions: Add minimal guards or TODOs when clearly required; flag uncertain risks as Open Questions.

   3) Scope & regression review
      - Purpose: Ensure the diff is minimal, avoids unrelated changes, and does not introduce likely regressions.
      - Actions: Remove stray debug code/unrelated edits; note suspected regressions or needed split work as Open Questions.

   4) Tests & acceptance review
      - Purpose: Ensure tests exist and are pass/fail-clear for the change, including representative negative/edge cases when implied.
      - Actions: Tighten assertions; add small missing cases only when obvious; record ambiguous test gaps as Open Questions.

   5) Polish & handoff review
      - Purpose: Make the change ready for handoff/PR: readable code, consistent naming/logging/comments, and updated docs/changelog if applicable.
      - Actions: Standardize formatting/structure; clarify terse comments; ensure instructions for reviewers/runners are present when needed.
   
8. Commit, push and create PR

   - Commit your code changes on the branch (include the Beads id in the commit message).
   - Ensure the commit message is clear and descriptive.
   - Push the branch to `origin`.
   - Create a Pull Request against the default branch of the origin remote.
   - In the PR description, include:
      - A summary of the changes made.
      - A reference to the Beads issue (e.g., `Closes bd#$1`).
      - Any special instructions for reviewers or testers.  

9. Update Beads (do not close)

   - On the parent bead add a Label: "Status: Implementation Committed" ` bd update <bead-id> --add-label "Status: PR Created" --json`
   - Update the issue to include the PR URL using `--external-ref` and/or `--notes`.
   - Keep the issue in `in_progress` until the PR is merged.
   - Run `bd sync` before ending the session.
     - If there are no Beads changes to commit (or you are on an ephemeral branch without upstream), use `bd sync --flush-only`.
   - Output a summary of the goal of the issue and the work done, including a brief summary of changes to each file. Including a link to the PR. Provide hints on how to test any new functionality locally. Ask the user to review the PR and merge when ready.
   - Ask the producer to provide feedback on the implementation and, if ready to do so, to instruct the agent to "land the plane" (merge the PR and close the issue).
