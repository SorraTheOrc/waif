# OODA scheduler (operator guide)

This document is the operator-facing reference for running and migrating the WAIF OODA scheduler.

Related docs:

- CLI reference: [`docs/commands/ooda.md`](../commands/ooda.md)
- Usage quickstart: [`docs/usage/ooda.md`](../usage/ooda.md)
- CI/E2E: [`docs/operational/ooda-ci.md`](./ooda-ci.md) and [`.github/workflows/ooda-e2e.yml`](../../.github/workflows/ooda-e2e.yml)

## CLI commands (operator surface)

### Scheduler lifecycle

```bash
# Start the scheduler loop (foreground)
waif ooda scheduler start --config .waif/ooda-scheduler.yaml

# Stop a previously started scheduler (if supported by your environment)
waif ooda scheduler stop

# Run scheduler work once (useful for smoke tests / local verification)
waif ooda scheduler run --config .waif/ooda-scheduler.yaml

# Report scheduler status
waif ooda scheduler status
```

Notes:

- The scheduler is primarily intended as a long-lived loop.
- For CI verification, prefer `run-job` (deterministic and exits) rather than an infinite loop.

### Run a single job (CI-friendly)

```bash
waif ooda run-job --job <id> --config <path> --log <path> --json
```

Example:

```bash
waif ooda run-job \
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

## Migration checklist: retiring legacy OODA (tmux/probe)

Goal: fully migrate to the OODA scheduler CLI and remove legacy monitoring integrations.

### Verify the new scheduler surface

- [ ] Confirm all operator docs and scripts use:
  - `waif ooda scheduler start|stop|run|status`
  - `waif ooda run-job --job <id> --config <path> --log <path> --json`
- [ ] Run local smoke:

  ```bash
  waif ooda run-job --job <id> --config .waif/ooda-scheduler.yaml --log history/ooda_snapshot.jsonl --json
  ```

### CI/E2E verification

- [ ] Ensure the E2E workflow is green: [`.github/workflows/ooda-e2e.yml`](../../.github/workflows/ooda-e2e.yml)
- [ ] Confirm `run-job` is used for deterministic CI verification (no infinite loops).

### Manual acceptance

- [ ] Start scheduler in a local terminal and observe at least one scheduled run.
- [ ] Verify snapshot JSONL lines are appended and redaction is applied when enabled.
- [ ] Verify retention trimming behaves as expected (file does not grow without bound).

### Removal steps (after migration is accepted)

- [ ] Remove legacy tmux/probe flows.
- [ ] Remove `.opencode/plugin/waif-ooda.ts` if it is still present and only used for legacy OODA.
- [ ] Update any remaining docs referencing legacy OODA.

Keep this as a coordinated change: ensure dependent docs/tools are updated and CI is green before removal.
