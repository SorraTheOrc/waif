WF-E6R Implementation Plan — Cron-style OODA Scheduler

Goal
Implement wf-e6r: cron-style OODA scheduler, deterministic run-job CLI, job runner, snapshot writing & retention, tests, and CI sandboxing.

Owner mapping (recommended)
- Scheduler engine (wf-e6r.1): patch
- CLI surface (wf-e6r.3): patch
- Job runner (wf-e6r.4): patch
- Snapshot persistence (wf-e6r.5): patch
- Tests & CI E2E (wf-e6r.6): probe + ship
- Security (wf-cuq): security/architect + scribbler
- Cleanup (wf-e6r.8): patch after verification

Branch naming guidance
- Create short-lived branches per bd task; include bd id in branch name. Examples:
  - wf-e6r.1/scheduler-engine
  - wf-kbi/runner-array-capture
  - wf-3wc/snapshot-metadata

Files to add / change (high-level)
- src/lib/scheduler.ts  — core cron parsing, nextRun calculation, Scheduler class that emits run events (EventEmitter or async callback API)
- src/commands/ooda-schedule.ts — CLI wiring for "waif ooda scheduler" (start/stop/status)
- src/commands/ooda.ts — ensure run-job wiring uses scheduler API for compatibility (no breaking change)
- src/lib/runner.ts — harden runner: accept string or string[] command; array-form executes without shell; string executes with shell only when explicit allowShell option set; capture opt-in; timeout enforcement; structured RunResult
- src/lib/snapshot.ts — centralize snapshot writing, metadata enrichment (durationMs, sanitized, truncated, metadata_version), atomic append, and retention enforcement
- tests/*.test.ts — scheduler unit tests, runner unit tests (including array-form and shell fallback), snapshot unit tests, integration E2E for run-job
- .github/workflows/ci-tests.yml — add sandboxed job that runs run-job E2E inside container or self-hosted runner
- history/ — threat model and implementation notes (history/wf-e6r-implementation-plan.md)

Acceptance criteria (must be explicit/testable)
1) Scheduler runs jobs per cron at minute granularity in unit tests (use cron-parser to simulate time). Tests cover next-run and emission of run events.
2) run-job CLI runs a single job by id, returns structured JSON when --json passed, and writes a snapshot when --log provided.
3) Runner supports array-form commands (exec file + args) and string shell commands (explicit allowShell flag). Tests to verify that array-form avoids shell expansion.
4) Snapshot lines include fields: time (ISO), job_id, name, command (original), status, exit_code, durationMs (int), sanitized (bool), truncated (bool), metadata_version (int), stdout/stderr only when capture requested and redacted when job.redact true.
5) Retention enforced: keep_last trims snapshot file to last N non-empty lines; unit tests simulate trimming behavior.
6) CI E2E: isolated job runs a mock job and asserts snapshot created and retention enforced. Job must run inside sandbox container or self-hosted runner to reduce host risk.
7) Documentation updated: docs/commands/ooda.md documents CLI usage and snapshot shape (already present); update if schema changes.
8) Legacy code removal scheduled under wf-e6r.8 only after verification; do not remove prior to passing E2E.

Implementation steps (suggested order)
1) Scheduler core (wf-e6r.1): implement src/lib/scheduler.ts with small, test-first approach.
2) Runner hardening (wf-kbi / wf-e6r.4): implement array-form support and adjust runJobCommand to accept new RunResult shape.
3) Snapshot module (wf-3wc / wf-e6r.5): move writeJobSnapshot to src/lib/snapshot.ts, add metadata and truncation flags, update call sites.
4) CLI wiring (wf-e6r.3): implement ooda-schedule commands and ensure run-job uses runner and snapshot modules.
5) Tests & CI (wf-e6r.6 + wf-mr1): write unit tests and add sandboxed CI job to run E2E.
6) Security review (wf-cuq): produce threat model doc and mitigations; make recommended code changes (capture opt-in, array-form only by default, redact tests).
7) Open PRs per feature area; link to bd ids and mention manual acceptance steps.

Handoff to implementers
- For each bd task, create a branch from origin/main with the bd id in the name.
- Keep changes small and focused (one area per PR).
- Include tests and update docs in the same PR when relevant.
- Run local tests and the E2E sandbox job before requesting review.

Notes / risks
- Be conservative about shell execution. Prefer array-form commands or wrapper scripts checked into repo.
- Redaction is heuristic; do not treat it as a security boundary. Document residual risk.
- CI sandboxing may add maintenance overhead; coordinate with ship for runner selection.

End of plan
