# OODA scheduler config examples (test fixtures)

These are full example configs used by tests and local reproducibility.

Repository references:

- Loader/validation: `src/lib/config.ts`
- Schema: `src/lib/schemas/ooda-scheduler.schema.json`

## daily-health (fixture-style)

```yaml
jobs:
  - id: daily-health
    name: Daily health check
    command: "echo ok"
    schedule: "0 7 * * *"
    capture: [stdout]
    redact: true
    timeout_seconds: 30
```

## retention example (keep_last: 10)

```yaml
jobs:
  - id: daily-health
    name: Daily health check
    command: "echo ok"
    schedule: "0 7 * * *"
    retention:
      keep_last: 10
```
