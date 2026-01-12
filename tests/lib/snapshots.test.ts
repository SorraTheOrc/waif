import { test, expect } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeJobSnapshot } from '../../src/lib/snapshots.js';
import { readFileSync, unlinkSync, rmSync } from 'fs';

test('writeJobSnapshot writes and retains last N entries', () => {
  const dir = join(tmpdir(), `snapshots-${Date.now()}`);
  const snap = (i: number) => ({ time: new Date().toISOString(), job_id: 'j', name: 'n', exit_code: i, sanitized_output: 'o', summary: 's' });

  // write 15 entries with retention default 10
  for (let i = 0; i < 15; i++) writeJobSnapshot(dir, snap(i));

  const file = join(dir, 'j.jsonl');
  const content = readFileSync(file, 'utf8').trim().split('\n');
  expect(content.length).toBe(10);

  // cleanup
  try { rmSync(dir, { recursive: true, force: true }); } catch (e) {}
});
