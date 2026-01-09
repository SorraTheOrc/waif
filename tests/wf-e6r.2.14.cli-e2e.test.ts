import { test, expect, vi } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import * as fs from 'fs';
import * as ooda from '../src/commands/ooda.js';

test('cli e2e: programmatic run writes snapshots (mocked)', async () => {
  const tmpPath = join(tmpdir(), `ooda-e2e-${Date.now()}.jsonl`);

  // Spy on fs.appendFileSync which writeSnapshots uses under the hood
  const spy = vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {});

  try {
    const cmd = ooda.createOodaCommand();
    // Use sample data and run once to avoid reading .opencode logs or long loops
    await cmd.parseAsync(['--sample', '--once', '--log', tmpPath], { from: 'user' });

    // Ensure appendFileSync was invoked with the tmpPath
    const called = spy.mock.calls.some((c: any[]) => c[0] === tmpPath);
    expect(called).toBe(true);
  } finally {
    spy.mockRestore();
  }
}, 20000);
