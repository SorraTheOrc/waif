# Product Requirements Document

**Source issue:** wf-ba2.3.7

## Summary

Integrate `waif prd` with OpenCode `/prd` to provide a reproducible, local CLI flow that runs interactive or agent-driven PRD authoring, writes auditable Markdown PRDs to the repo, and records idempotent beads links.

## Scope

- Implement a `waif prd` command that invokes OpenCode headless runs and/or attachable servers to drive multi-turn PRD generation.
- Produce atomic, formatted PRD Markdown files under a repository path (default `docs/dev/<name>_PRD.md`).
- Add idempotent beads linking (comment + external-ref) after successful PRD writes.

Out of scope: full OpenCode SDK integration and automatic branch/PR creation unless explicitly requested via `--create-pr`.

## Goals (measurable)

1. `waif prd` can run in interactive human mode and agent mode and write a PRD file to disk.
2. After a successful run, beads issue `wf-ba2.3.7` is updated with a `Linked PRD: <path>` comment and `PRD: <path>` external-ref only once (idempotent).
3. All file writes use atomic writes and `remark` formatting before finalizing.
4. Provide clear error codes and messages for missing dependencies or interrupted sessions.

## Non-goals

- Replacing existing issue-tracking workflows outside of `bd`/beads.
- Storing audit logs in repo by default (they live under `.waif/audit/` and are gitignored unless opt-in).

## Stakeholders

- PMs / writers: run interactive PRD sessions and receive final Markdown.
- Engineers: integrate backend adapter code and tests.
- CI maintainers: add integration test coverage with `opencode` presence gating.

## Requirements

### Functional requirements (explicit)

1. `waif prd --out <path> [--issue <id>] [--interactive|--agent <name>] [--backend <cli|serve|sdk>]` must start a session and produce `<path>` when the session completes.
2. When `--issue <id>` is provided, include `bd show <id> --json` fields `title`, `description`, and `acceptance` in the seed context `seed.json` passed to OpenCode.
3. For `cli` backend the command executed must be exactly: `opencode run --command prd <target> --format json --session <session-id> [--model <model>]` (where `<target>` is a repo-relative path or `.` as appropriate).
4. The tool must support `--session <id>` to resume an existing session directory at `.waif/sessions/<id>/`.
5. For `file-write` events the tool must write to a temporary file in the session dir, run `remark` on that temp file, fsync the file, then rename it over the target path. If the final content equals the existing file content, do not modify mtime.
6. After successful writes run the beads linking algorithm (see below) and record audit metadata in `.waif/audit/<session-id>.json`.
7. Exit codes:
   - `0` on success (session-complete and beads linking attempted or documented),
   - `2` if `opencode` binary is missing when `--backend cli` is selected,
   - `3` on interrupted session saved to `.waif/sessions/<id>/partial.md`,
   - `4` on schema/event parsing errors.

### Non-functional requirements

1. Tests: unit tests for event parsing, beads linking logic (mock `bd`), and atomic file writes.
2. Performance: `serve` backend must reduce session startup overhead (implementation detail for later); default is `cli`.
3. Security: secrets and environment variables must not be written into audit logs; prompts must be redacted.
4. Compatibility: the implementation must run on Linux/macOS shells where `opencode` is available.

## Acceptance criteria (explicit)

- Running `waif prd --interactive --issue wf-ba2.3.7 --out docs/dev/wf-ba2.3.7_PRD.md` completes and writes `docs/dev/wf-ba2.3.7_PRD.md`.
- `bd show wf-ba2.3.7 --json` shows an `external_ref` containing `PRD: docs/dev/wf-ba2.3.7_PRD.md` and a comment exactly matching `Linked PRD: docs/dev/wf-ba2.3.7_PRD.md` (no duplicates after repeated runs).
- `npm test` passes unit tests for newly added modules.

## Architecture Overview (explicit)

Provide a pluggable backend abstraction with three implementations and a clear session lifecycle.

Backends (explicit):
- `cli` (M0): spawn `opencode run --format json` and stream JSON events.
- `serve` (M1): attach to `opencode serve` via HTTP attach endpoint and stream events.
- `sdk` (M2): use `@opencode-ai/sdk` streaming APIs when available.

