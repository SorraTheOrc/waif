# PRD: Cron-style OODA Scheduler (canonical OODA)

## Summary

The **Cron-style OODA Scheduler** is the canonical OODA implementation for WAIF: a cron-driven job scheduler plus a deterministic single-job runner.

It enables:

- **Operators** to run a long-lived scheduler loop that executes configured jobs on cron schedules.
- **Developers/CI** to deterministically run a single job (`run-job`) and validate snapshots, retention, and redaction.

This PRD describes the CLI surface, config schema, snapshot JSONL format, retention defaults, safety guidance, and a migration checklist.

## Goals

- Provide a canonical, repo-local OODA loop driven by cron schedules (no external services required).
- Provide a deterministic, testable one-shot runner for CI and local debugging.
- Persist minimal, audit-friendly execution snapshots as JSONL.
- Ensure safety basics: redaction option, secrets masking guidance, and least-privilege recommendations.

## Non-goals

- A full distributed scheduler.
- Automatic secret management beyond best-effort redaction.
- Replacing existing agent/event OODA monitoring. (This PRD is specifically about the **Cron-style scheduler**.)

## CLI surface (canonical commands)

Canonical scheduling commands live under `waif ooda schedule`:

```bash
waif ooda schedule start
waif ooda schedule stop
waif ooda schedule run <id>
waif ooda schedule status
```

Notes:

- `run <id>` runs a configured job once by id (operator-friendly entrypoint).
- A separate developer/CI oriented entrypoint exists for deterministic run execution:

```bash
waif ooda run-job --config <path> --job <id>
```

See usage docs: `docs/usage/ooda.md`.

## Configuration

### Config file

Default path:

- `.waif/ooda-scheduler.yaml`

The file is validated and loaded via:

- `src/lib/config.ts` (`loadConfig`, `validateConfig`)
- `src/lib/schemas/ooda-scheduler.schema.json` (JSON Schema; Ajv validation)

### Schema summary

Top-level:

- `jobs` (array, required, min 1)

Per job (see `src/lib/schemas/ooda-scheduler.schema.json`):

- `id` (string, required): `^[a-z0-9-_]+$`
- `name` (string, required)
- `command` (string, required): executed via shell
- `schedule` (string, required): cron expression (validated by `cron-parser` in `src/lib/config.ts`)
- `cwd` (string, optional): working directory for the command
- `env` (object[string]string, optional): environment variables passed to the job
- `capture` (array enum: `stdout|stderr`, optional): which streams to capture
- `redact` (boolean, optional): whether to redact captured output (best-effort)
- `timeout_seconds` (int >= 1, optional)
- `retention.keep_last` (int >= 1, optional): snapshot retention policy

### Example config (minimal)

```yaml
jobs:
  - id: daily-health
    name: Daily health check
    command: "echo ok"
    schedule: "0 7 * * *"
```

## Snapshot logging (JSONL)

### Snapshot destination

Scheduler and run-job can append snapshots to a JSONL file. Exact wiring is implemented in the OODA command layer; this PRD defines the canonical record shape and operational expectations.

### Single-line example

```json
{"time":"2026-01-12T12:34:56.789Z","job_id":"daily-health","name":"Daily health check","command":"echo ok","status":"success","exit_code":0,"stdout":"ok\n"}
```

### Fields

- `time` (string, ISO-8601 UTC): snapshot timestamp
- `job_id` (string): job id
- `name` (string, optional): job name
- `command` (string): executed command string
- `status` (string): `success | failure | timeout`
- `exit_code` (number|null): exit code
- `stdout` (string, optional): captured stdout (only when configured)
- `stderr` (string, optional): captured stderr (only when configured)

Implementation reference: the writer is currently described in `docs/commands/ooda.md` and implemented in the OODA command module (see repository source).

## Retention

### Defaults

- If `retention.keep_last` is **unset**, do not prune the snapshot file (append-only).
- If `retention.keep_last` is set, keep the **last N non-empty lines** for that job’s snapshot log file.

### Retention config example

```yaml
jobs:
  - id: daily-health
    name: Daily health check
    command: "echo ok"
    schedule: "0 7 * * *"
    retention:
      keep_last: 10
```

Operational guidance:

- Use retention in CI to prevent snapshot logs from growing without bound.
- Use per-job snapshot files for high-volume jobs to reduce contention.

## Safety, redaction, and operator guidance

- **Treat the config as code.** `job.command` is executed via a shell; unreviewed configs can execute arbitrary commands.
- Prefer using `env:` for secrets rather than embedding secrets into `command`.
- If job output may contain secrets, enable `redact: true`.
  - Redaction is best-effort and not a security boundary.
  - CI should still use platform-level masking for known secret values.
- Avoid capturing output unless needed (`capture` should be opt-in).
- Run scheduler jobs under a least-privileged user (especially on shared runners).

## Migration checklist

This checklist is intended for migrating from older OODA approaches (manual scripts, ad-hoc cron, or legacy scheduler command shapes) to the canonical Cron-style OODA scheduler.

1. **Inventory current OODA jobs**
   - Enumerate existing jobs and their cadence.
   - Identify which jobs need output capture and which must be silent.

2. **Create `.waif/ooda-scheduler.yaml`**
   - Define each job with stable `id`, `name`, `command`, and `schedule`.
   - Validate against `src/lib/schemas/ooda-scheduler.schema.json`.

3. **Add minimal safety controls**
   - Move secrets out of `command` strings and into `env` or CI secrets.
   - Enable `redact: true` for jobs that may emit sensitive values.
   - Add `timeout_seconds` for all jobs that could hang.

4. **Decide snapshot strategy**
   - Choose a snapshot log path (recommended under `history/` for local ops; CI should use workspace temp or artifacts).
   - Add `retention.keep_last` for noisy jobs.

5. **Validate deterministically**
   - Run each job locally using:
     ```bash
     waif ooda run-job --config .waif/ooda-scheduler.yaml --job <id>
     ```
   - Confirm snapshots are written and (if set) retention prunes correctly.

6. **Enable scheduling**
   - Start the scheduler using the canonical command:
     ```bash
     waif ooda schedule start
     ```
   - Verify status:
     ```bash
     waif ooda schedule status
     ```

7. **CI adoption**
   - Add a smoke-test job to CI that runs `run-job` for a small fixture job.
   - Add the deterministic E2E test (see `docs/operational/ooda-ci.md`).

8. **Deprecate legacy entrypoints**
   - Update internal docs and scripts to use `waif ooda schedule …` and `waif ooda run-job …`.
   - Remove/stop old cron jobs only after observing a stable period.
