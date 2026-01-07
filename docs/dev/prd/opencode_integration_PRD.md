Title: WAIF — OpenCode Integration PRD

Overview
WAIF must provide a reproducible, testable integration with OpenCode so developers can install, register, and use an OpenCode runtime for local development and agent workflows. This PRD defines the waif setup flow, the package manifest location, hook lifecycle, CLI primitives (waif prime/opencode), acceptance criteria, security constraints, test plan, and rollout guidance.

Goals / Success criteria
- Developers can run a single command (waif setup opencode-hooks) that validates prerequisites, optionally installs required system packages (with confirmation), and registers WAIF plugin(s) with a local OpenCode server.
- A waif prime/opencode command exists to inject compact priming context during lifecycle events (session.start, pre-compact).
- Priming payloads are budgeted to ~1k–2k tokens by default; summarization/token utilities exist (summarize(text,targetTokens), countTokens(text)).
- Installer exposes a health-check: emits a test OpenCode event and verifies OODA loop consumption.
- Security: priming context never leaks secrets; a redaction utility and threat-model checklist exist before enabling any skills.
- Full CI coverage: E2E tests run on Linux runners exercising installer, priming, event emission, and OODA detection.

Constraints
- Platform: Linux only (including WSL). No macOS-specific automation.
- Package list: externalized in config/waif_pacakges.yaml (editable YAML).
- Default: do NOT enable plugin-specific skills by default. Opt-in flag required to enable.
- Installer policy: waif setup may attempt sudo apt installs after explicit user confirmation (Option B as requested).
- Rollback policy: on partial failure waif setup will NOT attempt full automatic rollback; it will emit clear diagnostics and manual cleanup instructions (Option 2).

Non-Goals
- Do not ship a default enabled set of OpenCode skills. Skills are opt-in only.
- Do not attempt to manage external CI runner credentials or cloud infra in the initial implementation.

User flows
1) Developer installs prerequisites (manual or via waif setup):
   - waif setup opencode-hooks
     - Validate OpenCode server is reachable (local socket/HTTP) or provide instructions to start one
     - Validate required system packages from config/waif_pacakges.yaml
     - Prompt user to allow sudo installs (apt) when packages missing; on confirmation, run sudo apt install <packages>
     - Register WAIF OpenCode plugin with the OpenCode runtime
     - Run smoke health check: emit a test event and assert OODA notices it
     - On success: print verification and uninstall instructions
     - On failure: print diagnostics and manual cleanup steps

2) Developer runs WAIF prime to inject compact context
   - waif prime opencode --issue bd-123 --budget 1500
     - Loads issue context (title, short description, latest comments) and runs summarize() to fit within token budget
     - Calls OpenCode plugin registration endpoint to attach priming for session lifecycle events
     - Optionally logs the generated priming payload to a local artifact for debugging (redacted)

3) CI E2E job (Linux runner)
   - Checkout fresh main
   - Run waif setup opencode-hooks --noninteractive (CI mode) — CI will provide sudo if allowed by runner
   - Run a small agent session that triggers session.start -> plugin emits event -> waif OODA pipeline detects and stores event
   - Upload logs/artifacts for debugging

Hook lifecycle
- session.start: emit compact context about active BD issue, assigned actor, and last 3 messages; used to seed agent session
- pre-compact: run before compaction to provide summarization hooks; payloads should be restricted to non-sensitive metadata by default
- Unregister: cleanup handler to remove the plugin registration from OpenCode

Security & secrets handling
- Primary rule: priming payloads MUST NOT contain raw secrets (API keys, tokens, passwords, private keys).
- Provide a redaction utility (configurable patterns) that removes:
  - strings that match common secret patterns (API keys, private keys)
  - values in known secret paths (e.g., env var names in .env files)
- Threat model checklist (deliverable): document where sensitive data can appear, who can access priming artifacts, and the approval process to enable skills.
- Approval gate: enabling any skill that exposes broader context requires a security reviewer signoff (recorded in wf-gn7.2.7).

