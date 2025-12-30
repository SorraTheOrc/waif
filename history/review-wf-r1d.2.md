PRD Review Note: wf-r1d.2

Review conducted by: scribbler (agent), with coordination from Map
Date: 2025-12-28

Summary:
- Reviewed docs/dev/prd-ooda-loop.md against wf-r1d.2 acceptance criteria and clarifying questions.
- Performed light editorial fixes and added clarifications where the PRD referenced behaviors not yet implemented.

Decisions and edits applied:
1) Clarified CLI flags section to explicitly document `--json` and `--once` behavior and the default `--interval` of 5s.
2) Made the security note explicit about redaction and removed ambiguous language that suggested full message bodies could be stored.
3) Added a sample event schema example and noted recommended event names: `agent.started`, `agent.stopped`, `agent.message` (or `message.returned`) and recommended properties: `agent`, `title`, `seq`, `time`.
4) Documented recommended ooda snapshot JSONL shape for `--log`: { time, agent, status, title, reason } and noted that full message bodies must not be persisted.

Open clarifying questions (not resolved):
- Q1: Confirm exact event names to subscribe to (agent.started/stopped/message) — action: create wf-r1d.2.q1 for owners to confirm.
- Q2: For v1 automated testing: prefer mock OpenCode emitter in tests vs real OpenCode in CI — action: create wf-r1d.2.q2 to record preference for mock emitter (recommended).
- Q3: For v3 YAML snapshot retention: prefer timestamped snapshots for audit vs single overwritten file — action: create wf-r1d.2.q3.
- Q4: Confirm redaction policy and any secrets constraints — action: wf-r1d.2.q4.

Files edited/created:
- Edited: docs/dev/prd-ooda-loop.md
- Created: history/review-wf-r1d.2.md

Next steps:
- Request reviewer confirmation from wf-gn7 owners and product owner; collect sign-offs as BD comments on wf-r1d.2.
- Create BD question tasks for unresolved clarifications (wf-r1d.2.q1 .. q4).

