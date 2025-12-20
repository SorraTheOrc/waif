# Product Requirements Document

**Source issue:** wf-ba2.3.7

## Introduction

- One-liner
  - Integrate WAIF with OpenCode to enable interactive CLI-driven PRD authoring.

- Problem statement
  - The existing `waif prd` command is deterministic but not integrated with the OpenCode PRD agent workflow (`/prd`). PMs and agents lack a single, local-first CLI path that runs an interactive interview (human-in-loop or agent-driven) and produces auditable PRD files with reliable beads linkage.

- Goals
  - Provide a reproducible, local CLI flow where `waif prd` can invoke the OpenCode `/prd` workflow, drive multi-turn interview loops (human or agent), and write PRD Markdown files on disk.
  - Ensure two-way, idempotent beads ↔ PRD traceability so PRD authorship and provenance are machine- and human-readable.
  - Fail fast with clear, actionable errors when OpenCode is not available or misconfigured.

- Non-goals
  - Ship a full OpenCode Node SDK integration in this work; SDK-based integration is a future migration path.
  - Hide automated edits; all PRD edits must be written to disk and auditable.

## Architecture (improved)

This section defines an architectural blueprint and component responsibilities for a robust, maintainable integration.

Components

- Backend Abstraction (pluggable)
  - Purpose: provide a single interface for driving OpenCode sessions regardless of integration approach.
  - Implementations:
    - `cli` — spawn `opencode run` with `--format json` (primary implementation for M0).
    - `serve` — attach to a long-running `opencode serve` HTTP server (performance optimization for CI or repeated runs).
    - `sdk` — use `@opencode-ai/sdk` programmatic client when available (future/migration path).
  - Benefits: allows incremental improvements and switching implementations with minimal impact to the rest of the codebase.

- Session Manager
  - Manages session lifecycle (create, continue, abort, persist session metadata to disk under `.waif/sessions/`), maps session IDs to temp dirs, and enforces atomic commit rules.
  - Responsibilities: create `seed.json`, generate `session-id`, ensure session dir respects `.gitignore`.

- Opencode Runner / Adapter
  - For `cli` backend: spawn `opencode run --command prd $TARGET --format json --session $ID [--model ...]` and stream JSON events.
  - For `serve` backend: attach to HTTP endpoint (see `opencode serve` docs) and use server attach/continue API.
  - For `sdk` backend: use client streaming APIs (if available) for lower latency and richer control.

- Event Parser
  - Deterministic parser for the JSON event stream. Normalizes event types into a stable internal event model with the following canonical events: `question`, `choice`, `message`, `file-proposal`, `file-write`, `checkpoint`, `session-complete`, `error`.
  - Validates event schema and emits errors for unexpected payloads.

- Interaction Adapter
  - Terminal (human-in-loop): presents `question` events to the user, supports multi-choice and free-text answers, and posts answers back to the session via the backend adapter (CLI stdin or HTTP API).
  - Agent (autonomous): maps `question` events to configured agent handlers (local subagent or external agent process). Agents may be sandboxed and are only allowed specific permissions.

- File Manager
  - Accepts `file-proposal`/`file-write` events and performs atomic writes: write to temp file, fsync, remark autofix, rename over target.
  - Computes and returns affected-files list for audit logs.

- Beads Linker (idempotent)
  - Adds `Linked PRD: <path>` comment and `PRD: <path>` external-ref to the beads issue.
  - Algorithm: fetch the issue (`bd show <id> --json`), check `comments` and `external_refs` for an exact match; only add when missing.

- Audit Logger
  - Stores redact-safe session metadata and prompt excerpts (hash + truncated excerpt) in a per-session audit log under `.waif/audit/` or configured audit location.
  - Applies redaction rules (prompt redaction/truncation to 8k chars) and stores metadata: timestamp, invoker, backend, model, session-id, affected-files, bead-links.

- Config & Secrets
  - Respect OpenCode environment config (e.g., `OPENCODE_CONFIG`, provider API keys) and provide clear guidance on required env vars: `OPENCODE_*` keys and optional `OPENCODE_ATTACH_URL` for `serve` backend.

Architecture notes and rationale

- Pluggable backend avoids locking into CLI-only behavior and prepares for an SDK/serve migration.
- Persistent session metadata simplifies resuming partial interviews and supports `waif prd --session` semantics.
- Deterministic event parsing reduces chance of flakiness when the JSON schema evolves; include feature-toggled lax-parsing for early compatibility.

## Overview / Sequence (refined)

1. Validate invocation and environment.
   - verify `--out` or output directory.
   - verify bead id if provided (`wf-ba2.3.7`).
   - verify `opencode` availability when using `cli` backend (`which opencode` or `opencode --version`).
2. Build seed context:
   - if `--issue <id>`: `bd show <id> --json` and include `title`, `description`, `acceptance`, `design` in `seed.json`.
   - if `--prompt-file`/`--prompt` provided: include contents/metadata in `seed.json`.
3. Create session via Session Manager, reserve `session-dir` and `session-id`.
4. Start Opencode Runner for chosen backend; stream JSON events into Event Parser.
5. Loop on events:
   - `question`: Interaction Adapter collects answer (terminal or agent) and sends it back.
   - `file-proposal`: show preview and await acceptance (interactive) or auto-accept in agent mode.
   - `file-write`: File Manager writes file atomically.
   - `checkpoint`: save session transcript + audit log.
6. On `session-complete`: run `remark` autofix on written files, compute affected files, beads linking, emit final JSON summary and exit 0.

## CLI UX (examples) — refined