Testing / CI
- Unit tests: summarize() and countTokens() behaviors, redaction tests, CLI flag parsing
- Integration tests: plugin registration, event emission, and OODA detection on a local OpenCode instance
- E2E CI job: run on Linux runner; perform installer flow, run prime, assert event seen; artifact upload for logs
- CI requirements: runner must be allowed to run sudo for apt installs in noninteractive mode (if chosen for CI). If not possible, CI should use a container image that already contains required system packages.

Installer policy & UX
- Default behavior: detect missing system packages from config/waif_pacakges.yaml and present a prompt to the user:
  - "The following packages are required: <list>. Allow waif to run sudo apt install? [y/N]"
  - If user consents, run apt install; otherwise, print step-by-step instructions and exit with a non-zero status
- Provide --yes/--noninteractive flags for scripted installs (CI) but require the runner to provide appropriate privileges
- On failure, provide a clear diagnostics bundle and manual cleanup instructions (no automatic rollback)

Deliverables / timeline (suggested)
- M1 (1–2 days): Draft PRD (this document) and package YAML stub at config/waif_pacakges.yaml; create skeleton CLI commands: src/commands/prime_opencode.ts; src/lib/hooks/opencode.ts; basic tests stubs
- M2 (3–5 days): Implement waif prime/opencode CLI and priming utils (summarize, countTokens) with unit tests
- M3 (3–5 days): Implement waif setup opencode-hooks installer (with sudo flow) and smoke health-check; document manual cleanup steps
- M4 (2–4 days): CI E2E tests and artifact upload; security review and redaction utility; opt-in skills gating

Files to add / edit
- docs/dev/opencode_integration_PRD.md  (this file)
- config/waif_pacakges.yaml  (package manifest stub)
- src/commands/prime_opencode.ts  (CLI skeleton)
- src/lib/hooks/opencode.ts  (hook registration + emitter)
- src/lib/priming/summarize.ts  (summarize & token counting)
- tests/unit/priming.test.ts
- tests/e2e/opencode_hooks.test.ts
- history/wf-gn7.*.md (spike artifacts and threat model)

Owners (tentative, assigned by agents)
- wf-gn7.2.1 (CLI hooks): patch
- wf-gn7.2.2 (installer + health checks): ship
- wf-gn7.2.3 (priming utils): patch
- wf-gn7.2.4 (opt-in skills): scribbler
- wf-gn7.2.5 (MCP fallback): ship
- wf-gn7.2.6 (CI E2E): ship
- wf-gn7.2.7 (security & redaction): probe

Outstanding decisions & notes
- No provider seeding required per request (opencode will handle provider configuration interactively)
- Package YAML filename uses the provided: config/waif_pacakges.yaml
- Installer will attempt sudo apt installs with explicit consent (Option B)
- Rollback is manual (Option 2)

Acceptance criteria (concise)
- waif setup opencode-hooks runs on a Linux dev machine, validates prerequisites, registers WAIF plugin, and passes the smoke health-check
- waif prime opencode registers priming hooks and emits priming payloads on session.start and pre-compact
- Priming payloads are constrained to configured token budgets and pass redaction checks
- CI E2E job executes on Linux and produces logs/artifacts demonstrating successful event flow

