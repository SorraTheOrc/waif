# OODA (Cron-style scheduler)

OODA provides a cron-style scheduler plus a deterministic one-shot job runner.

- Operator flow: `waif ooda schedule …`
- Developer/CI flow: `waif ooda run-job …`

See also: `docs/dev/prd-ooda-loop.md`.

## Quickstart

### 1) Create a config

Create `.waif/ooda-scheduler.yaml`:

```yaml
jobs:
  - id: daily-health
    name: Daily health check
    command: "echo ok"
    schedule: "0 7 * * *"
    capture: [stdout]
    redact: true
    timeout_seconds: 30
    retention:
      keep_last: 10
```

Config validation references:

- Loader/validation: `src/lib/config.ts`
- JSON schema: `src/lib/schemas/ooda-scheduler.schema.json`

### 2) Run one job now (deterministic)

Human-readable run:

```bash
waif ooda run-job --config .waif/ooda-scheduler.yaml --job daily-health
```

Machine-readable run (top-level `--json`):

```bash
waif --json ooda run-job --config .waif/ooda-scheduler.yaml --job daily-health
```

### 3) Start scheduling

Start the scheduler:

```bash
waif ooda schedule start
```

Check status:

```bash
waif ooda schedule status
```

Stop scheduling:

```bash
waif ooda schedule stop
```

## Scheduling: run a configured job by id

Run a single configured job by id through the scheduling interface:

```bash
waif ooda schedule run daily-health
```

This is the operator-friendly way to trigger a run (e.g., to validate that a scheduled job still works) without changing the schedule.

## Output modes

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

Example JSON (shape may include only captured streams you requested):

```json
{"jobId":"daily-health","status":"success","code":0,"stdout":"ok\n","stderr":""}
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
