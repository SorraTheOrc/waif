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

  // write 12 entries with retention default 10
  for (let i = 0; i < 12; i++) writeJobSnapshot(dir, snap(i));

  const file = join(dir, 'j.jsonl');
  const content = readFileSync(file, 'utf8').trim().split('\n');
  expect(content.length).toBe(10);

  const parsedLast = JSON.parse(content[content.length - 1]);
  expect(parsedLast.sanitized_output).not.toMatch(/sk-[A-Za-z0-9]{16,}/);
  expect(parsedLast.sanitized).toBe(true);
  expect(parsedLast.metadata_version).toBe(1);
  expect(parsedLast.truncated).toBeTypeOf('boolean');

  try { rmSync(dir, { recursive: true, force: true }); } catch (e) {}
});
