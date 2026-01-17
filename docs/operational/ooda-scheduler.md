# OODA scheduler (operator guide)

This document is the operator-facing reference for running the WF OODA scheduler.

Related docs:

- CLI reference: [`docs/commands/ooda.md`](../commands/ooda.md)
- Usage quickstart: [`docs/usage/ooda.md`](../usage/ooda.md)
- Snapshots (JSONL, retention, permissions): [`docs/operational/ooda-snapshots.md`](./ooda-snapshots.md)
- CI/E2E: [`docs/operational/ooda-ci.md`](./ooda-ci.md) and [`.github/workflows/ooda-e2e.yml`](../../.github/workflows/ooda-e2e.yml)

## CLI commands (operator surface)

### Scheduler lifecycle

```bash
# Run the scheduler loop (foreground). This is the default when no subcommand is provided:
wf ooda

# Or run the scheduler explicitly with options:
wf ooda scheduler --config .waif/ooda-scheduler.yaml --interval 30 --log history/ooda_snapshot.jsonl

# To stop the scheduler, terminate the process (Ctrl-C) or send a kill to the PID.
```

Notes:

- The scheduler is primarily intended as a long-lived loop.
- For CI verification, prefer `run-job` (deterministic and exits) rather than an infinite loop.

### Run a single job (CI-friendly)

```bash
wf ooda run-job --job <id> --config <path> --log <path> --json
```

Example:

```bash
wf ooda run-job \
  --job daily-health \
  --config .waif/ooda-scheduler.yaml \
  --log history/ooda_snapshot.jsonl \
  --json
```

## Example config: `.waif/ooda-scheduler.yaml`

Minimal-but-realistic YAML snippet (recommended to commit this file to the repo, but treat it as code-reviewed configuration):

```yaml
jobs:
  - id: daily-health
    name: "Daily health check"
    command: "./scripts/health-check.sh"
    schedule: "0 */6 * * *"  # every 6 hours
    cwd: "."                # optional: run from repo root
    env:                     # optional
      HEALTH_MODE: "quick"
    capture:                 # optional: opt-in stream capture
      - stdout
      - stderr
    redact: true             # recommended default: never persist secrets
    timeout_seconds: 60      # operator note: default timeout is 60s
    retention:
      keep_last: 20         # operator note: trims snapshot file to last N entries
```

Field notes:

- `id` (required): stable identifier used with `--job <id>`.
- `name` (optional): human-friendly name for logs/snapshots.
- `command` (required): shell command string.
- `schedule` (required for scheduler): cron expression.
- `cwd` (optional): working directory to execute the command from.
- `env` (optional): environment variables for the process.
- `capture` (optional): list of streams to persist (`stdout`, `stderr`).
- `redact` (recommended default: `true`): redacts captured output before printing/writing snapshots.
- `timeout_seconds`: job timeout in seconds (default 60s).
- `retention.keep_last`: keep the last N JSONL entries in the snapshot file.

## Snapshot logging (JSONL)

When snapshots are enabled (via `--log <path>` or the default), the scheduler appends **one JSON object per line**.

### Snapshot JSONL shape

Required fields and meaning:

- `time` (string): ISO-8601 timestamp.
- `job_id` (string): job `id`.
- `name` (string | omitted): job `name` if set.
- `command` (string): job command string.
- `exit_code` (number | null): process exit code.
- `status` (string): `success` | `failure` | `timeout`.
- `summary` (string | omitted): short operator-focused summary (when available).
- `sanitized_output` (string | omitted): redacted combined output, when the implementation stores a single stream.
  - OR `stdout` / `stderr` (string | omitted): captured streams, when capture is enabled.

### Example JSONL snapshot line

```json
{"time":"2026-01-12T12:34:56.789Z","job_id":"daily-health","name":"Daily health check","command":"./scripts/health-check.sh","status":"success","exit_code":0,"summary":"ok","stdout":"ok\n"}
```

Operational notes:

- Snapshot logs are append-only JSONL; treat them as audit artifacts.
- `retention.keep_last` is enforced after each write, trimming the log file to the last N non-empty lines.

## Redaction and secrets (operator guidance)

Redaction is best-effort and intended to prevent accidental secret leakage, not to act as a security boundary.

- Redaction implementation: `src/lib/redact.ts`
- Recommended safe defaults:
  - Set `redact: true` on jobs that capture output.
  - Prefer **never persisting secrets**:
    - Avoid embedding secrets in `command` strings.
    - Prefer supplying secrets via `env:` (and ensure the command does not echo them).
  - Restrict config file permissions:

    ```bash
    chmod 600 .waif/ooda-scheduler.yaml
    ```

If you suspect secrets were written into a snapshot file:

1. Rotate the secret(s) immediately.
2. Remove/rotate the snapshot file(s) under `history/`.
3. Consider temporarily disabling capture and/or logging (`--log false`) while iterating.

## Retention and timeouts

- Default timeout: **60s** per job if `timeout_seconds` is not set.
- Retention:
  - Configure `retention.keep_last` per job to avoid unbounded `history/*.jsonl` growth.
  - Retention trimming is best-effort; failures to trim should not fail job execution.

