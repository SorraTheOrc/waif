# ooda: scheduler + run-job

## Overview

`ooda` is a small cron-based scheduler and job runner intended for local development and CI smoke checks.

- `ooda scheduler` runs an infinite loop that periodically checks cron schedules and executes due jobs.
- `ooda run-job` runs one configured job by id once (useful for debugging config, command behavior, redaction, and snapshot logging).

Use `run-job` when you want a deterministic “run this one thing now” workflow. Use `scheduler` when you want to observe periodic execution and retention behavior over time.

## CLI usage

### Scheduler

Run the scheduler loop:

```bash
waif ooda scheduler --config .waif/ooda-scheduler.yaml --interval 30
```

Optional snapshot log location:

```bash
waif ooda scheduler --config .waif/ooda-scheduler.yaml --log history/ooda_snapshot.jsonl
```

Disable snapshot logging:

```bash
waif ooda scheduler --config .waif/ooda-scheduler.yaml --log false
```

Notes:

- The legacy flags `--once` and `--events` were removed. The scheduler always runs continuously.
- Use `--interval` to control the polling cadence (seconds).

### Run a single job (debug)

Run a configured job once by id:

```bash
waif ooda run-job --config .waif/ooda-scheduler.yaml --job daily-health
```

Write the run snapshot to a specific file:

```bash
waif ooda run-job --config .waif/ooda-scheduler.yaml --job daily-health --log history/ooda_snapshot.jsonl
```

Disable snapshot logging:

```bash
waif ooda run-job --config .waif/ooda-scheduler.yaml --job daily-health --log false
```

Machine-readable output (when supported by your top-level invocation):

```bash
waif --json ooda run-job --config .waif/ooda-scheduler.yaml --job daily-health
```

## Manual testing

These steps are intended for contributors/reviewers running locally.

### 1) Run `run-job` locally

1. Ensure dependencies are installed:

   ```bash
   npm ci
   ```

2. Use a known-good fixture config:

   ```bash
   waif ooda run-job --config tests/fixtures/ooda.valid.yaml --job daily-health
   ```

3. Verify snapshot logging (default path is `history/ooda_snapshot_<ts>.jsonl`):

   - Re-run the command and confirm a new JSONL file appears under `history/`.
   - Confirm captured `stdout`/`stderr` fields only appear when the job config requests capture.

### 2) Run the deterministic CLI E2E test

Run the deterministic integration test that exercises the command handler directly:

```bash
npm test -- tests/wf-e6r.2.14.cli-e2e.test.ts
```

### 3) Run unit tests for `runJobCommand`

The unit tests live in `tests/ooda-run-job.test.ts`. Run only those tests:

```bash
npm test -- tests/ooda-run-job.test.ts
```

Or run just the `runJobCommand` describe block:

```bash
npm test -- tests/ooda-run-job.test.ts -t runJobCommand
```

## Security notes

### Redaction

Jobs can opt into output redaction.

- Redaction is applied to captured stdout/stderr when the job sets `redact: true`.
- Snapshot logging also applies redaction when enabled for the job.

Redaction is best-effort and pattern-based; it reduces accidental leakage but is not a security boundary.

### Arbitrary `job.command`

`job.command` is executed via a shell (`spawn(..., { shell: true })`). This is powerful and risky:

- A malicious or unreviewed config can execute arbitrary commands.
- Shell injection is possible if command strings are constructed unsafely.

Actionable guidance:

- Treat scheduler configs as code: review changes and avoid running untrusted configs.
- Prefer running in a sandboxed environment (container/VM) when iterating on new or risky commands.
- Use a dedicated, least-privileged working directory and environment for jobs.
- Avoid passing secrets via command strings; prefer environment variables, and still assume output may leak unless redaction is enabled.

## Development notes

- `runJobCommand` is implemented and exported from `src/commands/ooda.ts` (also exposed via `__test__` for deterministic testing).
- Snapshot logs are JSONL. Retention is enforced per-run via `retention.keep_last` (trims the snapshot log down to the last N entries).

Defining jobs

The scheduler reads a YAML config (example fixtures under `tests/fixtures/`) that defines one or more jobs. A minimal job definition looks like:

```yaml
jobs:
  - id: daily-health
    name: "Daily health check"
    command: "echo ok"
    schedule: "0 7 * * *"   # cron syntax (optional for run-job)
    capture: true            # capture stdout/stderr
    redact: true             # apply redact rules to captured output
    timeout_seconds: 30      # max runtime before force-kill
    retention:
      keep_last: 10          # number of snapshots to retain for this job
```

Fields explained:

- id (required): stable identifier used with `--job <id>` for `run-job`.
- name (optional): human-friendly name shown in logs and snapshots.
- command (required): the shell command to execute (string). This is run via a shell; treat carefully.
- schedule (optional): cron expression. Not required when using `run-job`.
- capture (optional, default: false): when true, captured stdout/stderr are saved to snapshots.
- redact (optional, default: false): when true, redact rules are applied to captured output before writing snapshots.
- timeout_seconds (optional): number of seconds to wait before terminating the process.
- retention.keep_last (optional): number of snapshots to retain for this job. Older entries will be pruned.

Examples

1) Simple command without capture:

```yaml
jobs:
  - id: uptime
    command: "uptime"
```

2) Command with capture and redaction:

```yaml
jobs:
  - id: fetch-data
    name: "Fetch remote data"
    command: "curl -s https://internal.service/metrics"
    capture: true
    redact: true
    timeout_seconds: 60
    retention:
      keep_last: 5
```

3) Environment-aware command (recommended to avoid secrets in the command string):

```yaml
jobs:
  - id: run-backup
    command: "/usr/local/bin/backup --dest $BACKUP_DEST"
    capture: true
    timeout_seconds: 300
```

Notes

- The implementation treats `command` as a single shell string. If you need complex argument handling, prefer wrapper scripts checked into the repo and reference them from `command`.
- Changes to job definitions should be code-reviewed and treated like any other config change.

Related bd issues:

- `wf-e6r.2.1.1` (implementation work for updated CLI + `run-job`)
- `wf-bkt` (tracking/epic context)
- `wf-4cv` (this documentation task)
