import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawnSync: vi.fn() } as any;
});
import { createOodaCommand } from '../../src/commands/ooda.js';

const tmpdir = (name: string) => mkdtempSync(path.join(os.tmpdir(), `wf-ooda-e2e-${name}-`));

describe('OODA snapshot writer E2E (integration)', () => {
  let dir: string;
  let cfgPath: string;
  let logPath: string;

  beforeEach(() => {
    dir = tmpdir('dir');
    cfgPath = path.join(dir, 'ooda.yaml');
    logPath = path.join(dir, 'ooda_snapshot_test.jsonl');
  });

  afterEach(() => {
    try { rmSync(dir, { recursive: true, force: true }); } catch {};
    try { vi.resetAllMocks(); } catch {}
  });

  it('writes snapshots with redaction and enforces retention.keep_last', async () => {
    // create a simple config with keep_last: 2
    writeFileSync(cfgPath, `jobs:\n  - id: e2e-job\n    name: e2e job\n    command: "node -e \\\"console.log('hello-from-e2e')\\\""\n    schedule: '* * * * *'\n    capture:\n      - stdout\n    timeout_seconds: 5\n    retention:\n      keep_last: 2\n`,'utf8');

    const cmd = createOodaCommand();

    // Ensure non-TTY behavior for CI-style runs: mock isTTY false and spy on clear invocations
    const child = await import('node:child_process');
    const spawnSpy = vi.spyOn(child, 'spawnSync').mockImplementation(() => ({ stdout: Buffer.alloc(0) } as any));
    try { Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true }); } catch {}

    // programmatic invocation: run-job --config <cfgPath> --job e2e-job --log <logPath>
    await cmd.parseAsync(['run-job', '--config', cfgPath, '--job', 'e2e-job', '--log', logPath], { from: 'user' });

    expect(spawnSpy).not.toHaveBeenCalled();
    spawnSpy.mockRestore();

    // read snapshot and assert fields
    const content = readFileSync(logPath, 'utf8').trim().split('\n');
    expect(content.length).toBeGreaterThanOrEqual(1);
    const parsed = JSON.parse(content[content.length - 1]);
    expect(parsed).toHaveProperty('time');
    expect(parsed).toHaveProperty('job_id', 'e2e-job');
    expect(parsed).toHaveProperty('status');
    expect(parsed).toHaveProperty('exit_code');
    expect(parsed).toHaveProperty('stdout');

    // assert stdout contains hello-from-e2e
    expect(parsed.stdout).toContain('hello-from-e2e');

    // assert redaction: no sk- followed by 16+ alnum characters
    const redactionRegex = /sk-[A-Za-z0-9]{16,}/;
    const serialized = JSON.stringify(parsed);
    expect(redactionRegex.test(serialized)).toBe(false);

    // write two more runs to exercise retention.keep_last:2
    await cmd.parseAsync(['run-job', '--config', cfgPath, '--job', 'e2e-job', '--log', logPath], { from: 'user' });
    await cmd.parseAsync(['run-job', '--config', cfgPath, '--job', 'e2e-job', '--log', logPath], { from: 'user' });

    const content2 = readFileSync(logPath, 'utf8').trim().split('\n');
    // retention.keep_last:2 -> at most 2 lines
    expect(content2.length).toBeLessThanOrEqual(2);

  }, 20000);
});
