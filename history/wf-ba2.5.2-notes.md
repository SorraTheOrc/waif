Draft notes for wf-ba2.5.2

Created docs/dev/context_selection_strategy.md as the initial PRD-style guidance for eligible repo content to be used as agent context. This is a docs-only change on branch feature/wf-ba2.5.2-docs-only.

Decisions made (draft)
- Default per-file soft limit: 100 KB
- Context pack token budget: ~20,000 tokens (soft)
- Redaction rules: common secret patterns and PEM detection

Open questions
- Do we prefer a lower token budget for some agents (e.g., low-bandwidth contexts)?
- Confirm which maintainers should be PR reviewers for docs changes.

Beads: wf-ba2.5.2

Added Beads metadata guidance to docs/dev/context_selection_strategy.md (see PR #84).
