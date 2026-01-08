import { describe, it, expect } from 'vitest';
import { execa } from 'execa';
import path from 'node:path';

const distBin = path.resolve('dist/index.js');
const validConfig = path.resolve('tests/fixtures/ooda.valid.yaml');
const invalidConfig = path.resolve('tests/fixtures/ooda.invalid-id.yaml');
const opencodeLog = path.resolve('tests/fixtures/opencode.events.empty.jsonl');

// Lightweight integration exercising the published CLI entrypoint.
describe('wf-e6r.2.14 - CLI integration', () => {
  it('exits 0 with valid config and non-zero with invalid config', { timeout: 15000 }, async () => {
    // Run through compiled bin so command wiring matches distribution
    const runCli = (cfgPath: string) =>
      execa('node', [distBin, 'ooda', '--once', '--log', opencodeLog, '--no-log'], {
        env: { ...process.env, WAIF_CONFIG: cfgPath },
        reject: false,
      });

    // valid config should succeed quickly
    const ok = await runCli(validConfig);
    expect(ok.exitCode).toBe(0);

    // invalid config should fail and mention validation
    const bad = await runCli(invalidConfig);
    expect(bad.exitCode).not.toBe(0);
    expect(bad.stderr || bad.stdout).toMatch(/invalid|error|jobs\[0\]/i);
  });
});
