# ooda: scheduler + run-job

## Overview

`ooda` is a small cron-based scheduler and job runner intended for local development and CI smoke checks.

- `ooda scheduler` runs an infinite loop that periodically checks cron schedules and executes due jobs.
- `ooda run-job` runs one configured job by id once (useful for debugging config, command behavior, redaction, and snapshot logging).

Use `run-job` when you want a deterministic “run this one thing now” workflow. Use `scheduler` when you want to observe periodic execution and retention behavior over time.

## CLI usage

### Example fixtures

- `tests/fixtures/ooda.hello-5s.yaml` — run the scheduler every 5 seconds:

  ```bash
  waif ooda scheduler --config tests/fixtures/ooda.hello-5s.yaml --interval 1
  ```

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

#### Quick examples for `run-job`

One-shot run (human mode). Captured output is printed to stdout/stderr when *not* using JSON output:

```bash
waif ooda run-job --config tests/fixtures/ooda.valid.yaml --job daily-health
```

What to expect:

- If the job config enables capture, the job's captured `stdout` is printed to your terminal (and `stderr` if captured).
- A snapshot line is appended to `history/ooda_snapshot_<ts>.jsonl` unless `--log false` is provided.

JSON output (automation). Use the top-level `--json` flag:

```bash
waif --json ooda run-job --config tests/fixtures/ooda.valid.yaml --job daily-health
```

Example output:

```json
{"jobId":"daily-health","status":"success","code":0,"stdout":"ok\n","stderr":""}
```

Fields:

- `jobId`: job `id` from the scheduler config
- `status`: `success` | `failure` | `timeout`
- `code`: process exit code (or `null` if unavailable)
- `stdout`/`stderr`: captured output (only present when capture is enabled for that stream)

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

Run the deterministic E2E test for `run-job`:

```bash
npx vitest tests/run-job.e2e.test.ts
```

### 3) Run unit tests for `runJobCommand`

The unit tests live in `tests/ooda-run-job.test.ts`. Run only those tests:

```bash
npx vitest tests/ooda-run-job.test.ts
```

Or run just the `runJobCommand` describe block:

```bash
npx vitest tests/ooda-run-job.test.ts -t runJobCommand
```

## Snapshot format (JSONL)

Snapshots are appended as **one JSON object per line**. The current implementation (see `writeJobSnapshot` in `src/commands/ooda.ts`) writes these fields:

- `time`: ISO timestamp (UTC), e.g. `"2026-01-12T12:34:56.789Z"`
- `job_id`: job id from config
- `name`: job name from config (may be omitted)
- `command`: job command string
- `status`: `success` | `failure` | `timeout`
- `exit_code`: numeric exit code, or `null`
- `stdout`: captured stdout (only if capture enabled for stdout)
- `stderr`: captured stderr (only if capture enabled for stderr)

Example record (single line):

```json
{"time":"2026-01-12T12:34:56.789Z","job_id":"daily-health","name":"Daily health check","command":"echo ok","status":"success","exit_code":0,"stdout":"ok\n"}
```

Notes:

- Output redaction (when enabled via `job.redact`) is applied before writing `stdout`/`stderr`.
- The following fields are **not currently written** by `writeJobSnapshot` (despite being useful): `timestamp` (ms since epoch), `jobName`/`jobId` (camelCase), `signal`, `durationMs`, `sanitized` (boolean), `retentionKeepLast`, `redactionHints`.

## Retention / `keep_last`

Retention is enforced after each write via `enforceRetention(snapshotPath, job.retention?.keep_last)`.

Example config fragment:

```yaml
jobs:
  - id: daily-health
    command: "echo ok"
    retention:
      keep_last: 10
```

Behavior:

- When `keep_last` is set (and > 0), the snapshot log file is trimmed down to the **last N non-empty lines**.
- Retention is best-effort; failures to read/write the snapshot file do not fail the job run.

## Security notes

### Redaction

Jobs can opt into output redaction.

- Redaction is applied to captured stdout/stderr when the job sets `redact: true`.
- Snapshot logging also applies redaction when enabled for the job.

