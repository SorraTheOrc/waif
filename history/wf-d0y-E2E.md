wf-d0y: OODA scheduler E2E run instructions

Local run:
- Node 18+, npm
- npm ci
- npm run test -- tests/integration/ooda-scheduler-e2e.test.ts

CI:
- Workflow: .github/workflows/ooda-e2e.yml (runs on ubuntu-latest)
- Timeboxed to 10 minutes (timeout-minutes: 10)
- Artifacts: uploads vitest results and snapshot logs

Env vars:
- none required; tests write temporary files under /tmp

Sample output:
- history/<job_id>.jsonl with lines like:
  { "time": "2026-01-13T...Z", "job_id": "e2e-job", "name": "e2e job", "command": "node -e \"console.log('hello')\"", "status": "success", "exit_code": 0, "stdout": "hello\n" }

Notes:
- Uses programmatic createOodaCommand invocation (no child processes) to keep tests deterministic.
- If CI runners are flaky for spawn + shell, consider switching job to self-hosted runner with restricted permissions.