- Human interactive (default):
  - `waif prd --interactive --issue wf-ba2.3.7 --out docs/dev/wf-ba2.3.7_PRD.md`
- Agent-driven (autonomous):
  - `waif prd --agent builder-bot --model gpt-4o --issue wf-ba2.3.7 --out docs/dev/wf-ba2.3.7_PRD.md`
- Continue existing session (resume):
  - `waif prd --session <session-id> --out docs/dev/wf-ba2.3.7_PRD.md`
- Use attach to long-running server for speed (dev/CI):
  - `waif prd --backend serve --attach http://localhost:4096 --issue wf-ba2.3.7 --out docs/dev/wf-ba2.3.7_PRD.md`
- Emit command-only fallback (no spawn):
  - `waif prd --emit-opencode-cmd --issue wf-ba2.3.7 --out docs/dev/wf-ba2.3.7_PRD.md`

Notes:
- Default backend is `cli`. Detect `OPENCODE_ATTACH_URL` or `--attach` to prefer `serve` backend.
- Provide `--format json` for machine-readable final summary.

## Idempotence & Linking (concrete algorithm)

1. After successful write, compute canonical PRD path `p` (relative to repo root).
2. Fetch issue state: `bd show <id> --json`.
3. If `comments` array contains exact string `Linked PRD: <p>`, skip `bd comment`.
   - Otherwise: `bd comment <id> "Linked PRD: <p>"`.
4. If `external_refs` (or `externalRef` equivalent) contains `PRD: <p>`, skip `bd update`.
   - Otherwise: `bd update <id> --external-ref "PRD: <p>"`.
5. Ensure operations are run after `bd` is available; if `bd` missing, emit instructions and add the information to the audit log for manual linking.

## Error Handling (expanded)

- Missing `opencode` (CLI backend):
  - Detect via `which opencode` or `opencode --version`.
  - Exit with clear message and link to OpenCode install command and `opencode --version` output.
  - Suggest alternate flows: `--emit-opencode-cmd` or `--backend serve` (if attach URL present).

- Missing model/auth: detect OpenCode provider auth status via `opencode auth list` where possible; otherwise surface provider-specific hints and log missing env vars.

- Interrupted session (SIGINT):
  - Prompt: "Save partial draft and audit? [Y/n]"; if yes, persist current session transcript to `.waif/sessions/<id>/partial.md` and audit log.
  - Close child processes and exit non-zero with actionable note.

- Partial file write: use atomic write and only mark session-complete after all writes succeed and `remark` finished. On failure, revert temp files and log error.

- Unexpected JSON events/schema drift: switch to graceful fallback mode (print raw JSON to `--debug` output and stop the session), advise upgrade or toggle `--lax-parsing` to continue.

## Testing strategy (detailed)

- Unit tests
  - Command-line arg parsing for all flags and backend selection.
  - Event Parser unit tests for canonical events.
  - Beads Linker logic with a mocked `bd` binary (validate idempotence checks).
  - File Manager (atomic write) with virtual FS or temp dir tests.

- Integration tests
  - Local-only tests: gated with `OPENCODE_AVAILABLE=true` or `which opencode` check. Run `opencode run --command prd --format json` against a canned `.opencode/command/prd.md` and a known seed to validate end-to-end behavior.
  - Serve-backed tests: start `opencode serve` in background in CI job and `waif prd --backend serve --attach` to exercise attach path.

- Mocks & CI
  - Provide a test helper to mock `opencode run` JSON event streams to validate interaction flows without OpenCode installed.
  - CI: skip heavy integration when `opencode` not available; use a matrix job that runs the full integration when `opencode` tool is available.

## Audit schema (example)

- Stored per session as JSON (redacted):
  - session_id
  - started_at
  - ended_at
  - invoker (username)
  - backend (cli|serve|sdk)
  - model
  - prompt_hash
  - prompt_excerpt (truncated 8k)
  - affected_files [path]
  - beads_issue: wf-ba2.3.7
  - beads_links_added [comment, external-ref]

## Fallbacks and migration path

- Fallback: `--emit-opencode-cmd` prints the exact `opencode run` invocation to stdout for manual execution in environments where spawning is disallowed.
- Migration: when `@opencode-ai/sdk` usage becomes stable in the environment, add `sdk` backend implementation that uses client streaming and richer session control. The Backend Abstraction hides differences so CLI UX remains stable.

## Security & privacy (refined)

- Respect `.gitignore` and OpenCode config; never include ignored files in prompts.
- Prompt redaction: strip obvious secrets (PEM blocks, tokens) and log only truncated excerpts + prompt hash.
- Agent permission model: agents used with `--agent` run in a limited permission mode; require explicit `--allow-agent-permissions` for dangerous file writes.

## Open Questions (updated)

- Should we automatically create the branch + PR for PRD writes (preferred) or require an explicit flag `--create-pr`? (Implement `--create-pr` opt-in for first iteration.)
- Should audit logs be committed to git or kept out-of-repo (default: out-of-repo under `.waif/audit/` and ignored by git)?
- Who configures agents and credentials in multi-developer environments (per-user env or repo config)? Recommend per-user env and optional `.opencode/mcp` configs.


---

Assumptions (unchanged)

- Use-case is focused on local, repo-based PRD authoring seeded by beads issue `wf-ba2.3.7`.
- Default backend is `cli` using `opencode run --format json` with a pluggable backend architecture for future SDK/serve integration.
- The PRD file will be written to `docs/dev/wf-ba2.3.7_PRD.md`.


---

(End of revised draft)