Redaction is best-effort and pattern-based; it reduces accidental leakage but is not a security boundary.

### Arbitrary `job.command`

`job.command` is executed via a shell (`spawn(..., { shell: true })`). This is powerful and risky:

- A malicious or unreviewed config can execute arbitrary commands.
- Shell injection is possible if command strings are constructed from untrusted input.

Pragmatic mitigations:

- Treat scheduler configs as code: review changes and avoid running untrusted configs.
- Prefer a command allowlist (or wrapper scripts checked into the repo) rather than interpolated strings.
- Keep output capture opt-in (and consider disabling capture for risky jobs).
- Limit capture size and retention to reduce accidental data persistence.
- Run jobs in a sandbox (container/VM) and under a dedicated, least-privileged account.
- Consider adding a `--dry-run` / sandbox mode when iterating on new commands.
- Redaction is applied to captured output when `job.redact: true`.

## Examples

Non-JSON run (prints captured output to your terminal):

```bash
waif ooda run-job --config tests/fixtures/ooda.valid.yaml --job daily-health
```

JSON run (does not print the raw output; output is in the JSON object):

```bash
waif --json ooda run-job --config tests/fixtures/ooda.valid.yaml --job daily-health
```

Redaction example (what a snapshot line can look like when `redact: true`):

```json
{"time":"2026-01-12T12:34:56.789Z","job_id":"fetch-data","status":"success","exit_code":0,"stdout":"token=[REDACTED]\n","stderr":""}
```

## How to test locally

Run the deterministic E2E test for `run-job`:

```bash
npx vitest tests/run-job.e2e.test.ts
```

Tests should pass before requesting review.

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

New job option: `catchup_on_start` (boolean, default: false)

- When `catchup_on_start: true`, the scheduler will run a one-time catch-up if the most-recent scheduled run was missed prior to startup. The scheduler only runs a single catch-up per job and will not re-run catchups on every restart if the job's next run is in the future.


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

Running the hello-5s example

This repository includes a small example fixture that prints the current time every 5 seconds: `tests/fixtures/ooda.hello-5s.yaml`.

Scheduler mode

Run the scheduler loop with the example config at 5 second intervals and persist snapshots to a file:

```bash
waif ooda scheduler --config tests/fixtures/ooda.hello-5s.yaml --interval 5 --log history/ooda_snapshot_hello.jsonl
```

What to expect:

- Every ~5 seconds the scheduler will execute the `hello-5s` job and append a JSONL snapshot line to `history/ooda_snapshot_hello.jsonl` (or the path you pass with `--log`).
- Each snapshot contains fields such as `time`, `job_id`, `name`, `command`, `stdout`, `stderr`, `exit_code`, and `status`.
- Stop the scheduler with Ctrl-C.

Run-job mode (single-run / debug)

You can execute the job once with `run-job` (useful for debugging or iterating on the command):

```bash
waif ooda run-job --config tests/fixtures/ooda.hello-5s.yaml --job hello-5s --log history/ooda_snapshot_hello.jsonl
```

If you want to mimic the scheduler cadence using `run-job`, run it in a simple shell loop:

```bash
while true; do
  waif ooda run-job --config tests/fixtures/ooda.hello-5s.yaml --job hello-5s --log history/ooda_snapshot_hello.jsonl
  sleep 5
done
```

Viewing snapshots

Tail the snapshot file to observe new runs as they are appended:

```bash
tail -f history/ooda_snapshot_hello.jsonl
```

Portability note

- The fixture uses the `date` command with a format string (`date '+Hello, the time is now %H:%M:%S'`). On GNU/Linux this form works; on some BSD/macOS versions of `date` the format may differ. If you encounter portability issues, replace the `command` with a small Node/POSIX-compatible script checked into the repo and reference that script instead.

Related bd issues:

- `wf-e6r.2.1.1` (implementation work for updated CLI + `run-job`)
- `wf-bkt` (tracking/epic context)
- `wf-4cv` (this documentation task)
