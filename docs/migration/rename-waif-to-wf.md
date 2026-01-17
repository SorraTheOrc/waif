# Migration: Rename CLI `waif` → `wf` (breaking)

## Summary

The command-line entrypoint for this project has been renamed from `waif` to `wf`.

This is a **breaking change** for any user scripts, CI jobs, shell aliases, or documentation that invoke `waif`.

## What changed

- **Old CLI name:** `waif`
- **New CLI name:** `wf`

The subcommand surface is intended to be the same (for example, `waif next` becomes `wf next`).

## Why we changed it

- Shorter command name.
- Consistent with the project’s “WF” naming in docs and workflows.

## Command mapping

Most users can migrate via a mechanical substitution:

| Before | After |
|---|---|
| `waif --help` | `wf --help` |
| `waif --version` | `wf --version` |
| `waif in-progress` | `wf in-progress` |
| `waif recent` | `wf recent` |
| `waif next` | `wf next` |
| `waif show <id>` | `wf show <id>` |
| `waif ask "..." --agent <name>` | `wf ask "..." --agent <name>` |
| `waif ooda scheduler ...` | `wf ooda scheduler ...` |
| `waif ooda run-job ...` | `wf ooda run-job ...` |

## Migration steps

### 1) Update scripts and automation

Search your repositories for `waif` and replace it with `wf`.

Examples:

```bash
# Before
waif next --json

# After
wf next --json
```

```bash
# Before
waif ooda run-job --config .waif/ooda-scheduler.yaml --job daily-health --json

# After
wf ooda run-job --config .waif/ooda-scheduler.yaml --job daily-health --json
```

### 2) Update shell aliases, functions, and completions

If you have an alias like:

```bash
alias waif=... 
```

Update it to:

```bash
alias wf=...
```

Also update any shell completion configuration that references `waif`.

### 3) Update any documentation or runbooks

If you maintain internal docs that reference commands, update examples and copy/paste snippets to use `wf`.

## Versioning / rollout guidance

This rename should be released in the next **major** version (semver), or otherwise clearly called out as breaking for consumers.

If you are pinning the CLI version in automation:

- Pin to a pre-rename version until you can update scripts.
- Then bump to the release that introduces `wf`.

## Troubleshooting

- **`waif: command not found`**: You installed a version that no longer provides the `waif` entrypoint. Update your scripts to use `wf`.
- **Both commands exist**: If your environment still has an older global install, uninstall the old `waif` package/version and reinstall the current one.
