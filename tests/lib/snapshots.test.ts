import { test, expect } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeJobSnapshot } from '../../src/lib/snapshots.js';
import { readFileSync, rmSync } from 'fs';

test('writeJobSnapshot writes redacted snapshot and retains last N non-empty entries', () => {
  const dir = join(tmpdir(), `snapshots-${Date.now()}`);
  const snap = (i: number) => ({
    time: new Date().toISOString(),
    job_id: 'j',
    name: 'n',
    exit_code: i,
    sanitized_output: `secret sk-abcdef1234567890 #${i}`,
    summary: 's',
  });

  // write 112 entries with retention keep_last = 100
  for (let i = 0; i < 112; i++) writeJobSnapshot(dir, snap(i), { retention: 100 });

  const file = join(dir, 'j.jsonl');
  const content = readFileSync(file, 'utf8').trim().split('\n');
  expect(content.length).toBe(100);

  const parsedLast = JSON.parse(content[content.length - 1]);
  expect(parsedLast.sanitized_output).not.toMatch(/sk-[A-Za-z0-9]{16,}/);
  expect(parsedLast.sanitized).toBe(true);
  expect(parsedLast.metadata_version).toBe(1);
  expect(parsedLast.truncated).toBeTypeOf('boolean');

  try { rmSync(dir, { recursive: true, force: true }); } catch (e) {}
});
