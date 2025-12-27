# wf-gn7.1.1 spike — opencode-beads review and context-injection prototype

Date: 2025-12-27
Owner: patch

Summary
-------
This spike reviewed the opencode-beads project (https://github.com/joshuadavidthomas/opencode-beads) and prototyped a minimal context-injection proof-of-concept that demonstrates how WAIF could "prime" an OpenCode session with Beads context (bd-prime style) when a session starts or after compaction.

High-level findings
-------------------
- Reusable ideas from opencode-beads:
  - The bd-prime pattern (injecting an initial context payload into an OpenCode session) is directly applicable and useful for reducing repeated agent fetches.
  - Command-surface mirroring (/bd-*) is a pragmatic pattern for exposing bd CLI functionality to OpenCode-driven agents.
  - An autonomous beads-task-agent concept is promising but requires strong safety controls before any autonomous actions are allowed.

- Items requiring WAIF-specific changes:
  - Privacy/scope: context must be scoped to the active session and avoid leaking unrelated Beads issue content between agents or across sessions. Implement per-session context IDs and expiry.
  - Permissions: any command wiring that exposes write operations (close, update, create) must require explicit RBAC checks and operator confirmation.
  - Auditability: actions triggered from OpenCode must be logged and linked back to the originating Beads issue and OpenCode event.

Prototype delivered
------------------
Files added:
- scripts/wf-gn7.1-inject.js — minimal Node script demonstrating how WAIF could inject context into an OpenCode session (POC; requires a running OpenCode server / SDK credentials).
- history/wf-gn7.1-spike.md — this decision record (you are reading it).

The prototype is intentionally small and runnable locally when an OpenCode runtime and credentials are available. See the "How to run" section below.

Recommended follow-ups (created as Beads issues and linked to this spike):
1) "Feature: Wire bd-prime context injection into WAIF OpenCode plugin" — implement integration and tests.
2) "Feature: Mirror bd CLI commands (/bd-*) into OpenCode command surface" — command wiring and safety guards.
3) "Chore: Safety review — autonomous beads-task-agent" — evaluate RBAC, rate limits, audit logs, and required CI checks.

Risks
-----
- Context injection can expose sensitive issue content if scoping is not implemented correctly.
- Autonomous agents acting on behalf of WAIF pose a risk of unintended changes; require human-in-the-loop and explicit policy checks.

How to run the prototype
------------------------
Prerequisites:
- A reachable OpenCode server and credentials (consult your OpenCode runtime docs).
- Node.js installed (v16+), repo dependencies installed (npm install).

Quick demo (POC):
1) Set environment variables for your OpenCode server (example):
   - OPENCODE_URL — base URL for the OpenCode runtime
   - OPENCODE_API_KEY — API key or token for the runtime

2) Run the injector script with a fake session or real session id:

   node scripts/wf-gn7.1-inject.js --session test-session-123 --context '{"beads": "example-prime"}'

The script will attempt to connect to the configured OpenCode runtime and POST a context payload for demonstration. The script is defensive and will error clearly if the runtime is not reachable or credentials are missing.

Notes about the POC
-------------------
- This prototype intentionally does not perform any destructive actions. It demonstrates the pattern (connect, authenticate, post context) and is safe to run against test environments.
- The next step to productionize would be to add per-session scoping, signing of injected payloads, and an audit trail.

Files edited/created by spike
----------------------------
- history/wf-gn7.1-spike.md (created)
- scripts/wf-gn7.1-inject.js (created)

History artifacts
-----------------
All planning artifacts for this spike live under `history/` as required by project rules.
