# OODA Scheduler in CI

This document describes how to run the deterministic OODA scheduler E2E in CI.

References:

- Config loader: `../../src/lib/config.ts`
- Schema: `../../src/lib/schemas/ooda-scheduler.schema.json` (authoritative; location may vary by branch)
- Redaction: `../../src/lib/redact.ts`

## Test model

CI should use a deterministic test that:

1) sets the test job's `job.command` to a small, deterministic command (a committed fixture script, or a script that reads a committed fixture),
2) executes the command handler deterministically (either by running the configured `job.command` or by invoking the command handler in-process with injected fixtures),
3) asserts on the JSON output or on a single written snapshot JSONL line.

This is preferred over using a real OpenCode server.

## Environment variables

Recommended (examples):

- `CI=1`
- `NODE_OPTIONS=--max_old_space_size=4096` (avoid OOM on constrained runners)
- If your test uses snapshot output files, set a temp directory:
  - `WAIF_TEST_TMPDIR=${{ runner.temp }}`

Avoid putting secrets in env vars that may be printed into logs.

## Timeouts

Recommendations:

- Keep the deterministic E2E timeout short: **30s**.
- Use runners with sufficient disk/IO; JSONL reads/writes are small but filesystem performance variability can cause flakiness.

## OS matrix suggestion

Run the deterministic E2E across at least:

- ubuntu-latest
- macos-latest

Windows can be added later, but path handling and line endings should be validated first.

## Running locally

Run full tests:

```bash
npm test
```

Run a single deterministic command locally (example):

```bash
./tests/fixtures/ooda/emit_snapshot_fixture.sh tests/fixtures/opencode/events.small.jsonl
```

Alternatively, run the same command your test config sets as `job.command`.

## Minimal GitHub Actions snippet

```yaml
name: ooda-e2e
on:
  pull_request:

jobs:
  ooda-deterministic:
    runs-on: ubuntu-latest
    timeout-minutes: 1
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test
      - name: Deterministic OODA E2E
        run: |
          # Option A: run a small fixture-backed command (recommended)
          ./tests/fixtures/ooda/emit_snapshot_fixture.sh tests/fixtures/opencode/events.small.jsonl > history/ooda_snapshot_ci.jsonl

          # Option B: invoke the command handler in-process with injected fixtures
          # (use your project's existing npm script/test entrypoint)
          npm run test:e2e:ooda
```

Notes:

- Prefer `node dist/index.js` in CI after `npm run build` if your pipeline separates build and test.
- Always keep fixtures small and committed to avoid timing variance.
