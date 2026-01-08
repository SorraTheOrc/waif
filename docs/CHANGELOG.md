# Changelog

## Unreleased

### Added

- wf-e6r.2.1 (Config Loader & Validation): Cron-style OODA Scheduler config loader + schema validation.
  - Closed beads: wf-e6r.2.4, wf-e6r.2.5, wf-e6r.2.6, wf-e6r.2.7, wf-e6r.2.8, wf-e6r.2.9, wf-e6r.2.10, wf-e6r.2.11, wf-e6r.2.12, wf-e6r.2.13, wf-e6r.2.14, wf-e6r.2.15.
  - Test approach: deterministic E2E added in wf-e6r.2.14 uses a small `--events` fixture and `--once` execution to avoid reliance on a real OpenCode server; keep CI timeouts short (~30s).
