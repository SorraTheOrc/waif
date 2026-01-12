import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOodaCommand, runJobCommand, enforceRetention, writeJobSnapshot } from '../src/commands/ooda.js';
import { readFileSync, unlinkSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmp = (name: string) => path.join('/tmp', `waif-ooda-${name}-${Date.now()}.jsonl`);
const fixtureConfig = path.join(process.cwd(), 'tests', 'fixtures', 'ooda.valid.yaml');

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'waif-ooda-test-'));
});

afterEach(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe('runJobCommand', () => {
  it('captures and redacts stdout when configured', async () => {
    const result = await runJobCommand({
      id: 'redact',
      name: 'redact test',
      command: "node -e \"console.log('token sk-abcdefghijklmnop1234')\"",
      schedule: '* * * * *',
      capture: ['stdout'],
      redact: true,
    } as any);

    expect(result.stdout).toBeDefined();
    expect(result.stdout).not.toMatch(/sk-[A-Za-z0-9]{16,}/);
    expect(result.stdout).toContain('sk-[REDACTED]');
  });

  it('returns exit code 2 on timeout via CLI wrapper', async () => {
    const cmd = createOodaCommand();
    const cfg = path.join(tmpDir, 'ooda.yaml');
    writeFileSync(cfg, readFileSync(fixtureConfig, 'utf8'), 'utf8');

    const runnerSpy = vi
      .spyOn(await import('../src/lib/runner.js'), 'runJobCommand')
      .mockResolvedValue({ exitCode: null, signal: 'SIGKILL', stdout: '', stderr: '' } as any);

    await cmd.parseAsync(['run-job', '--config', cfg, '--job', 'daily-health'], { from: 'user' });
    const exitCode = process.exitCode ?? 0;

    expect(exitCode).toBe(2);

    runnerSpy.mockRestore();
  });

  it('honors timeout_seconds and reports timedOut', async () => {
    const result = await runJobCommand({
      id: 'timeout',
      name: 'timeout test',
      command: "node -e \"setTimeout(() => {}, 2000)\"",
      schedule: '* * * * *',
      timeout_seconds: 1,
      capture: ['stdout'],
    } as any);

    expect(result.timedOut).toBe(true);
  });
});

describe('enforceRetention + writeJobSnapshot', () => {
  it('trims snapshot log to keep_last entries and applies redaction', () => {
    const file = tmp('retention');
    const job = { id: 'j1', name: 'demo', command: 'echo secret sk-abcdef1234567890' } as any;

    writeJobSnapshot(file, job, 'failure', 1, 'ok', 'stderr sk-abcdef1234567890', true);
    writeJobSnapshot(file, job, 'success', 0, 'ok2', 'stderr2', true);
    writeJobSnapshot(file, job, 'success', 0, 'ok3', 'stderr3', true);

    enforceRetention(file, 2);

    const lines = readFileSync(file, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.stdout).not.toMatch(/sk-[A-Za-z0-9]{16,}/);

    unlinkSync(file);
  });
});
