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

describe('OODA scheduler E2E (integration)', () => {
  let dir: string;
  let cfgPath: string;
  let logPath: string;

  beforeEach(() => {
    dir = tmpdir('dir');
    cfgPath = path.join(dir, 'ooda.yaml');
    logPath = path.join(dir, 'ooda_snapshot_test.jsonl');
  });

  afterEach(() => {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  it('runs a configured job once via run-job and writes snapshot with expected fields and retention', async () => {
    // create a simple config with keep_last: 2
    const cfg = {
      jobs: [
        {
          id: 'e2e-job',
          name: 'e2e job',
          command: "node -e \"console.log('hello')\"",
          schedule: '* * * * *',
          capture: ['stdout'],
          timeout_seconds: 5,
          retention: { keep_last: 2 },
        },
      ],
    };

    writeFileSync(cfgPath, `jobs:\n  - id: e2e-job\n    name: e2e job\n    command: \"node -e \\\"console.log('hello')\\\"\"\n    schedule: '* * * * *'\n    capture:\n      - stdout\n    timeout_seconds: 5\n    retention:\n      keep_last: 2\n`,'utf8');

    const cmd = createOodaCommand();

    // Ensure non-TTY behavior for CI-style runs: mock isTTY false and spy on clear invocations
    const child = await import('node:child_process');
    const spawnSpy = vi.spyOn(child, 'spawnSync').mockImplementation(() => ({ stdout: Buffer.alloc(0) } as any));
    try { Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true }); } catch {}

    // programmatic invocation: run-job --config <cfgPath> --job e2e-job --log <logPath>
    await cmd.parseAsync(['run-job', '--config', cfgPath, '--job', 'e2e-job', '--log', logPath], { from: 'user' });

    // ensure that no clear was attempted in non-TTY
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

    // write another run to exercise retention
    await cmd.parseAsync(['run-job', '--config', cfgPath, '--job', 'e2e-job', '--log', logPath], { from: 'user' });
    const content2 = readFileSync(logPath, 'utf8').trim().split('\n');
    expect(content2.length).toBeLessThanOrEqual(2);

    // assert stdout contains hello
    const parsed2 = JSON.parse(content2[content2.length - 1]);
    expect(parsed2.stdout).toContain('hello');
  }, 20000);
});
