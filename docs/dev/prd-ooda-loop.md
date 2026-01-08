# PRD: Cron-style OODA Scheduler (Config Loader & Validation)

## Objective

Make the **Cron-style OODA Scheduler** the canonical way to run `waif ooda` in an automated, repeatable way.

The scheduler loads a single YAML config file (default: `.waif/ooda-scheduler.yaml`), validates it, then runs one or more OODA jobs on a cron schedule. Each job typically runs `waif ooda --once` against a chosen OpenCode events source and writes JSONL snapshot lines for audit/debugging.

This PRD describes operator-visible behavior and the config surface. Implementation lives in:

- Config loader: `../../src/lib/config.ts`
- JSON Schema: `../../src/lib/schemas/ooda-scheduler.schema.json` (authoritative; location may vary by branch)

## CLI

Canonical commands:

- **Run a scheduler loop** (uses config):
  - `waif ooda scheduler --config .waif/ooda-scheduler.yaml`
- **Run a single scheduled job once** (for CI and debugging):
  - `waif ooda run --config .waif/ooda-scheduler.yaml --job <jobId> --once`

Operationally, the scheduler should be run as a long-lived process (systemd/user service, tmux, or CI step). Jobs always execute in a bounded manner (one probe cycle) and exit with a non-zero status on validation errors.

## Config schema summary (short)

The authoritative schema is `../../src/lib/schemas/ooda-scheduler.schema.json`.

High-level fields (summary only):

- `version` (string): schema version.
- `scheduler` (object): scheduler-level defaults.
  - `timezone` (optional string): cron evaluation timezone.
- `retention` (object): snapshot retention policy.
  - `maxFiles` (integer)
  - `maxDays` (integer)
  - `maxBytes` (integer)
- `jobs` (array): one or more jobs.
  - `id` (string): stable id, used for selection (`--job`).
  - `name` (string): human label.
  - `cron` (string): cron schedule expression.
  - `events` (string): path to the OpenCode JSONL events source (used by `--events`).
  - `snapshot` (object): snapshot writer settings.
    - `path` (string): JSONL output path (recommend under `history/`).
    - `mode` (`append`|`rotate`): write strategy.
  - `capture` (object): what to emit.
    - `includeRawEvents` (boolean): defaults false; never required for ops.

Validation rules:

- YAML must parse.
- Schema must validate.
- `jobs[].id` must be unique and match allowed pattern.
- `jobs[].cron` must pass cron syntax check.

## Snapshot JSONL shape (one line)

Jobs write snapshots as JSONL objects. Minimal canonical line shape:

```json
{"time":"2026-01-08T12:00:00.000Z","job":"probe-map","agent":"map","status":"Busy","title":"wf-e6r.2.1/config-loader","reason":"opencode-event"}
```

Notes:

- Snapshot fields are intentionally minimal and safe to persist.
- Titles/reasons MUST be sanitized before writing.

## Retention defaults

Defaults should be safe for developer laptops and CI runners:

- Keep `maxDays: 7`
- Keep `maxFiles: 50`
- Keep `maxBytes: 50_000_000` (50MB)

Retention is best-effort: failures to prune must not prevent the scheduler from producing current snapshots, but should be surfaced to stderr.

## Safety & redaction guidance

Operator rules:

- Treat `.waif/ooda-scheduler.yaml` as a **sensitive operator file**:
  - Recommended permissions: `chmod 600 .waif/ooda-scheduler.yaml`
  - Run as a dedicated user (do not run as root unless required by your environment).
- **Never persist secrets**:
  - Do not include API keys/tokens in config fields that might be included in snapshots/logs.
  - Snapshot writes must apply redaction; see `../../src/lib/redact.ts`.
- Prefer paths under `history/` for snapshots and keep them out of committed artifacts.

## Migration checklist

- Legacy removal note: existing tmux-based or ad-hoc probe scripts should be removed or deprecated once the scheduler config is adopted.
- Create `.waif/ooda-scheduler.yaml` from an operator-approved template.
- Validate config locally:
  - `waif ooda run --config .waif/ooda-scheduler.yaml --job <jobId> --once`
- Enable the long-running scheduler in your chosen process supervisor.
- Confirm snapshots are being written and pruned per retention.
