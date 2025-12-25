# Product Requirements Document

## Introduction

* One-liner
  * A lightweight, read-only OODA loop CLI (`waif ooda`) that continuously monitors agent state using OpenCode events only. It displays a concise status table (Agent | Status | LastSeen), providing situational awareness for multi-agent workflows.

* Problem statement
  * The current `waif ooda` monitor has relied on tmux pane titles and PID probes to infer agent state, which is unreliable. We will switch to OpenCode events as the sole source of truth so the OODA monitor can present accurate, timely status and support auditability.

* Goals
  * Use OpenCode plugin events as the sole source of truth for agent lifecycle/state (no tmux/probe fallback).
  * Deliver an iterative rollout: v1 subscribe & log events to console; v2 map events to agent identities with high reliability; v3 maintain an in-memory cache and persist current status to a rolling JSONL log file in `history/`.
  * Keep v1 read-only and safe for developer workstations.

* Non-goals
  * Initiating actions on agents (control/automation) in v1.
  * Integrating with centralized monitoring or production telemetry in v1.

## Users

* Primary users
  * The OODA Monitor operator (local developer) and the OODA monitor process itself which consumes events to maintain status.

* Secondary users (optional)
  * None identified for this iteration.

* Key user journeys
  * Start the monitor locally: a human runs `waif ooda` and sees an updating table of agent status derived from OpenCode events.
  * View current state: at a glance the operator sees agent, status (Busy/Free/Unknown), and last\_seen timestamp.
  * Audit state (v3): operator inspects `history/ooda_status.jsonl`, where the most recent JSON line represents the current status of all known agents.

