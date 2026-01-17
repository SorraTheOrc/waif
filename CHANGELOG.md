# Changelog

## Unreleased

### Added
- Implement `wf next` command to select the next open, unblocked issue with rationale and optional `--json` output. (wf-74)
- Document `wf next` behavior and output in `docs/dev/prd-command-next.md` and reference it from `docs/dev/Workflow.md`.
- Render issue titles with configurable type/status symbols (via `config/symbols.json`) and optional truncation. (wf-63w)

### Changed
- **Breaking:** Rename CLI entrypoint from `waif` to `wf`. Update scripts, CI, and docs to use `wf` (see `docs/migration/rename-waif-to-wf.md`).
- Updated `/implement` and workflow docs to reflect the canonical WF-driven workflow and landing steps.

