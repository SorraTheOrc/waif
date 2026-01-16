# OODA CLI

OODA is WAIF’s lightweight job scheduler and one-shot runner.

## Quick examples

```bash
# Default behavior: runs the scheduler subcommand
waif ooda

# Scheduler lifecycle (operator surface)
# Default to run scheduler:
waif ooda

# Explicit scheduler invocation:
waif ooda scheduler --config .waif/ooda-scheduler.yaml --interval 30 --log history/ooda_snapshot.jsonl
# Check status by observing the running process or logs; stop the scheduler by terminating the process (Ctrl-C)

# Run one job once (CI-friendly, exits)
waif ooda run-job --job my-job-id --config .waif/ooda-scheduler.yaml --log history/ooda_snapshot.jsonl --json
```

Operator guide (config, snapshots, retention, runner behavior): [`docs/operational/ooda-scheduler.md`](../operational/ooda-scheduler.md)

## Default behavior (no subcommand)

Running `waif ooda` with **no** subcommand defaults to running the scheduler.

- The OODA root action now executes `schedulerAction`.
- Existing subcommands (for example, `scheduler` and `run-job`) are unchanged.

Change implemented in PR: https://github.com/SorraTheOrc/waif/pull/125

## JSON mode (`--json`)

If you pass the global `--json` flag, `scheduler` and `run-job` emit JSON snapshots rather than pretty console output.

Examples:

```bash
waif --json ooda
waif --json ooda scheduler --config .waif/ooda-scheduler.yaml --interval 60
waif --json ooda run-job --job my-job-id
```

## Scheduler behavior and testing guidance

The scheduler is intended to run as a **long-lived loop**.

- For tests and CI, prefer `waif ooda run-job --job <id>` (deterministic, exits).
- If you need scheduler-like coverage in tests, refactor logic so scheduling decisions and job execution can be unit-tested without sleeping/looping.
- A future `--once` / `--dry-run` flag may be added to make loop-based behavior easier to validate.

## Configuration file

The conventional default config location is:

- `.waif/ooda-scheduler.yaml`

Minimal example (for documentation only):

```yaml
jobs:
  - id: my-job-id
    name: Example job
    schedule: "*/5 * * * *"
    command: "echo hello"
```

## Acceptance criteria (wf-dzmc)

- [ ] Doc explains that `waif ooda` defaults to `scheduler`.
- [ ] Doc includes examples for `waif ooda`, `waif ooda scheduler ...`, and `waif ooda run-job ...`.
- [ ] Doc notes JSON output behavior under global `--json`.
- [ ] Doc warns scheduler is long-lived and provides testing/CI guidance.
- [ ] Doc links PR https://github.com/SorraTheOrc/waif/pull/125.

## Scheduling: run a configured job by id

Run a single configured job by id (operator-friendly):

```bash
waif ooda run-job --config .waif/ooda-scheduler.yaml --job daily-health
```

This runs the configured job once and is useful for validating that a scheduled job still works without starting the long-lived scheduler.

## Output capture, redaction, and snapshots

- Output capture is **opt-in** per job via `capture: [stdout]` and/or `capture: [stderr]`.
- `redact: true` applies best-effort redaction to captured streams before printing and before writing snapshots.
- Snapshots are JSONL lines written when `--log <path>` is provided (or defaulted) by `run-job`/`scheduler`.
  - Default snapshot location is under `history/` (see `src/commands/ooda.ts`).

## Output modes

Note: When run interactively (TTY), the scheduler clears the terminal before printing the job header; in CI or non-TTY contexts output is not cleared.



### Non-JSON run (default)

Use this for interactive debugging:

```bash
waif ooda run-job --config tests/fixtures/ooda.valid.yaml --job daily-health
```

Expected behavior:

- If the job config requests capture, captured output is printed to your terminal.
- A snapshot JSONL record may be written, depending on scheduler/run-job logging configuration.

### JSON run (`--json`)

Use this for automation:

```bash
waif --json ooda run-job --config tests/fixtures/ooda.valid.yaml --job daily-health
```

Example JSON (shape matches `src/commands/ooda.ts` emitJson call; streams only appear when captured):

```json
{
  "jobId": "daily-health",
  "status": "success",
  "code": 0,
  "stdout": "ok\n",
  "stderr": null
}
```

## Operator troubleshooting

### Config errors / schema failures

Symptoms:

- Command exits early with validation errors (e.g., missing `jobs[0].schedule`).

Checks:

- Validate required fields: `id`, `name`, `command`, `schedule`.
- Ensure `id` matches `^[a-z0-9-_]+$`.
- Ensure cron expressions are valid (validated by `cron-parser` in `src/lib/config.ts`).

### Job runs but captures nothing

- Ensure `capture` includes `stdout` and/or `stderr`.
  - Example: `capture: [stdout]`
- If you are expecting output in JSON mode, confirm capture is enabled; uncaptured streams are not included.

### Secrets appearing in logs

- Prefer passing secrets via `env:` rather than embedding them in `command`.
- Enable `redact: true` for jobs that might emit tokens.
- In CI, also rely on platform masking (GitHub Actions masks `secrets.*` values automatically in logs when possible).

### Scheduler appears idle / not triggering

- Confirm `schedule` is correct for your environment (cron syntax differences, seconds field support, timezone expectations).
- Confirm the scheduler loop is running (`waif ooda schedule status`).
- Temporarily run the job directly:

```bash
waif ooda run-job --config .waif/ooda-scheduler.yaml --job <id>
```

### Timeouts

If jobs hang, set a timeout:

```yaml
timeout_seconds: 30
```

A timed-out job should report `timeout` status and exit with a non-zero code (see CI notes).
