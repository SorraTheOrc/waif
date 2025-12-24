# Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```

## Starting Work (branch-per-bd)

All work MUST be done on branches that use the beads prefix and id. Branch names MUST follow the form `<beads_prefix>-<id>/<short-desc>` (for example `bd-123/fix-ask-prompt` or `wafi-73k/add-feature`). There can be only one canonical branch per beads id.

Before creating a branch, check for existing branches that start with the beads prefix and id (locally or on `origin`) and reuse them if present. Record your involvement in the bd comments when you start work in the branch.

Example:

```bash
# Sync main
git fetch origin
git checkout main
git pull --rebase

# Check for existing branches matching the beads id (replace bd-123)
git branch --list "bd-123*"        # local
git ls-remote --heads origin "bd-123*"  # remote

# If none exist, create the canonical branch:
git checkout -b bd-123/short-desc

# If a branch exists, reuse it:
git checkout bd-123/short-desc
```

Agent guidance:

- Agents MUST use branch names that include the beads prefix and id.
- If an agent works in a branch, it MUST record its involvement in bd comments.
- Agents should avoid editing files that other agents have declared they are working on in bd unless coordination is recorded.
- Follow permission files in `.opencode/agent/*.md` for push/merge policies.

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**

- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
