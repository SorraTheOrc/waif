# Product Requirements Document: Context Pack + `waif context` / `waif ctx`

## Changelog

- 2025-12-30: Merged content from docs/dev/prd-context.md (context selection & eligibility) into this canonical PRD to avoid duplication. See history/prd-context.md for the original draft.

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

## Context selection & eligibility

This section consolidates the eligibility, selection heuristics, redaction and packaging guidance necessary for implementers to select repository content safely and consistently.

### Purpose

This guidance defines which repository content may be used as "context" by agents, CLI commands, and context-pack tooling. It provides clear eligibility rules, redaction/safety guidance, token/size thresholds, and usage instructions so that automated systems and humans consistently select, summarize and surface repository content without exposing secrets or exceeding token budgets.

### Scope

Applies to:
- Documents and operational docs under docs/, including PRDs, HOWTOs, and process guides.
- Top-level repository files that provide project context (README.md, CONTRIBUTING.md, LICENSE).
- Selected configuration files under config/, .github/workflows, and .opencode that are non-secret and relevant to agent behavior.
- Small, human-readable source snippets when necessary for decisions (examples, select modules) after secret checks.

Does NOT apply to:
- Files matched by .gitignore (these MUST NOT be treated as context).
- node_modules, build outputs, or other generated artifacts.
- Binary assets (images, videos, large archives) unless an explicit, approved exception exists.
- Secret or private material (.env files, credentials, private keys, or files named secret*).

### Eligibility rules (checklist)

1. Is the file tracked by git and not matched by .gitignore? If not, exclude it.
2. Is the file a text-based, human-readable document (markdown, JSON, YAML, TOML, XML, plaintext, source code)? If binary, exclude by default.
3. Does the file contain credentials, private keys, or likely secrets? If so, redact or exclude (see Redaction rules).
4. Is the file’s size within per-file limits? If over the per-file soft limit, summarize and include a pointer instead of full content.
5. Is the content relevant to the request (keyword match, mentions issue id/agent names, or explicitly referenced by a PR/issue)? Prefer relevance heuristics before including source.

### Allowed / Disallowed examples

- Allowed examples: README.md, docs/PRD-command-in-progress.md, docs/dev/context_selection_strategy.md, .opencode/command/*.json (if no secrets), .github/workflows/ci.yml
- Disallowed examples: .env, secret-keys.json, credentials.yml, node_modules/**, dist/**, large binary assets

### Token and size thresholds

- Per-file soft limit: 100 KB (approx. 2–4k tokens). If a file exceeds this, do NOT paste it in full — create an automated summary and include the path.
- Per-file hard limit for inclusion: 1 MB. Files larger than this must never be included fully; only summaries and pointers are allowed.
- Context pack (total) soft token budget: ~20,000 tokens. If the combined selection exceeds this, include prioritized summaries and path pointers rather than full file contents.

### Packaging rules

- Always prefer references and short excerpts over pasting full files.
- For large but relevant files, produce an automated summary (see Summarization guidance) and include the summary with a path link.
- Include file metadata lines for each included file: path, file-type, size in bytes, excerpt length, and a short relevance reason.

### Repository tracking metadata (Beads)

- Include only minimal Beads metadata (id, title, status, labels, external_ref, updated_at and a trimmed notes line) when it helps traceability. Do not include the full .beads/issues.jsonl or verbose internal notes. Agents should prefer a live bd/CLI query for current state; if a snapshot is embedded, include an explicit timestamp and redact/truncate notes over 200 characters.

### Redaction and safety rules

- Never include credentials, private keys, tokens, or secrets. Apply automated redaction for common patterns (API keys: "sk-", "AKIA", "ghp_", long alphanumeric tokens; PEM/PRIVATE KEY blocks: "-----BEGIN PRIVATE KEY-----" / "-----END PRIVATE KEY-----"; common names: password, secret, credentials, key, token).
- When redaction occurs, replace the sensitive span with "[REDACTED]" and include a short audit note about the redaction (path + line number range).
- Trim very long inline values (long strings) to 200 characters and mark as trimmed.
- Prefer: "path + excerpt + summary" to avoid pasting sensitive blobs.

### Selection heuristics and priorities

When building a context pack, apply the following ordering (stop when budget exhausted):
1. Docs and PRDs (docs/): README, CONTRIBUTING, PRDs, design docs
2. CI and workflow config (.github/workflows/) and project-level config (package.json, tsconfig)
3. .opencode/ definitions and agent configuration
4. Small source files or snippets directly referenced by the request or PR
5. Tests and fixtures only if they clarify behavior needed for the request

Relevance heuristics (include a file when any are true):
- The file name or contents mentions the issue id (wf-), agent name, or explicit keywords from the PR/request
- The file contains configuration keys or examples that materially affect behavior
- The file is linked or referenced in the PR/issue under review

### Summarization guidance

- For files that are relevant but exceed per-file soft limits, generate a structured summary with:
  - Purpose/role of the file in one sentence
  - Top-level keys, exported functions, or module responsibilities (list)
  - Notable constants, configuration knobs, or env vars in the file
  - If code, list exported functions/classes with one-line descriptions and signatures where reasonable

### CLI / tooling usage

The CLI or agent implementing context selection should:
1. Compute candidate files by scanning the repo for tracked files (respecting .gitignore)
2. Filter by file-type and size rules
3. Score candidate files for relevance using keyword matches and recency
4. Assemble context pack in priority order until token budget reached
5. For any large file selected, auto-generate a summary instead of embedding the full content
6. Produce an audit manifest listing included files, excerpts, trimming/redactions and reasons

### Acceptance criteria (definition of done)

- The canonical PRD (this file) contains an explicit eligibility checklist (allowed / disallowed) and at least two concrete examples
- Provides token/size thresholds and redaction rules
- Contains a short "how to use" section for CLI/agents
- References bead wf-ba2.5.2
- No source code or tests were modified (docs-only)
- Includes guidance for minimal Beads metadata allowed in context packs (id, title, status, labels, external_ref, updated_at) and an example manifest

### How maintainers use this document

- Update this doc when new file-types or special-cases are needed (e.g., including design assets)
- Use the audit manifest to triage accidental exposure of secrets
- If stricter limits are required for particular integrations, add a named profile (e.g., "low-bandwidth" or "strict") with adjusted budgets

### Notes and references

- Beads issues: wf-ba2.5.2 (selection rules), wf-ba2.5.4 (Context Pack PRD)
- Related docs: docs/Workflow.md, docs/dev/PRD-command-in-progress.md
