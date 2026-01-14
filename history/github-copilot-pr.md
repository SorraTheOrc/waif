# GitHub Copilot PR Actions fallback test

Approach: Actions fallback workflow that runs on pull_request.opened and posts a comment via GITHUB_TOKEN using actions/github-script.

Commands run and outputs are recorded in the session logs. PRs created:
- ci: copilot-pr-check (branch: copilot-pr/setup) - https://github.com/SorraTheOrc/waif/pull/113
- test: copilot pr check (branch: ci/copilot-pr-check) - https://github.com/SorraTheOrc/waif/pull/114

Workflow run (copilot-pr/setup): https://github.com/SorraTheOrc/waif/actions/runs/20983184415

Observations:
- The workflow triggered on PR open as expected.
- The actions/github-script step failed with: "Resource not accessible by integration" (HTTP 403). This is expected for workflows triggered from forked PRs or when GITHUB_TOKEN lacks pull_request write permission for this repository's settings. The runner log shows the full error.

Verification that workflow runs only on opened:
- After opening PR 114 (test PR), the workflow for that PR is in_progress (run id 20983191151). The original workflow run for PR 113 completed with failure. We pushed an empty commit to ci/copilot-pr-check to verify that the workflow did not re-run; the logs show only one run for the Copilot PR-on-open workflow.

Timestamps:
- PR 113 created: workflow run 2026-01-14T05:11:09Z (run id 20983184415)
- PR 114 created: workflow run started 2026-01-14T05:11:29Z (run id 20983191151) -- in progress at time of capture

Errors encountered:
- Resource not accessible by integration (403) when trying to post a review via the GITHUB_TOKEN. Root causes and mitigations:
  - If workflow runs on PRs from forks, GITHUB_TOKEN cannot perform certain write operations. Use repository_dispatch or request a maintainer to use a PAT with appropriate scope, or configure workflow to run in the base repository with 'pull_request_target' if safe (careful: security implications).