## Requirements

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     OpenCode Server Process                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  WAIF OpenCode Plugin (wf-gn7.1)                          │  │
│  │  - Subscribes to internal OpenCode events                 │  │
│  │  - Filters relevant events (session.*, message.*, etc.)   │  │
│  │  - Writes to: .waif/opencode_events.jsonl                 │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ (file tail / watch)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    waif ooda (CLI process)                      │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │ Event       │───▶│ Status      │───▶│ Display / Output    │  │
│  │ Ingester    │    │ Model       │    │ (table, --json)     │  │
│  └─────────────┘    └─────────────┘    └─────────────────────┘  │
│                            │                                    │
│                            ▼                                    │
│                 ┌─────────────────────┐                         │
│                 │ Persistence (v3)    │                         │
│                 │ history/ooda_status │                         │
│                 │ .jsonl              │                         │
│                 └─────────────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
```

**Data flow**:

1. OpenCode server emits internal events (session lifecycle, messages, tools, etc.).
2. The WAIF plugin hooks these events and appends relevant ones to `.waif/opencode_events.jsonl`.
3. `waif ooda` tails this file, parses each line, maps it to agent status updates, and redraws the UI.
4. (v3) On each update, `waif ooda` appends a full-state snapshot to `history/ooda_status.jsonl`.

* Functional requirements (MVP)
  1. CLI surface
     * Provide a single long-running command: `waif ooda`.
     * Exit with `Ctrl-C`.
     * Flags (proposed minimal):
       * `--status-log <path>` (default: `history/ooda_status.jsonl`) — v3 only; controls JSONL persistence path.
       * `--json` — emit machine-readable status updates to stdout (in addition to the table) for piping.
       * `--no-table` — suppress table rendering (for headless piping/logging).
       * No polling/probe flags (`--interval`, `--once`, probe `--log`) in the event-driven design.
  2. Event subscription (OpenCode plugin)
     * Subscribe to OpenCode plugin events (see https://opencode.ai/docs/plugins#events for event list and plugin architecture).
     * Relevant OpenCode events (based on plugin docs):
       * `session.created` — a new session started; map to agent becoming `busy`.
       * `session.idle` — session is idle/waiting; map to agent becoming `free`.
       * `session.status` — session status changed; inspect payload to determine `busy`/`free`.
       * `message.updated` — a message was updated (assistant responding); map to `busy`.
       * `session.deleted` — session ended; remove agent or mark `unknown`.
     * Event coverage (target mapping; confirm exact semantics in wf-gn7.1):
       * Agent becomes `busy`: on `session.created`, `session.status` (if status indicates active work), `message.updated`.
       * Agent becomes `free`: on `session.idle`, `session.status` (if status indicates idle).
       * Agent becomes `unknown`: on `session.deleted` or if no events received for extended period.
     * Provide a mapping layer to decouple OODA status from raw plugin event schema; tolerate additive fields without breaking.
     * If event subscription fails (plugin event file missing, malformed), fail fast with a clear error; do not fall back to tmux or probes.
  3. Status model (in-memory)
     * Track agents in memory keyed by agent id/name.
     * Fields per agent: `status` (`busy` | `free` | `unknown`), `last_seen` (ISO-8601), `source` (`opencode`), `last_event` (string), optional `meta` passthrough from event if safe (TBD).
     * Default status for newly seen agents: `unknown` until first lifecycle/message event updates it.
  4. Display
     * Print a width-aware table with columns: Agent | Status | LastSeen. Redraw on event arrival (no polling interval).
     * Status rendering: `busy` (highlight), `free`, `unknown` (dim/gray).
     * If `--json` is set, also emit a line-oriented JSON status message per update (append-only, stable shape) to stdout.
  5. Logging (v1+ optional)
     * v1: log events of interest to the console (manual inspection is acceptable initially).
     * If we add an event log file, explicitly name the flag/path (do not reuse probe log conventions).
  6. Persistence (v3)
     * Maintain an in-memory cache during execution.
     * Persist to a rolling JSONL log file: `history/ooda_status.jsonl`.
       * Write mode: append-only (one JSON object per line).
       * Write trigger: on each relevant event (agent started/stopped, message returned) and/or periodic flush (exact cadence TBD).
       * Snapshot semantics: the MOST RECENT line MUST be a complete snapshot of the current status of all known agents (canonical snapshot).
       * Minimum JSON schema (v3):
         * `ts`: ISO-8601 timestamp for when the snapshot was written.
         * `agents`: object keyed by agent id/name, where each value includes:
           * `status`: one of `busy`, `free`, `unknown`.
           * `last_seen`: ISO-8601 timestamp of last event observed for that agent.
           * `source`: literal `opencode`.
           * `last_event` (optional): e.g. `agent.started` / `agent.stopped` / `message.returned`.
       * Example JSONL record:
         ```json
         {"ts":"2025-12-25T08:30:00.000Z","agents":{"map":{"status":"busy","last_seen":"2025-12-25T08:29:58.123Z","source":"opencode","last_event":"session.updated"},"ship":{"status":"free","last_seen":"2025-12-25T08:25:00.000Z","source":"opencode","last_event":"session.idle"}}}
         ```
  7. Read-only safety
     * No code path in v1 may send instructions to agents. Any future command/automation paths must be gated behind explicit flags and review.

* Non-functional requirements
  * Terminal-friendly rendering.
  * Graceful failure when the OpenCode runtime/events are unavailable.
  * Low overhead for steady-state event processing (no polling/probing loop).
  * Observability: lightweight counters/metrics in logs (events received, status updates applied, JSONL writes, failures).

* Integrations
  * Integration strategy:
    * **Architecture**: The OODA monitor is a separate process from the OpenCode server. The OpenCode SDK does not currently expose a generic "subscribe to all system events" method for external clients.
    * **Mechanism**: The **WAIF OpenCode Plugin** (wf-gn7.1) running inside the OpenCode server MUST bridge these events to `waif ooda`.
      * Preferred Transport (v1): The plugin writes selected raw events to a rolling log file at `.waif/opencode_events.jsonl` (project-local).
      * `waif ooda` tails this file (using `fs.watch` or polling fallback) to ingest events, update its internal state model, and redraw the UI.
      * Alternative transports (future consideration): Unix domain socket, named pipe, or HTTP SSE endpoint exposed by the plugin.
    * This architecture decouples the plugin (event emitter) from the monitor (state interpreter), allowing `waif ooda` logic to iterate without restarting the OpenCode server.
  * File conventions:
    * **Plugin event log (input)**: `.waif/opencode_events.jsonl` — written by the plugin; read/tailed by `waif ooda`.
    * **OODA status log (output)**: `history/ooda_status.jsonl` — written by `waif ooda` (v3); canonical snapshot per line.
  * Local filesystem permissions: Respect umask/user permissions; do not chmod files to world-readable.

* Security & privacy
  * Do not capture raw conversation contents unless explicitly required; default event logs/status should record only agent identifiers, event names, timestamps, and derived status.
  * Respect user file permissions when writing `history/` files.
  * Avoid logging secrets present in event payload metadata; if uncertain, drop or redact fields before persistence.

## Release & Operations

* Rollout plan
  1. v1: wire OpenCode subscription and log events of interest to the console; ensure read-only operation.
  2. v2: improve mapping from events → agent identity and verification to reach the identification reliability target (99.999% correct agent attribution for start/stop).
  3. v3: persist canonical current state to `history/ooda_status.jsonl` and publish operational notes.

* Quality gates / definition of done
  * Unit tests for event parsing and status model logic.
  * Integration tests that use a mock OpenCode emitter (v1 test strategy: mock) to assert:
    * Events are accepted and translated into status updates.
    * The status table reflects the translated status.
    * (v2+) Agent attribution reaches the 99.999% correctness target in the covered scenarios.
  * Manual acceptance: running `waif ooda` shows stable table updates as events arrive for at least 5 minutes.
  * Logging validation: `history/ooda_status.jsonl` contains valid JSONL and current-state entries (v3).

* Risks & mitigations
  * **Event schema drift**: Mitigate by using a mapping layer and unit tests against a mock OpenCode emitter. Pin to known event shapes; log warnings for unknown event types.
  * **OpenCode runtime unavailable**: Fail fast with a clear error; do not silently fall back to other signals. Provide a helpful message ("OpenCode event file not found; ensure the WAIF plugin is installed and OpenCode is running").
  * **File-tail reliability**: `fs.watch` behavior varies by OS/filesystem. Mitigate by supporting a polling fallback (e.g., check file mtime every 500ms) when `fs.watch` is unreliable.
  * **Privacy issues**: Do not log message contents by default; document logging policy. Only persist agent identifiers, event types, and timestamps.

## Open Questions

* **Latency target**: v2 detection latency was not specified. Suggested: detect start/stop within 5s for practical responsiveness. In an event-driven design, latency is governed by event delivery and file-tail frequency rather than polling intervals.
* **Retention / rotation**: `history/ooda_status.jsonl` is append-only; the most recent line is canonical. Rotation/size limits are TBD (follow-up chore once usage patterns are known).
* **Event naming**: We propose mapping OpenCode events (`session.created`, `session.idle`, `session.status`, `message.updated`, etc.) to OODA status. Exact mappings to be confirmed during wf-gn7.1 implementation.
* **Backpressure / resilience**: Define behavior if event stream lags or bursts (e.g., drop-or-queue policy, bounded in-memory queue size, log warnings when behind by N events or >T seconds).
* **Testing**: Mock OpenCode emitter shape should mirror plugin event contracts (see https://opencode.ai/docs/plugins#events) to avoid brittle test fixtures when plugin adds optional fields.
* **Transport alternatives**: If file-tailing proves unreliable (e.g., NFS, Docker volumes), consider Unix socket or HTTP SSE as alternative transport in a later version.

## Glossary

* **OODA**: Observe-Orient-Decide-Act loop; here used as a situational-awareness monitor for agent state.
* **OpenCode**: The AI coding assistant platform (https://opencode.ai) whose plugin system emits events.
* **Plugin**: A JavaScript/TypeScript module loaded by OpenCode that hooks into internal events.
* **JSONL**: JSON Lines format — one JSON object per line, newline-delimited.
* **Canonical snapshot**: The authoritative current state; in this PRD, the most recent line of `history/ooda_status.jsonl`.
* **Agent**: A named OpenCode session/persona (e.g., `map`, `ship`) that performs work.

***

Source issue: wf-r1d

Seed context (from issue wf-r1d):

* One-liner: Replace unreliable tmux-title probing with OpenCode events for OODA; iterative delivery v1 (console logs), v2 (99.999% lifecycle detection), v3 (JSONL persistence).
* Acceptance notes: v1 log `agent.started`, `agent.stopped`, `message.returned` (manual verification initially); v2 99.999% identification accuracy; v3 persist status snapshots to `history/ooda_status.jsonl` and maintain in-memory cache.
* Priority: P0 — child of wf-gn7.1.

Assumptions made while drafting

* v1 is read-only and will not send commands to agents.
* Tests for v1 will use a mock OpenCode emitter in the test harness.
* Persisted canonical state file: `history/ooda_status.jsonl` (rolling JSONL log; append updates, with the most recent line representing current status).

(End of document)
