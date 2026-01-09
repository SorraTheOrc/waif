# OODA Scheduler (Quickstart)

The OODA scheduler runs configured jobs on a cron schedule using a validated YAML config. Each job is an arbitrary shell command (`job.command`) executed by the long-running scheduler process at runtime.

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
    command: ./scripts/health_check.sh
    snapshot:
      path: history/ooda_snapshot.jsonl
      mode: append
```

2) Start the scheduler loop (long-running process):

```bash
waif ooda scheduler --config .waif/ooda-scheduler.yaml
```

The scheduler invokes each `job.command` at the scheduled times.

## Running a job command directly (no scheduler)

For ad-hoc debugging you can run the same command you configured in `job.command`:

```bash
./scripts/health_check.sh
```

## Snapshot JSONL (one line)

Example snapshot line written to `history/*.jsonl`:

```json
{"time":"2026-01-08T12:00:00.000Z","job":"probe-map","agent":"map","status":"Busy","title":"wf-e6r.2.1/config-loader","reason":"opencode-event"}
```
