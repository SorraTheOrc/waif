# OODA in CI

This note documents how to validate the Cron-style OODA scheduler and `run-job` behavior in CI.

## What to run where

Recommended layers:

1. **Unit tests** (fast)
   - Run on every PR, GH-hosted runners are fine.
   - Includes configuration validation and job runner unit tests, e.g. `tests/ooda-run-job.test.ts`.

2. **Deterministic E2E** (still fast, but executes a real command)
   - Run on every PR (or at least on main branch merges).
   - Uses `tests/run-job.e2e.test.ts`.

3. **Sandbox smoke test** (optional; matrix job)
   - A minimal “end-to-end” smoke run of `waif ooda run-job` against a safe fixture config.
   - Useful to catch runner-specific issues (shell availability, Node version oddities, filesystem permissions).

## Secrets masking and redaction

Guidelines:

- Prefer secrets via environment variables (CI secrets) rather than embedding into `job.command`.
- `job.redact: true` provides best-effort redaction of captured output, but is not a security boundary.
- On GitHub Actions:
  - `secrets.*` values are masked in logs when they match output exactly.
  - Avoid printing secrets; masking is not guaranteed for transformed/partial values.
- If you must capture logs, keep retention low and avoid uploading raw snapshot files as artifacts unless necessary.

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

## How to run the deterministic E2E test locally

Run only the deterministic E2E:

```bash
npx vitest tests/run-job.e2e.test.ts
```

This test:

- Creates a temporary YAML config
- Executes `waif ooda run-job` programmatically
- Asserts that a single JSONL snapshot line is written
- Asserts retention enforcement (`keep_last: 1`)

## Runner selection (self-hosted vs GH-hosted)

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

## References

- Config loader/validation: `src/lib/config.ts`
- Config schema: `src/lib/schemas/ooda-scheduler.schema.json`
- Deterministic E2E: `tests/run-job.e2e.test.ts`
