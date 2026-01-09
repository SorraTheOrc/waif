import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from '../src/lib/config.js';

// Mock child_process.spawn before importing module
const mockSpawn = vi.fn();
vi.mock('node:child_process', async () => ({
  spawn: (...args: any[]) => mockSpawn(...args),
}));

import { runJobCommand } from '../src/lib/jobRunner.js';

describe('runJobCommand', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('captures stdout on success', async () => {
    const fakeStdout = Buffer.from('hello\n');
    const child = {
      stdout: { on: (ev: string, cb: any) => { if (ev === 'data') cb(fakeStdout); } },
      stderr: { on: () => {} },
      on: (ev: string, cb: any) => { if (ev === 'close') setTimeout(() => cb(0), 0); },
    };
    mockSpawn.mockReturnValueOnce(child);

    const job: Job = { id: 'j1', name: 't', command: 'echo hi', schedule: '* * * * *', capture: ['stdout'] };
    const res = await runJobCommand(job);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('hello');
    expect(res.status).toBe('success');
  });

  it('reports failure when nonzero exit', async () => {
    const child = {
      stdout: { on: () => {} },
      stderr: { on: () => {} },
      on: (ev: string, cb: any) => { if (ev === 'close') setTimeout(() => cb(2), 0); },
    };
    mockSpawn.mockReturnValueOnce(child);
    const job: Job = { id: 'j2', name: 't2', command: 'false', schedule: '* * * * *' };
    const res = await runJobCommand(job);
    expect(res.exitCode).toBe(2);
    expect(res.status).toBe('failure');
  });

  it('times out and kills process', async () => {
    const child = {
      stdout: { on: () => {} },
      stderr: { on: () => {} },
      on: (ev: string, cb: any) => { /* never call close to simulate hang */ },
      kill: vi.fn(),
    };
    mockSpawn.mockReturnValueOnce(child);
    const job: Job = { id: 'j3', name: 't3', command: 'sleep 10', schedule: '* * * * *', timeout_seconds: 0 };
    const res = await runJobCommand(job);
    expect(res.timedOut).toBe(true);
    expect((child as any).kill).toHaveBeenCalled();
    expect(res.status).toBe('timeout');
  });
});
