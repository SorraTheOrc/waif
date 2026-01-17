# Changelog

## Unreleased

### Added
- Implement `waif next` command to select the next open, unblocked issue with rationale and optional `--json` output. (wf-74)
- Document `waif next` behavior and output in `docs/dev/prd-command-next.md` and reference it from `docs/Workflow.md`.
- Render issue titles with configurable type/status symbols (via `config/symbols.json`) and optional truncation. (wf-63w)

### Changed
- Updated `/implement` and workflow docs to reflect the canonical WAIF-driven workflow and landing steps.

### Removed
- Remove CLI subcommands `waif prd`, `waif ask`, and `waif implement` — these are now provided as OpenCode slash commands (`/prd`, `/ask`, `/implement`). This change removes the CLI registration and implementation files; docs updated to point to OpenCode-hosted alternatives. (wf-p46z)

