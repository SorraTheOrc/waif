# OODA Scheduler (Quickstart)

The OODA scheduler runs `waif ooda` probes on a cron schedule using a validated YAML config.

Schema and loader:

- Loader: `../../src/lib/config.ts`
- Schema: `../../src/lib/schemas/ooda-scheduler.schema.json` (authoritative; location may vary by branch)

## Quickstart

1) Create `.waif/ooda-scheduler.yaml` (recommended permissions: `chmod 600 .waif/ooda-scheduler.yaml`).

Example snippet:

```yaml
version: v1
retention:
  maxDays: 7
  maxFiles: 50
  maxBytes: 50000000
jobs:
  - id: probe-map
    name: Map status probe
    cron: "*/1 * * * *"
    events: .opencode/logs/events.jsonl
    snapshot:
      path: history/ooda_snapshot.jsonl
      mode: append
    capture:
      includeRawEvents: false
```

2) Run a single job one time (debug/CI):

```bash
waif ooda run --config .waif/ooda-scheduler.yaml --job probe-map --once
```

3) Start the scheduler loop:

```bash
waif ooda scheduler --config .waif/ooda-scheduler.yaml
```

## Running a single probe (no scheduler)

For ad-hoc use you can still run the underlying probe:

```bash
waif ooda --once --events .opencode/logs/events.jsonl --log history/ooda_snapshot.jsonl
```

## Snapshot JSONL (one line)

Example snapshot line written to `history/*.jsonl`:

```json
{"time":"2026-01-08T12:00:00.000Z","job":"probe-map","agent":"map","status":"Busy","title":"wf-e6r.2.1/config-loader","reason":"opencode-event"}
```
