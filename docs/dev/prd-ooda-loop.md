# PRD: Cron-style OODA Scheduler (canonical OODA)

## Summary

The **Cron-style OODA Scheduler** is the canonical OODA implementation for WF: a cron-driven job scheduler plus a deterministic single-job runner.

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

## Users

- **Operators (humans)**: need a safe, repeatable way to schedule and manually trigger health/maintenance jobs.
- **CI / Release engineers**: need deterministic, non-flaky validation of job execution, logging, redaction, and retention.
- **Developers**: need a local reproduction path for failures seen in CI and prod.

## Success criteria

- A repo can define jobs in `.waif/ooda-scheduler.yaml` and validation failures are clear.
- Operators can start the scheduler and trigger a job run by id.
- Developers/CI can run a job once deterministically without starting a long-lived loop.
- Snapshot JSONL records are written in a stable format and retention behaves as configured.
- Safety-by-default guidance is followed (capture opt-in, retention, timeouts, least privilege).

## CLI surface (canonical commands)

Canonical commands:

```bash
# long-lived cron-style loop
wf ooda scheduler --config .waif/ooda-scheduler.yaml

# deterministic one-shot runner (used by CI)
wf ooda run-job --config .waif/ooda-scheduler.yaml --job <id>

# optional: write snapshots somewhere specific
wf ooda run-job --config .waif/ooda-scheduler.yaml --job <id> --log history/ooda_snapshot.jsonl
```

Note: the CLI presently implements `ooda scheduler` and `ooda run-job`. If we also want an alias surface like `ooda schedule start|stop|run|status`, track that as a follow-up.

Notes:

- `run <id>` runs a configured job once by id (operator-friendly entrypoint).
- A separate developer/CI oriented entrypoint exists for deterministic run execution:

```bash
wf ooda run-job --config <path> --job <id>
```

See usage docs: `docs/usage/ooda.md`.

## Configuration

### Example config snippet (.waif/ooda-scheduler.yaml)

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

## Snapshot Persistence & Redaction

This section defines the canonical snapshot persistence format and the operator expectations for redaction and retention.

### Snapshot destination

Both `wf ooda run-job` and `wf ooda scheduler` can append snapshots to a JSONL file.

- Use `--log <path>` to choose an explicit snapshot file.
- If `--log` is omitted, snapshots are appended to a default under `history/` (typically `history/<job-id>.jsonl`).

CLI examples:

```bash
# Run one job once and append a snapshot line
wf ooda run-job --config .waif/ooda-scheduler.yaml --job daily-health --log

# Run one job once and write snapshots to a custom file
wf ooda run-job --config .waif/ooda-scheduler.yaml --job daily-health --log /var/log/wf/ooda.jsonl

# Run the long-lived scheduler and append snapshots
wf ooda scheduler --config .waif/ooda-scheduler.yaml --interval 30 --log
```

Notes:

- `--log` with no path uses the default location.
- Snapshot files are JSONL (one JSON object per line). They are safe to `tail -f` and easy to ingest.

### Snapshot JSONL record shape (example)

A single snapshot line (formatted here for readability):

```json
{
  "time": "2026-01-12T12:34:56.789Z",
  "job_id": "daily-health",
  "name": "Daily health check",
  "command": "./scripts/health-check.sh",
  "status": "success",
  "exit_code": 0,
  "stdout": "ok\n",
  "stderr": "",
  "sanitized_output": "ok\n",
  "summary": "ok",
  "durationMs": 12,
  "metadata_version": 1,
  "sanitized": true,
  "truncated": false
}
```

Field notes (stable intent):

- `time`: ISO-8601 timestamp when the run completed.
- `job_id`, `name`, `command`: job identity and executed command.
- `status`: `success | failure | timeout`.
- `exit_code`: numeric exit code, or `null` if not available.
- `stdout` / `stderr`: captured streams (present only when capture is enabled).
- `sanitized_output`: combined captured output after redaction/truncation (when available).
- `summary`: short operator-friendly summary (when available).
- `durationMs`: elapsed wall time in milliseconds.
- `metadata_version`: snapshot schema version marker.
- `sanitized`: whether redaction was applied.
- `truncated`: whether output was truncated.

Implementation references:

- Snapshot write/retention enforcement: `src/commands/ooda.ts`.

### Redaction and truncation

Redaction is applied to captured output when `job.redact: true`.

- Implementation: reuse `src/lib/redact.ts`.
- Redaction is best-effort and is not a security boundary.

Examples:

- Token-like values are replaced before printing and before persisting snapshots.

  Input:

  ```
  Authorization: sk-live-abc123
  ```

  Persisted (example):

  ```
  Authorization: sk-REDACTED
  ```

- Very large outputs are truncated, and the truncation is explicitly marked:

  Persisted (example):

  ```
  <first part of output>
  [TRUNCATED 18421 chars]
  ```

### Retention policy

Retention is configured per job, and enforced after a snapshot is appended.

- Config path: `jobs[].retention.keep_last`
- Enforcement: keep the last `N` non-empty JSONL lines in the snapshot file; drop older lines.

Recommended operator policy:

- Default: **keep_last = 100** per job.
- Note: the snapshot library implementation may default to a lower number (currently 10); operators should explicitly set `jobs[].retention.keep_last` to the policy value in `.waif/ooda-scheduler.yaml`.

Example:

```yaml
jobs:
  - id: daily-health
    name: Daily health check
    command: "./scripts/health-check.sh"
    schedule: "0 7 * * *"
    retention:
      keep_last: 100
```

### Migration notes (legacy tmux/probe removal)

Before removing legacy tmux/probe-based mechanisms, validate the integrated snapshots and retention end-to-end.

Recommended acceptance checklist:

1. **Unit tests** pass (snapshot writer + retention behavior).
2. **E2E** test validates:
   - a snapshot line is written for `run-job`
   - outputs are sanitized/truncated as expected
   - `keep_last` is enforced
3. **Manual operator verification**:
   - run `wf ooda run-job --config .waif/ooda-scheduler.yaml --job <id> --log`
   - confirm `history/<job-id>.jsonl` (or custom `--log`) exists and is append-only
   - confirm file permissions are appropriate for your environment (see operator doc)

Related docs:

- Operator guide: `docs/operational/ooda-scheduler.md`
- CI guidance: `docs/operational/ooda-ci.md`

## Retention

See **Snapshot Persistence & Redaction → Retention policy** for the canonical retention definition and recommended defaults.

## Safety-by-default (recommended)

- **Capture is opt-in** (`capture: [...]`). Default to no capture.
- **Prefer array-form commands** (follow-up): current schema/implementation uses `command: <string>` with `shell: true`; prefer a future `command: ["cmd", "arg"]` form to reduce shell-injection risk.
- **Per-job timeouts** (`timeout_seconds`) to constrain hangs.
- **Retention** (`retention.keep_last`) to bound snapshot growth.
- **Run as an unprivileged user** (especially on self-hosted runners).
- **Use a containerized sandbox** for high-risk jobs (network + filesystem isolation).

## Safety, redaction, and operator guidance

See also: `docs/operational/ooda-snapshots.md` for a concise operator runbook-style reference.

- **Treat the config as code.** `job.command` is executed via a shell; unreviewed configs can execute arbitrary commands.
- Prefer using `env:` for secrets rather than embedding secrets into `command`.
- If job output may contain secrets, enable `redact: true`.
  - Redaction is best-effort and not a security boundary.
  - CI should still use platform-level masking for known secret values.
- Avoid capturing output unless needed (`capture` should be opt-in).
- Run scheduler jobs under a least-privileged user (especially on shared runners).

