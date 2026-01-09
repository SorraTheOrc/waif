import { describe, it, expect } from 'vitest';
import { writeJobSnapshot, enforceRetention } from '../src/lib/snapshotWriter.js';
import fs from 'node:fs';
import path from 'node:path';
import { Job } from '../src/lib/config.js';

const tmp = path.join('tmp', 'snapshot_test.jsonl');

describe('snapshotWriter', () => {
  it('appends JSONL line', () => {
    try { fs.unlinkSync(tmp); } catch {}
    const job: Job = { id: 'x', name: 'x', command: 'echo hi', schedule: '* * * * *' };
    writeJobSnapshot(tmp, job, { exitCode: 0, status: 'success', stdout: 'ok' });
    const content = fs.readFileSync(tmp, 'utf8');
    const lines = content.split(/\r?\n/).filter(Boolean);
    expect(lines.length).toBe(1);
    const obj = JSON.parse(lines[0]);
    expect(obj.job_id).toBe('x');
    expect(obj.status).toBe('success');
  });

  it('enforceRetention keeps last N', () => {
    try { fs.unlinkSync(tmp); } catch {}
    const job: Job = { id: 'y', name: 'y', command: 'echo', schedule: '* * * * *' };
    for (let i = 0; i < 5; i++) {
      writeJobSnapshot(tmp, job, { exitCode: i, status: 'failure', stdout: `o${i}` });
    }
    enforceRetention(tmp, 2);
    const lines = fs.readFileSync(tmp, 'utf8').split(/\r?\n/).filter(Boolean);
    expect(lines.length).toBe(2);
  });
});