Core responsibilities:
- Session Manager: create session dir `.waif/sessions/<id>/`, store `seed.json`, and track `session-id`.
- Runner/Adapter: start backend and expose a typed async event stream to the Event Parser.
- Event Parser: validate event shape and map to canonical events.
- Interaction Adapter: prompt terminal user or call local agent handlers and forward answers to the backend.
- File Manager: perform atomic writes and formatting.
- Beads Linker: idempotently comment and update external refs on beads issues.
- Audit Logger: write `.waif/audit/<session-id>.json` with redacted prompts, timestamps, invoker, backend, model, and affected files.

## Component Responsibilities (concise)

- Session Manager
  - Implements: `createSession(seed: object) -> {sessionId, sessionDir}`, `loadSession(sessionId)`.
  - Ensures session dir is in `.gitignore` and not committed.
- Runner/Adapter
  - Implements `start(sessionDir, opts) -> AsyncIterable<Event>` and `sendResponse(token)` API if backend supports stdin/attach.
- Event Parser
  - Validates event JSON, throws parsing error (exit code 4) on invalid required fields.
- Interaction Adapter
  - Terminal: synchronous prompt implementation that returns strings or choice indices.
  - Agent: provides an explicit plugin interface `agent.handleQuestion(q): Promise<answer>`; requires `--allow-agent-permissions` to enable file writes by agents.
- File Manager
  - `writeAtomic(path, content)`: write to `<sessionDir>/tmp/<random>`, format with `remark`, fsync, rename.
- Beads Linker
  - After writes compute `p = path.relative(repoRoot, targetPath)` and run the idempotent algorithm below.
- Audit Logger
  - `log(sessionId, metadata)`: write `.waif/audit/<session-id>.json` with trimmed prompt excerpt (max 8k chars) and prompt hash (SHA256).

## Sequence / Flow (step-by-step)

1. Parse CLI args and validate required inputs (`--out` is required unless `--emit-opencode-cmd`).
2. If `--backend cli` validate `opencode` presence by running `which opencode` or `opencode --version`.
   - If missing: print exact install instructions and exit code `2`.
3. If `--issue <id>` call `bd show <id> --json` and build `seed.json` containing `title`, `description`, `acceptance`, `design`.
4. Create session using Session Manager; write `seed.json` to session dir.
5. Start Runner/Adapter for chosen backend and iterate events:
   - `question`: Interaction Adapter collects answer and forwards to Runner (backend-specific API) as implemented.
   - `file-proposal`: show proposed diff; require explicit acceptance in interactive mode; auto-accept in agent mode only if `--allow-agent-permissions` is set.
   - `file-write`: File Manager writes file atomically and records path in session metadata.
   - `checkpoint`: persist transcript and partial audit data to session dir.
6. On `session-complete`: run `remark` on all written files, compute `affected-files` list, run Beads Linker, write final audit, print JSON summary and exit `0`.

## CLI Specification (flags and behavior)

- `--out <path>` (required unless `--emit-opencode-cmd`): target PRD path (relative to repo root).
- `--issue <id>`: beads issue id to seed context and to link PRD after success.
- `--interactive` (default): prompt human on terminal for `question` events.
- `--agent <name>`: run in agent-driven mode using configured agent plugin.
- `--backend <cli|serve|sdk>`: override backend selection (default: `cli`).
- `--attach <url>`: attach URL for `serve` backend (overrides env `OPENCODE_ATTACH_URL`).
- `--emit-opencode-cmd`: do not spawn a backend; print the exact `opencode run ...` command and exit `0`.
- `--session <id>`: resume session dir `.waif/sessions/<id>/`.
- `--allow-agent-permissions`: explicitly allow agent-driven writes and destructive actions.
- `--format json`: print final summary as JSON to stdout.

Behavioral invariants:
- When `--backend cli` is selected the exact `opencode` invocation must match the functional requirement above.
- All interactive prompts must be cancellable with SIGINT; on first SIGINT ask to save partial transcript and on second SIGINT abort without saving.

## Idempotent Beads Linking (explicit algorithm)

Given beads issue id `I` and PRD path `p` (repo-relative):
1. Call `bd show I --json` and parse `comments[]` and `external_refs[]`.
2. If any comment `text === "Linked PRD: <p>"` exists skip adding a comment.
   - Else call `bd comment I "Linked PRD: <p>"`.
3. If any external ref equals `PRD: <p>` skip update.
   - Else call `bd update I --external-ref "PRD: <p>"`.
