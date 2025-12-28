OODA Implementation Plan (short)

Overview

This document lists immediate implementation tasks to move the current event-driven OODA monitor from PoC to a stable v1 and into follow-up v2/v3 work.

Tasks

1) Plugin filters and noise control (priority: high)
   - Add an ignore-list for event types (e.g., `session.diff`) in `.opencode/plugin/waif-ooda.ts` or the opencode log helper configuration.
   - Add unit tests to ensure noisy events are not emitted to `.opencode/logs/events.jsonl`.

2) Snapshot persistence (priority: high)
   - Implement `--log <path>` in `src/commands/ooda.ts` to append canonical snapshot JSON objects to `history/ooda_snapshot_<ts>.jsonl`.
   - Ensure snapshots contain only sanitized fields: `time`, `agent`, `status`, `title`, `reason`.

3) Redaction & audit (priority: medium)
   - Define a redaction policy (reference: wf-ba2.8) to strip message bodies and sensitive fields before persistence.
   - Add a test harness that validates redaction rules.

4) CI E2E harness & mock emitter (priority: medium)
   - Add scripts/dev/ooda_emit_sample.sh to append sample events to `.opencode/logs/events.jsonl` for local testing.
   - Add a CI job that runs the mock emitter and verifies `npx tsx src/index.ts ooda --once --json` produces expected rows.

5) Configuration & runtime options (priority: low)
   - Add `.waif-ooda.yaml` or CLI flags to override ignore-list, timeout for considering an agent "Free", and snapshot path.

6) Documentation & PRD alignment (priority: low)
   - Keep `docs/dev/prd-ooda-loop.md` up to date with implementation notes and sample outputs.

Acceptance criteria for v1

- `npx tsx src/index.ts ooda --once --json` works against a sample `.opencode/logs/events.jsonl` and emits `rows`, `opencodeEventsRaw`, and `opencodeEventsLatest`.
- `--log history/ooda_snapshot_<ts>.jsonl` appends sanitized snapshots.
- Unit tests for mapping and the streaming reader pass.

Next steps

- Implement tasks 1 and 2 in a follow-up PR, then iterate on redaction and CI harness.
