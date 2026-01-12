# Product Requirements Document

## Introduction

* One-liner
  * A lightweight, headless OODA monitor CLI (`waif ooda`) that consumes OpenCode events emitted by an in-repo OpenCode plugin and renders a concise agent status table (agent | Busy/Free | Title) or JSON output. The monitor ingests JSONL events written to `.opencode/logs/events.jsonl` and operates without requiring tmux.

* Problem statement
  * Operators and PM agents currently rely on brittle terminal heuristics (tmux pane inspection) to determine agent status. This is slow and difficult to audit. A simple, event-driven status monitor will provide a canonical, scriptable view and durable audit trail.

* Goals
  * Deliver a first-iteration CLI command that reads OpenCode events and prints a width-aware, read-only table summarizing agent status.
  * Make output human-friendly and scriptable (plain text table or JSON) and persist canonical event snapshots for auditing in `history/`.
  * Keep scope conservative for v1: read-only monitoring that consumes OpenCode events; no automation that sends commands to agents.

* Non-goals
  * Initiating actions on agents (e.g., invoking `waif ask`) — automation is out of scope for v1.
  * Replacing centralized monitoring systems — this is a lightweight, repo-local tool.

## Users

* Primary users
  * Producers, PM agents (Map), and human operators who need quick situational awareness across agents and OpenCode events.

* Secondary users (optional)
  * Developers performing debugging or audits; observers during handoffs; automation engineers planning later automation phases.

* Key user journeys
  * Run a single snapshot: `waif ooda --once` to emit a JSON or table snapshot of current agent state.
  * Observe a live view: run `waif ooda` (or `--interval`) to stream periodic snapshots in the terminal.
  * Audit a period of activity: collect snapshots or append event-derived status records to `history/` for later review.

## Requirements

* Functional requirements (MVP)
  1. CLI surface
     * Provide `waif ooda` with flags: `--interval <seconds>` (default: 5), `--log <path>` to persist probe output (optional), `--json` to emit JSON output, and `--once` to run a single snapshot. The `--interval` default is 5 seconds when streaming.
  2. Event ingestion
     * Ingest OpenCode events from `.opencode/logs/events.jsonl` (JSONL). A lightweight in-repo OpenCode plugin (`.opencode/plugin/waif-ooda.ts`) writes selected events to that file.
     * The ingestion reader MUST be stream-oriented and line-by-line to avoid OOM when logs grow (see `readOpencodeEvents` in `src/commands/ooda.ts`).
  3. Mapping & classification
     * Map OpenCode event types and properties to Busy/Free state using explicit rules (examples below). Keep the mapping configurable for later iterations.
  4. Display
     * Print a width-aware table with columns: Agent | Busy/Free | Title (or emit JSON when `--json` is passed). Include derived fields used for audits.
  5. Logging & snapshots
      * When `--log <path>` is provided, append a snapshot JSON (canonical object) to the chosen file under `history/` by default (e.g., `history/ooda_snapshot_<ts>.jsonl`). Recommended snapshot shape for `--log`: { "time": "<ISO8601>", "agent": "<agent>", "status": "Busy|Free", "title": "<short title>", "reason": "<event.type>" }. Do NOT include full message bodies in persisted snapshots. Retention: write timestamped snapshot lines/files under `history/` (e.g., `history/ooda_snapshot_<ts>.jsonl`) for auditability; do not overwrite a single canonical file in v1. Rotation and cleanup policies can be specified in a future maintenance task.
  6. Safety & read-only
     * The command must not send instructions to agents in v1. Any automation capability must be gated and require explicit review.

* Non-functional requirements
  * Low overhead: default polling interval 5s with jitter; backoff to longer intervals (e.g., 60s) after N cycles of no change.
  * Streaming-safe: reader must operate line-by-line and retain only the reduced latest-per-agent set in memory.
  * Terminal-friendly: handle narrow terminals and wrap or truncate titles gracefully.