4. If `bd` binary is missing, write a `beads_link_needed` entry in the audit log with exact commands to run manually.

All beads operations must be attempted after file writes succeed; failures to run `bd` must not delete the written PRD.

## Audit logging schema (exact)

Write `.waif/audit/<session-id>.json` with:
- `session_id` (string)
- `started_at` (ISO8601)
- `ended_at` (ISO8601 or null)
- `invoker` (username from `git config user.name` or OS user)
- `backend` (cli|serve|sdk)
- `model` (optional)
- `prompt_hash` (hex SHA256)
- `prompt_excerpt` (string, max 8192 chars)
- `affected_files` (array of repo-relative paths)
- `beads_issue` (id or null)
- `beads_links_added` (array of `{type: "comment"|"external-ref", value: string}`)
- `errors` (array of error objects if any)

Prompts must be redacted before storage: remove PEM blocks and tokens using explicit regexes and replace inner content with `REDACTED`.

## File Manager: atomic write procedure (explicit)

For each file write event:
1. Compute `target = repoRoot/<path>`.
2. Compute `tmp = <sessionDir>/tmp/<uuid>.md` and create parent directories.
3. Write content to `tmp`.
4. Run `npx remark --quiet -u remark-preset-lint-recommended <tmp>`; if remark fails, log error and abort write for this file.
5. fsync the file and parent dir (best-effort), then `rename(tmp, target)`.
6. If previous file content equals new content, do not update timestamp (use content compare) and do not record as modified in affected-files list.

## Error handling (explicit)

- Missing `opencode` (`--backend cli`): print "opencode not found; install from https://..." with `opencode --version` suggestion and exit code `2`.
- Schema drift / unexpected event: print raw JSON to `--debug` stream, write event to session dir for inspection, and exit code `4`.
- SIGINT during interactive session: on first SIGINT prompt "Save partial draft and audit? [Y/n]"; if `Y`, write `.waif/sessions/<id>/partial.md` and exit `3`.
- Beads `bd` missing: write a note into `.waif/audit/<session-id>.json` with `beads_link_needed` commands and continue; exit `0` (PRD written) unless other errors occurred.

## Testing Strategy (explicit)

Unit tests (run with `npm test`):
- Event Parser: provide sample JSON events and assert canonical event outputs and error codes.
- Beads Linker: mock `bd` binary responses and assert idempotent behavior.
- File Manager: use temporary repo fixture to test `writeAtomic` behavior and content-equality path.

Integration tests (CI matrix):
- Local integration (runs only when `which opencode` returns success): run `opencode run --command prd --format json` against `.opencode/command/prd.md` canned command and a known seed, assert final PRD content and beads linking.
- Mock integration: simulate `opencode run` stdout with canned JSON stream and assert end-to-end handling.

CI policy: Skip heavy integration when `opencode` not available; add explicit matrix job to run full integration when `opencode` present.

## Migration & Rollout (explicit steps)

1. Implement M0: `cli` backend, Session Manager, Event Parser, File Manager, Beads Linker, Audit Logger.
2. Add unit tests and mock harness; merge to feature branch and open PR.
3. Add integration test harness that mocks `opencode` and add CI gating.
4. Implement `serve` backend and add `--attach` support.
5. Optional: implement `sdk` backend once `@opencode-ai/sdk` is available.

## Security & Privacy (explicit)

- Never commit `.waif/audit/` to repo by default; include `.waif/audit/` in `.gitignore`.
- Redact secrets before writing prompts to audit logs (PEM blocks, tokens, AWS keys, other regex-detected secrets).
- Agents require `--allow-agent-permissions` to perform file writes or destructive actions.

## Open Questions (actionable)

1. Default for audit storage: keep out-of-repo under `.waif/audit/` (recommended). Approve? (yes/no)
2. PR creation policy: implement `--create-pr` opt-in (recommended). Approve? (yes/no)

## Appendix: Commands & Paths

- PRD file path in this work: `docs/dev/wf-ba2.3.7_PRD.md`
- Example opencode invocation (cli backend): `opencode run --command prd . --format json --session <session-id>`
- Beads commands:
  - `bd show <id> --json`
  - `bd comment <id> "Linked PRD: <path>"`
  - `bd update <id> --external-ref "PRD: <path>"`

---

(End of revised PRD)
