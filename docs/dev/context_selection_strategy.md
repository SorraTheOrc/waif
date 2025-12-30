Context selection strategy (wf-ba2.5.2)

Purpose

This document defines which repository content may be used as "context" by agents, CLI commands, and context-pack tooling. It provides clear eligibility rules, redaction/safety guidance, token/size thresholds, and usage instructions so that automated systems and humans consistently select, summarize and surface repository content without exposing secrets or exceeding token budgets.

Scope

This guidance applies to:
- Documents and operational docs under docs/, including PRDs, HOWTOs, and process guides.
- Top-level repository files that provide project context (README.md, CONTRIBUTING.md, LICENSE).
- Selected configuration files under config/, .github/workflows, and .opencode that are non-secret and relevant to agent behavior.
- Small, human-readable source snippets when necessary for decisions (examples, select modules) after secret checks.

This guidance does NOT apply to:
- Files matched by .gitignore (these MUST NOT be treated as context).
- node_modules, build outputs, or other generated artifacts.
- Binary assets (images, videos, large archives) unless an explicit, approved exception exists.
- Secret or private material (.env files, credentials, private keys, or files named secret*).

Eligibility rules (checklist)

1. Is the file tracked by git and not matched by .gitignore? If not, exclude it.
2. Is the file a text-based, human-readable document (markdown, JSON, YAML, TOML, XML, plaintext, source code)? If binary, exclude by default.
3. Does the file contain credentials, private keys, or likely secrets? If so, redact or exclude (see Redaction rules).
4. Is the file’s size within per-file limits? If over the per-file soft limit, summarize and include a pointer instead of full content.
5. Is the content relevant to the request (keyword match, mentions issue id/agent names, or explicitly referenced by a PR/issue)? Prefer relevance heuristics before including source.

Allowed examples

- docs/PRD-command-in-progress.md — allowed (operational PRD)
- README.md — allowed (project overview)
- docs/dev/context_selection_strategy.md — allowed
- .opencode/command/*.json (agent definitions) — allowed if they contain no secrets
- .github/workflows/ci.yml — allowed (CI behavior)

Disallowed examples

- .env, secret-keys.json, credentials.yml — disallowed
- node_modules/**, dist/**, build/** — disallowed
- Large binary assets (images/, media/) — disallowed unless summarized

Token and size thresholds

These are soft defaults; adjust by agreement with the Producer.

- Per-file soft limit: 100 KB (approx. 2–4k tokens). If a file exceeds this, do NOT paste it in full — create an automated summary and include the path.
- Per-file hard limit for inclusion: 1 MB. Files larger than this must never be included fully; only summaries and pointers are allowed.
- Context pack (total) soft token budget: ~20,000 tokens. If the combined selection exceeds this, include prioritized summaries and path pointers rather than full file contents.

Packaging rules

- Always prefer references and short excerpts over pasting full files.
- For large but relevant files, produce an automated summary (see Summarization guidance) and include the summary with a path link.
- Include file metadata lines for each included file: path, file-type, size in bytes, excerpt length, and a short relevance reason.

Redaction and safety rules

- Never include credentials, private keys, tokens, or secrets. Apply automated redaction for common patterns:
  - API keys: patterns like "sk-", "AKIA", "ghp_", long alphanumeric tokens
  - PEM/PRIVATE KEY blocks: "-----BEGIN PRIVATE KEY-----" / "-----END PRIVATE KEY-----"
  - Common names: password, secret, credentials, key, token
- When redaction occurs, replace the sensitive span with "[REDACTED]" and include a short audit note about the redaction (path + line number range).
- Trim very long inline values (long strings) to 200 characters and mark as trimmed.
- Prefer: "path + excerpt + summary" to avoid pasting sensitive blobs.

Selection heuristics and priorities

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

Summarization guidance

- For files that are relevant but exceed per-file soft limits, generate a structured summary with:
  - Purpose/role of the file in one sentence
  - Top-level keys, exported functions, or module responsibilities (list)
  - Notable constants, configuration knobs, or env vars in the file
  - If code, list exported functions/classes with one-line descriptions and signatures where reasonable

Examples

Allowed file example (README.md excerpt):
- path: README.md
- size: 3.1 KB
- excerpt (first 400 chars): "WAIF — workspace assistant for..."
- relevance: provides project goal and high-level architecture

Blocked file example (.env):
- path: .env
- reason: contains environment secrets — excluded

Audit snippet example

- Included: docs/dev/context_selection_strategy.md (path)
- Excerpt: lines 1–20
- Redactions: none

CLI / tooling usage

The CLI or agent implementing context selection should:
1. Compute candidate files by scanning the repo for tracked files (respecting .gitignore)
2. Filter by file-type and size rules
3. Score candidate files for relevance using keyword matches and recency
4. Assemble context pack in priority order until token budget reached
5. For any large file selected, auto-generate a summary instead of embedding the full content
6. Produce an audit manifest listing included files, excerpts, trimming/redactions and reasons

Acceptance criteria (definition of done)

- docs/dev/context_selection_strategy.md exists and is committed
- Contains an explicit eligibility checklist (allowed / disallowed) and at least two concrete examples
- Provides token/size thresholds and redaction rules
- Contains a short "how to use" section for CLI/agents
- References bead wf-ba2.5.2
- No source code or tests were modified (docs-only)

How maintainers use this document

- Update this doc when new file-types or special-cases are needed (e.g., including design assets)
- Use the audit manifest to triage accidental exposure of secrets
- If stricter limits are required for particular integrations, add a named profile (e.g., "low-bandwidth" or "strict") with adjusted budgets

Notes and references

- Beads issue: wf-ba2.5.2
- Related docs: docs/Workflow.md, docs/dev/PRD-command-in-progress.md

