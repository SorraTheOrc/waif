Summary of changes for wf-3k9, wf-608, wf-7el, wf-0p2

- Added `scripts/dev_opencode_emitter.js` — a small Node script used in CI/dev to append sample OpenCode JSONL events to `.opencode/logs/events.jsonl` so tests and local runs can exercise the OODA reader.
- Added `src/lib/redact.ts` — implements `redactSecrets(text)` to trim long bodies and redact obvious token patterns (Bearer tokens, sk- keys, long hex/base64 blobs, inline api_key/secret fields).
- Added `tests/redact.test.ts` — unit tests validating truncation and redaction heuristics for the helper.
- Updated docs/dev/prd-ooda-loop.md to call out the redaction helper and the presence of a small dev emitter for local testing.

These changes are implementation-level utilities intended to support event ingestion, CI tests, and safe audit snapshots. Tests added ensure the redact helper behaves as expected.
