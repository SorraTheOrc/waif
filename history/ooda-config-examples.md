# OODA scheduler config examples (test fixtures) [history/]

> Ephemeral planning note: this file lives in `history/` to preserve full example configs used by tests and local reproduction.
> If examples become canonical, move a *minimal snippet* into `docs/` and leave this file as reference.

Repository references:

- Loader/validation: `src/lib/config.ts`
- Schema: `src/lib/schemas/ooda-scheduler.schema.json`
- Snapshot writer/retention: `src/commands/ooda.ts` (`writeJobSnapshot`, `enforceRetention`)
- Deterministic E2E: `tests/run-job.e2e.test.ts`

## Example 1: daily-health (fixture-style, capture + redact + timeout)

```yaml
# Minimal job definition with opt-in capture. Suitable for local smoke checks.
jobs:
  - id: daily-health
    name: Daily health check

    # NOTE: current implementation accepts a string and runs via `spawn(..., { shell: true })`.
    # Prefer simple commands here; for more complex behavior put logic into a script.
    command: "echo ok"

    # Five-field cron (minute/hour/day/month/dow) is supported; scheduler also accepts 6-field
    # cron with seconds when using `cron-parser` (see E2E using "*/5 * * * * *").
    schedule: "0 7 * * *"

    # Capture is opt-in.
    capture: [stdout]

    # Best-effort redaction of captured output (not a security boundary).
    redact: true

    # Prevent hangs from consuming runner capacity.
    timeout_seconds: 30
```

## Example 2: retention demo (keep_last)

```yaml
# This config is intended to demonstrate snapshot retention behavior.
# When a job logs snapshots to a JSONL file (via --log or default history/...),
# the runner enforces retention after each run.
jobs:
  - id: e2e-exit
    name: Retention demo
    command: "node tests/helpers/exit.js 0"

    # 6-field cron (includes seconds). This is used by the deterministic E2E test.
    schedule: "*/5 * * * * *"

    capture: [stdout]
    timeout_seconds: 5

    retention:
      # Keep only the last N snapshot lines.
      # In the current CLI implementation this is enforced by `enforceRetention(snapshotPath, keep_last)`.
      keep_last: 1
```
