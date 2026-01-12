import { describe, it, expect } from 'vitest';
import { runJobCommand, enforceRetention, writeJobSnapshot } from '../src/commands/ooda.js';
import { readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const tmp = (name: string) => path.join('/tmp', `waif-ooda-${name}-${Date.now()}.jsonl`);

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
