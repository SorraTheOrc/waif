# OODA in CI

This note documents how to validate the Cron-style OODA scheduler and `run-job` behavior in CI.

## What to run where

Recommended layers:

1. **Unit tests** (fast)
   - Run on every PR, GH-hosted runners are fine.
   - Includes configuration validation and job runner unit tests, e.g. `tests/ooda-run-job.test.ts`.

2. **Deterministic E2E** (still fast, but executes a real command)
   - Run on every PR (or at least on main branch merges).
   - Uses `tests/run-job.e2e.test.ts` and `tests/wf-e6r.2.14.cli-e2e.test.ts`.

3. **Sandbox smoke test** (optional; matrix job)
   - A minimal “end-to-end” smoke run of `waif ooda run-job` against a safe fixture config.
   - Useful to catch runner-specific issues (shell availability, Node version oddities, filesystem permissions).

## Secrets masking and redaction

### Masking guidance

- Dont print secrets.
- Prefer CI masking + avoidance over redaction.
- If a job must touch secrets:
  - Pass via environment variables.
  - Keep `capture` minimal.
  - Keep retention low.


Guidelines:

- Prefer secrets via environment variables (CI secrets) rather than embedding into `job.command`.
- `job.redact: true` provides best-effort redaction of captured output, but is not a security boundary.
- On GitHub Actions:
  - `secrets.*` values are masked in logs when they match output exactly.
  - Avoid printing secrets; masking is not guaranteed for transformed/partial values.
- If you must capture logs, keep retention low and avoid uploading raw snapshot files as artifacts unless necessary.

## Recommended CI job layout

### Suggested jobs

1. **sandbox-smoke** (fast, safe)
   - Runs `waif ooda run-job` against a minimal fixture config.
   - Writes snapshots to a temp path.
   - Does not require secrets.

2. **run-job** (deterministic E2E)
   - Runs the two deterministic E2E tests:
     - `tests/run-job.e2e.test.ts`
     - `tests/wf-e6r.2.14.cli-e2e.test.ts`

### Example (conceptual)

- `unit` (matrix): `npm test` / `npx vitest`
- `sandbox-smoke` (single env): `waif ooda run-job ...`
- `run-job` (single env): vitest E2E specs above

## Recommended CI matrix placement

Add OODA checks into the existing test matrix as follows:

- **Primary Node version** (e.g., the repo’s default Node version):
  - Run unit tests + deterministic E2E.
- **Optional additional Node versions / OSes**:
  - Run only unit tests, unless there is a known portability concern.

Rationale: `run-job` uses shell execution and filesystem writes; E2E is stable but slow compared to pure unit tests, so it’s best concentrated on a single representative environment.

## Sandbox smoke test description

A smoke test should:

- Use a safe fixture command (e.g., `node tests/helpers/exit.js 0` or `echo ok`).
- Write snapshots to a temp path.
- Enforce retention to confirm pruning is working.

The repository already includes a deterministic E2E test that covers these behaviors.

## How to run the deterministic E2E tests locally

Run the snapshot/retention E2E:

```bash
npx vitest tests/run-job.e2e.test.ts
```

Run the CLI integration E2E:

```bash
npx vitest tests/wf-e6r.2.14.cli-e2e.test.ts
```

This test:

- Creates a temporary YAML config
- Executes `waif ooda run-job` programmatically
- Asserts that a single JSONL snapshot line is written
- Asserts retention enforcement (`keep_last: 1`)

## Runner selection (self-hosted vs GH-hosted)

New option: `catchup_on_start`

- If you enable `catchup_on_start` for jobs, the scheduler may execute a one-time run at startup when it detects a missed run. For CI runners and automated environments, prefer leaving `catchup_on_start` disabled unless you explicitly want startup catchups to execute (e.g., recovering missed runs after outages).
- Catch-ups are run sequentially during scheduler startup.
- If the cron parser cannot compute a previous occurrence for a schedule, the scheduler will skip catchup for that job and emit an INFO-level log message.


- **GH-hosted runners**
  - Simpler and recommended by default.
  - Lower risk of accidentally exposing secrets from shared host state.
  - Tight, predictable permissions model.

- **Self-hosted runners**
  - Useful when jobs need access to internal networks/services.
  - Higher operational risk: jobs run arbitrary shell commands (`job.command`), so ensure strict least-privilege and isolation.
  - Validate that repository/runner permissions do not allow unintended secret access.

Permissions implications:

- A workflow that runs `ooda` should not need elevated GitHub token permissions.
- Keep `GITHUB_TOKEN` permissions minimal, especially if self-hosted.

## Suggested required checks (branch protection)

Suggested required checks (names will depend on your workflow):

- `unit` (or equivalent vitest/unit test job)
- `run-job` (deterministic E2E)
- `sandbox-smoke` (optional but recommended)

## References

- Config loader/validation: `src/lib/config.ts`
- Config schema: `src/lib/schemas/ooda-scheduler.schema.json`
- Deterministic E2E: `tests/run-job.e2e.test.ts`