Next actions (I will perform if you confirm)
1) Create initial stub files for config/waif_pacakges.yaml and docs/dev/opencode_integration_PRD.md (Done)
2) Create CLI skeletons and test stubs (src/commands/prime_opencode.ts, src/lib/hooks/opencode.ts, src/lib/priming/*)
3) Post a bd comment linking the PRD and listing created files
4) Assign owners to child bd issues (done per tentative mapping)


---

# Product Requirements Document

## Introduction

- One-liner
  - Product: OpenCode OODA plugin for WAIF — registerable OpenCode plugin that streams raw OpenCode events to the waif OODA pipeline and writes raw event JSON to stdout.

- Problem statement
  - The current waif OODA implementation depends on tmux for live monitoring and visibility. This dependency complicates runtime environments and prevents headless consumption of OpenCode events by the OODA loop. We need an in-OpenCode plugin that removes the tmux dependency and provides a stable event stream for waif ooda.

- Goals
  - Provide a registered OpenCode plugin that subscribes to OpenCode lifecycle and agent events and streams raw event JSON to stdout for the waif OODA pipeline.
  - Ensure the plugin is available when OpenCode is run and can be installed/registered via waif setup opencode-hooks.
  - Replace tmux-based monitoring for OODA with the plugin-based event source for v1.

- Non-goals
  - This PRD does not include building advanced event filtering, mapping to status models, or UI; those are follow-ups under wf-r1d.*. V1 only logs raw events to stdout and provides test integration.

## Users

- Primary users
  - Waif end-users/operators running the OODA loop locally on Linux machines.

- Secondary users (optional)
  - WF-R1D implementers, ops engineers, CI maintainers, and security reviewers.

- Key user journeys
  1. Developer runs `waif setup opencode-hooks` -> plugin is registered with local OpenCode -> runs smoke health-check event -> OODA detects event.
  2. Developer runs `waif ooda` (headless) -> OODA subscribes to plugin event stream and prints raw event JSON to console.
  3. CI job starts an ephemeral OpenCode server, registers plugin, runs a short agent session, asserts the plugin emitted events that OODA consumed.

## Requirements

- Functional requirements (MVP)
  1. Plugin Registration: Plugin must register with OpenCode at startup following OpenCode plugin registration guidance.
  2. Event Subscription: Plugin must subscribe to lifecycle events (session.start, pre-compact) and agent events as configured.
  3. Console Logging: Plugin must emit raw OpenCode event JSON to stdout with one JSON object per line (JSONL style) for easy parsing.
  4. Waif OODA Integration: `waif ooda` must be able to consume the plugin stream without requiring tmux.
  5. Testability: Provide a test harness that can start an ephemeral OpenCode server on a configurable port and assert events are emitted and ingested.

- Non-functional requirements
  - Platform: Linux-only for v1 (including WSL).
  - Performance: Event logging must be near-real-time; minimal added latency (target <200ms per event under light load).
  - Reliability: Plugin must handle OpenCode restart and re-register cleanly.
  - Observability: Provide clear stdout logs and an optional debug mode that includes event timestamps.

- Integrations
  - OpenCode runtime (registered plugin API)
  - WAIF CLI (`waif setup opencode-hooks`, `waif ooda`)
  - Test harness (npx opencode serve --port <port>) for integration tests

- Security & privacy
  - Plugin must not emit secrets. Raw event JSON may contain sensitive fields; tests and debug outputs must avoid logging secrets or include redaction where possible. For v1, document expected sensitive fields and recommend redaction prior to enabling in broader environments.

## Release & Operations

- Rollout plan
  1. Developer preview: deliver plugin + basic smoke-check; document install/registration steps.
  2. Integration test: include an automated integration test that starts an ephemeral OpenCode server on a configurable port (default non-standard port for tests) and validates event flow.
  3. Migration: mark tmux-based OODA flows deprecated and update documentation (see related PRDs) with migration steps.
  4. Enablement: merge, update ops docs, and confirm plugin owners for rollout (per wf-r1d.8 responsibilities).

- Quality gates / definition of done
  - Unit tests for plugin registration logic and error paths.
  - Integration test that starts OpenCode on a dedicated test port, registers plugin, runs a sample agent session, and asserts that OODA consumed at least one event.
  - Documentation updated: installation, registration, migration steps from tmux to plugin-based flow.
  - Security review of exposed event fields and redaction guidance completed.

- Risks & mitigations
  - Risk: OpenCode API changes or incompatibilities — Mitigation: keep plugin registration logic isolated behind an adapter in src/lib/hooks/opencode.ts for easy updates.
  - Risk: Sensitive data in raw events — Mitigation: document sensitive fields, provide redaction utilities, and gate enabling in non-development environments.
  - Risk: CI flakiness when starting ephemeral OpenCode — Mitigation: choose a non-default port per test run, add retry/backoff in test startup, and provide fallback mock tests for CI environments.

## Open Questions
- Exact plugin name / package name to register with OpenCode (suggest: waif-opencode-plugin). Confirm naming before implementation.
- Event fields that must be redacted by default in logs (list and redaction policy to be defined in follow-up).
- Integration test port selection policy and process cleanup on failure (we recommend test to pick an available ephemeral port and ensure process termination).


Source issue: wf-r1d.5.1

Linked PRD: docs/dev/opencode_integration_PRD.md