* Integrations
   * OpenCode plugin writing to `.opencode/logs/events.jsonl` (primary integration).
   * Local filesystem for snapshots (`history/`). See [`docs/commands/ooda.md`](../../commands/ooda.md) for CLI usage and examples.


* Security & privacy
   * Do not persist full message bodies or raw terminal buffers. Plugin and reader MUST limit persisted fields to the minimal set: event `type`, `time`, and selected `properties` (e.g., `agent`, `title`, `seq`). Full message bodies must never be written to history/ snapshots.
   * Document the exact event schema and implement redaction in v2 (see wf-ba2.8 for audit/redaction requirements).

## Implementation notes (current state)

The repository already contains a working event-driven implementation for the OODA monitor:

* Plugin: `.opencode/plugin/waif-ooda.ts` — emits JSONL lines to `.opencode/logs/events.jsonl`. The plugin deduplicates identical repeated lines and uses the opencode log helper in `src/lib/opencode.ts`.
* CLI: `src/commands/ooda.ts` — implements `readOpencodeEvents` (streaming JSONL reader), event reduction to latest-per-agent, `classify()` mapping heuristics, and table/JSON rendering. Passing `--json` adds `opencodeEventsRaw` and `opencodeEventsLatest` to the output.
* Tests: `tests/ooda.test.ts`, `tests/ooda-mapping.test.ts`, `tests/latest-events.test.ts` — these tests exercise the streaming reader and mapping logic and pass locally.
* Utilities: a small dev emitter (`scripts/dev_opencode_emitter.js`) can append sample events to `.opencode/logs/events.jsonl` for CI/local testing. A redaction helper (`src/lib/redact.ts`) is available to sanitize long bodies and obvious tokens before writing snapshots to `history/`.

Sample JSONL event line (one-per-line):

```
{"type":"agent.started","time":"2025-12-28T14:00:00Z","properties":{"agent":"map","title":"map started wf-cvz.1","seq":1}}
```

Recommended event names and properties (v1):
- `agent.started` — properties: `agent`, `title`, `seq`, `time`
- `agent.stopped` / `agent.exited` — properties: `agent`, `time`, `reason` (optional)
- `agent.message` (or `message.returned`) — properties: `agent`, `title` (short summary), `seq`, `time`

Note: for v1 we recommend `agent.started`, `agent.stopped`, and `agent.message` as the canonical names; owners may confirm alternate names in the review responses.

Sample OODA JSON output shape (when `--json` is used):

{
  "rows": [
    { "agent": "map", "status": "Busy", "title": "map started wf-cvz.1", "reason": "agent.started" }
  ],
  "opencodeEventsRaw": [ /* parsed event objects, chronological */ ],
  "opencodeEventsLatest": [ /* reduced latest event per agent */ ]
}

## Heuristics (examples)

* Mapping examples (v1):

Below is a canonical mapping table that links the normalized event "type" emitted by the `.opencode/plugin/waif-ooda.ts` plugin (and the raw OpenCode event messages that commonly produce them) to the OODA status used by the `waif ooda` monitor. Use this table as the authoritative reference for v1 mapping and for configuring the ignore-list noted elsewhere in the PRD.

