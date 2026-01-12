import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { readFileSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import { loadConfig } from '../src/lib/config.js';
import { runJobCommand, writeJobSnapshot } from '../src/commands/ooda.js';

const tmpFile = (name: string) => path.join(os.tmpdir(), `waif-ooda-${name}-${Date.now()}.jsonl`);

describe('hello-5s fixture integration', () => {
  it('loads fixture and has correct schema (schedule + capture array)', async () => {
    const cfg = await loadConfig(path.resolve('tests/fixtures/ooda.hello-5s.yaml'));
    expect(cfg).toBeDefined();
    expect(Array.isArray(cfg.jobs)).toBe(true);
    const jobs = cfg.jobs || [];
    expect(jobs.length).toBeGreaterThan(0);
    const job = jobs[0];
    expect(job).toBeDefined();
    // schedule must be present for scheduler mode
    expect(job.schedule).toBeDefined();
    // capture must be an array
    expect(Array.isArray(job.capture)).toBe(true);
  });

  it('executes hello-5s job and writes a snapshot', async () => {
    const cfg = await loadConfig(path.resolve('tests/fixtures/ooda.hello-5s.yaml'));
    const jobs = cfg.jobs || [];
    const job = jobs.find((j) => j.id === 'hello-5s');
    expect(job).toBeDefined();
    const jobAny = job as any;

    const result = await runJobCommand(jobAny);
    // stdout should be captured
    expect(result.stdout).toBeDefined();
    expect(result.stdout).toMatch(/Hello, the time is now/);

    const file = tmpFile('hello-5s');
    writeJobSnapshot(file, jobAny, result.timedOut ? 'timeout' : result.code === 0 ? 'success' : 'failure', result.code, result.stdout, result.stderr, Boolean(jobAny.redact));
    const content = readFileSync(file, 'utf8').trim().split(/\r?\n/);
    expect(content.length).toBeGreaterThanOrEqual(1);

    // cleanup
    try { unlinkSync(file); } catch {}
  });
});
