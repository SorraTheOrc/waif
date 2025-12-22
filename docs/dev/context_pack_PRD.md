# Product Requirements Document: Context Pack + `waif context` / `waif ctx`

## Introduction

- One-liner
  - Provide a single, agent-oriented “signpost” document (`docs/dev/CONTEXT_PACK.md`) that gives agents *minimum efficient* context to navigate the repository, plus a CLI command (`waif context` / `waif ctx`) that generates/updates it.

- Problem statement
  - Agents starting work on a new issue need fast, reliable orientation to the project’s structure, rules, and canonical docs.
  - Today that information is fragmented across the repo and is not optimized for agent consumption.
  - Without a stable context pack, agents spend time searching and risk missing critical guardrails.

- Goals
  - Generate/update `docs/dev/CONTEXT_PACK.md` as a stable, consistent entrypoint for agents.
  - Make the document discovery-oriented: links + short guidance, not a full duplication of repo contents.
  - Ensure output respects `.gitignore` boundaries (no leaking ignored content).
  - Keep the context pack “minimum efficient”: avoid fast-changing details and instead link to query mechanisms (e.g., how to query Beads for active work).

- Non-goals
  - A human-friendly onboarding doc (the pack is optimized for agent consumption).
  - Capturing rapidly changing state (e.g., listing current open issues directly in the pack).
  - Defining/automating the “when agents must file a context update request” policy (tracked separately).

> Source issue: wf-ba2.5.4

## Users

- Primary users
  - Workflow agents starting work on a new Beads issue.

- Secondary users
  - Map agent maintaining/refreshing the context pack.
  - PM (indirect): benefits from reduced agent ramp time and fewer workflow mistakes.

## Core UX / Agent contract

- Agents should read `docs/dev/CONTEXT_PACK.md` at the start of each new issue.
- The pack should function as a **signpost**:
  - Each entry is a link to a canonical file/folder (or a specific section within a file).
  - Each entry includes 1–2 bullets describing what the target contains and when to read it.

## Requirements

### Functional requirements

1. CLI surface
   - Provide `waif context` with alias `waif ctx`.
   - Primary action: generate/update `docs/dev/CONTEXT_PACK.md`.

2. Context pack content model
   - The pack MUST include links to:
     - PRDs/specs (by convention under `docs/dev/`)
     - workflow rules (e.g., `docs/Workflow.md`)
     - issue tracking rules (Beads/bd usage)
     - agent roles (e.g., `AGENTS.md`, `@AGENTS.md`)
     - important source folders (e.g., `src/`, `tests/`, `docs/`)
   - Each link entry MUST include 1–2 bullets describing what it is and when to consult it.
   - Large documents MAY be referenced multiple times by linking to specific headings/sections.

3. Exclusion of rapidly changing information
   - The pack MUST NOT directly include fast-changing operational state (e.g., “current open issues”).
   - The pack MUST include references that show agents how to query such state (e.g., `bd ready --json`).

4. Ignore / redaction boundaries
   - `.gitignore` is the primary source of ignore boundaries.
   - The generator MUST NOT include ignored file contents.
   - It MAY include a redacted/omitted note indicating that ignored content exists (without revealing sensitive content).

5. Token budget / overflow
   - Soft limit: ~20,000 tokens.
   - If the generated pack exceeds the soft limit, the command MUST still write the file AND create/update a P0 Beads issue assigned to the PM to prompt a context strategy update/partitioning.

### Non-functional requirements

- Deterministic-ish output
  - Prefer stable ordering to reduce diff noise (exact rules TBD).
- Safety
  - Never exfiltrate ignored content.
- Idempotence
  - Re-running generation should update in place rather than producing duplicate sections.

## Open questions

1. How should “~20,000 tokens” be measured (rough heuristic vs tokenizer)?
2. What is the minimal required section outline (headings) for `docs/dev/CONTEXT_PACK.md`?
3. Overflow P0 issue strategy: single long-lived P0 updated each time vs new P0 per overage?
4. Should the generator enumerate PRDs/specs by scanning `docs/dev/*PRD*.md`, or use a curated allowlist?

## Appendix

- Related issues
  - wf-7cn (Docs: implement Context Pack command + template)
  - wf-ba2.5.1 (.gitignore guards for reads/writes)
  - wf-ba2.5.2 (context selection strategy)
  - wf-ba2.5.5 (instruct agents to file context update requests)
