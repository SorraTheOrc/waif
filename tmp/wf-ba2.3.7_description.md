Design: integrate waif CLI with OpenCode PRD agent

Goal
- Allow the Node/TypeScript `waif` CLI to initiate and run an interactive PRD authoring session driven by the OpenCode `/prd` command (see `.opencode/command/prd.md`).

Integration approach (required)
- M0 (cli backend): `waif prd` must spawn `opencode run --command /prd --format json --session <session-id>` and mediate the interactive event loop.
- Waif mediates the interactive flow: display agent questions, collect answers, send answers back to `/prd` via stdin piping (M0), present file proposals, perform atomic writes, and acknowledge file-write events.

Example exchange (designer <-> PRD agent via waif)
1) Invocation
- Designer: `waif prd --issue wf-ba2.3.7 --out docs/dev/wf-ba2.3.7_PRD.md`
- Waif: spawn `opencode run --command /prd --format json --session <session-id>` and stream JSON events.

2) Question (agent -> waif -> designer)
- opencode event:
  { "type": "question", "id": "q1", "text": "What is the one-line purpose of this feature?" }
- waif: prints the question and prompts the designer; designer answers in terminal.
- waif -> opencode (stdin): { "type": "answer", "questionId": "q1", "text": "Add a headless PRD authoring flow that integrates opencode /prd with waif CLI." }

3) File proposal (preview)
- opencode event:
  { "type": "file-proposal", "id": "f1", "path": "docs/dev/wf-ba2.3.7_PRD.md", "preview": "### Purpose\nAdd a headless PRD authoring flow..." }
- waif: shows preview and prompts `accept? [y/N]`; designer replies `y`.
- waif -> opencode (stdin): { "type": "file-accept", "fileId": "f1", "accepted": true }

4) File write (agent -> waif)
- opencode event:
  { "type": "file-write", "id": "w1", "path": "docs/dev/wf-ba2.3.7_PRD.md", "content": "<full markdown>" }
- waif: atomic write (tmp -> remark -> fsync -> rename), record in audit, reply: { "type": "file-written", "fileId": "w1", "status": "ok" }

5) Session complete
- opencode event: { "type": "session-complete", "summary": { "files": ["docs/dev/wf-ba2.3.7_PRD.md"] } }
- waif: run `npx remark` on written files, compute affected files, idempotently link with beads (`bd comment` + `bd update --external-ref`), write `.waif/audit/<session-id>.json`, emit final JSON summary, exit 0.

Mediation & safety decisions (explicit)
- Answer transport: use stdin piping to `opencode run` for M0; `serve` backend uses attach API.
- File-proposal acceptance: interactive requires explicit human acceptance; agent-driven runs auto-accept only with `--allow-agent-permissions`.
- Path safety: reject proposals whose `path` resolves outside repo root; log rejection to audit and notify user.
- Timeouts: if opencode is idle beyond configured threshold, waif should surface a timeout error and write raw events to session dir for debugging.

Testable checks
- Assert `waif` spawns `opencode run --command /prd --format json` when `--backend cli` is selected.
- Assert atomic write flow results in target file, `npx remark` was run, and `.waif/audit/<session-id>.json` exists.
- Assert beads linking is idempotent using a mocked `bd` in unit tests.

Notes
- This description replaces prior draft text to make `/prd` the canonical driving command and to require that waif fully mediates the interactive flow.
- Implementation tasks: Session Manager, CLI adapter (stdin piping), Event Parser, Interaction Adapter, File Manager, Beads Linker, Audit Logger, tests.
