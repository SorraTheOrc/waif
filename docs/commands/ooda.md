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

Related bd issues:

- `wf-e6r.2.1.1` (implementation work for updated CLI + `run-job`)
- `wf-bkt` (tracking/epic context)
- `wf-4cv` (this documentation task)
