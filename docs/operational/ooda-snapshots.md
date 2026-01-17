# OODA snapshots (operator notes)

This page is a short operator-facing reference for **OODA JSONL snapshots**: where they are written, how to read them, how retention works, and how output is sanitized by default.

Related:

- OODA scheduler operator guide: [`docs/operational/ooda-scheduler.md`](./ooda-scheduler.md)
- Canonical PRD: [`docs/dev/prd-ooda-loop.md`](../dev/prd-ooda-loop.md)

## What is a snapshot?

A snapshot is **one JSON object per line** (JSONL) representing one completed job run.

## Where snapshots are written

Snapshots are appended by both:

- `wf ooda scheduler` (long-lived loop)
- `wf ooda run-job` (deterministic one-shot; preferred for CI)

Logging is controlled via `--log`:

```bash
# Use the default snapshot location (typically under history/)
wf ooda run-job --config .waif/ooda-scheduler.yaml --job daily-health --log

# Or choose an explicit path
wf ooda run-job --config .waif/ooda-scheduler.yaml --job daily-health --log /var/log/wf/ooda.jsonl
```

A common operator pattern is per-job files under `history/`:

- `history/<job-id>.jsonl`

## Minimal config snippet

`.waif/ooda-scheduler.yaml` example:

```yaml
jobs:
  - id: daily-health
    name: Daily health check
    command: "./scripts/health-check.sh"
    schedule: "0 */6 * * *"

    # Opt-in capture; omit this entirely to persist no stdout/stderr.
    capture: [stdout, stderr]

    # Safe-by-default recommendation.
    redact: true

    retention:
      keep_last: 100
```

## Snapshot line example

Formatted for readability:

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
  "sanitized": true,
  "truncated": false
}
```

## Reading snapshot files

Because snapshots are JSONL, you can read them with standard tools:

```bash
# Tail live runs (scheduler)
tail -f history/daily-health.jsonl

# Inspect the last 5 runs
cat history/daily-health.jsonl | tail -n 5
```

If you need to parse JSONL programmatically, use a JSONL-aware tool or read line-by-line.

## Redaction (safe-by-default)

If `job.redact: true`, captured output is sanitized before it is printed and before it is persisted.

- Implementation: `src/lib/redact.ts`
- Redaction is best-effort; it reduces accidental leakage but is not a security boundary.

Typical behaviors:

- Token-like values (e.g., `sk-...`) are replaced with a redacted form.
- Very large outputs may be truncated and annotated in the persisted output with a marker like:

  ```
  [TRUNCATED 18421 chars]
  ```

Operational guidance:

- Prefer passing secrets through environment variables (`env:`), and avoid echoing them.
- Keep capture minimal; do not enable capture unless you need it.

## Retention

Retention is configured **per job**:

- `jobs[].retention.keep_last: <N>`

Enforcement:

- After appending a new snapshot line, WF keeps the **last N non-empty lines** and removes older entries.

If you do not set `keep_last`, snapshot logs may grow without bound.

## File permissions

Snapshot files can contain operational detail (and may contain incidental sensitive output even with redaction). Treat them as sensitive.

Recommended:

```bash
# Restrict config + logs to the scheduler user
chmod 600 .waif/ooda-scheduler.yaml
chmod 600 history/*.jsonl
```

(Adjust based on your deployment model; for shared environments prefer a dedicated service account and restrictive umask.)