| waif-ooda event type | Common OpenCode event(s) / origin | OODA status | When it occurs / notes |
|---|---|---:|---|
| `agent.started` | `agent.started` | Busy | Agent process/session started; marks agent as active. |
| `agent.stopped` / `agent.exited` | `agent.stopped`, `agent.exited` | Free | Agent terminated or signalled stop; marks agent as not active. |
| `message` (chat.message → normalized `message`) | `message.updated`, `message` (assistant/user), `message.part.updated` producing text parts | Busy | New or updated chat messages from an agent or assistant indicate active work; used to show agent is Busy and provide a short Title. |
| `permission.ask` | `permission.ask` | Busy (awaiting response) | A permission request was emitted; agent/workflow is waiting on a permission decision. Treated as Busy for monitoring purposes until resolved. |
| `session.status` → `{ type: "busy" }` | `session.status` (properties.status.type === "busy") | Busy | Explicit session-level Busy indicator from OpenCode/agent runtime. |
| `session.status` → `{ type: "idle" }` | `session.status` (properties.status.type === "idle") | Free | Explicit session-level Idle indicator; treat as Free. |
| `session.status` → `{ type: "retry" }` | `session.status` (properties.status.type === "retry") | Busy (transient) | Session is in a retry/backoff loop after an error; surface as Busy with retry metadata. |
| Tool call states (via `message.part.updated` / ToolPart) | Tool state.status: `pending`, `running`, `completed`, `error` | `pending`/`running` → Busy; `completed` → Busy (brief) → Free; `error` → Busy (error) | Tool executions indicate active work while pending/running. On `completed` the monitor may keep Busy for a short grace window then downgrade to Free if no other Busy signals arrive. Errors surface as Busy and may trigger alert/retry rules. |
| Pty/process lifecycle | `pty.created`, `pty.updated` (status `running`), `pty.exited` (status `exited`) | `running` → Busy; `exited` → Free | Terminal/pty process lifecycle can be used as supplemental signal for agent activity. |
| Noisy / ignored events | `session.diff`, `file.watcher.updated` (noise), other high-volume watchers | Ignored (configurable) | These events are noisy for OODA; the plugin or reader should filter them by default (see `wf-5ad` / ignore-list). |

*Reduction & precedence rules*: when multiple events for the same agent are present, `waif ooda` reduces to the latest-per-agent event using `time`/`seq`. Explicit `session.status` values (busy/idle/retry) have higher precedence over inferred signals from messages or tool states. Tool `running`/`pending` states should treat the agent as Busy until `completed` or a short grace timeout elapses.

*Configurable items*: ignore-list (types to drop), grace timeout after `completed` tool events before downgrading to Free, and which event types should take precedence can be adjusted via CLI flags or a small YAML config (implementation notes in docs/dev/ooda_implementation_plan.md).



* Reduction policy: keep latest event per `properties.agent` and use event `time`/`seq` for ordering.

## Release & Operations

* Rollout plan
  1. Spike/PoC: current event-driven plugin + streaming reader implementation in repo.
  2. v1 beta: ship `waif ooda` CLI that reads `.opencode/logs/events.jsonl`, provides `--once` and `--interval`, and supports `--log` to append snapshots to `history/`.
  3. v2/v3: add persistence snapshots, redaction hooks, and CI E2E harness.

* Quality gates / definition of done
  * Unit and integration tests for event parsing and heuristics pass.
  * Manual acceptance: `npx tsx src/index.ts ooda --once --json` (or `node ./dist/index.js ooda --once --json`) emits JSON with `rows`, `opencodeEventsRaw`, and `opencodeEventsLatest`.
  * Logging validation: `--log history/ooda_snapshot_<ts>.jsonl` appends JSONL snapshots with sanitized fields.

## Next: v2 / v3 (short)

* v2: reliable agent start/stop detection, configurable ignore-list for noisy events (e.g., `session.diff`), and snapshot persistence to `history/` as canonical status records.
* v3: audit-friendly persistence with redaction, API/heartbeat for explicit agent state, and CI E2E tests that mock event emitters.

## Acceptance criteria for PRD update (wf-r1d.1)

* The PRD must mention the JSONL path `.opencode/logs/events.jsonl`, the plugin filename `.opencode/plugin/waif-ooda.ts`, and the streaming reader `src/commands/ooda.ts`.
* Provide at least one sample JSONL line and the JSON output shape used by the CLI.
* Tests must pass locally (`npm test`) before merging.

***

Source issue: wf-cvz

(Updated to reflect the event-driven OpenCode plugin + JSONL ingestion implemented in the repository.)
