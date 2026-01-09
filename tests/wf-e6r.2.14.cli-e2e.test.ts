import { test, expect, vi } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
// Ensure we mock writeSnapshots before the module under test is imported so
// dynamic imports inside the module observe the mocked function.
vi.mock('../src/commands/ooda.js', async () => {
  const mod = await vi.importActual('../src/commands/ooda.js');
  return { ...mod, writeSnapshots: vi.fn() };
});

import * as ooda from '../src/commands/ooda.js';

test('cli e2e: programmatic run writes snapshots (mocked)', async () => {
  const tmpPath = join(tmpdir(), `ooda-e2e-${Date.now()}.jsonl`);

  // Spy on writeSnapshots and prevent actual disk writes
  const spy = vi.spyOn(ooda, 'writeSnapshots').mockImplementation(() => {});

  try {
    const cmd = ooda.createOodaCommand();
    // Use sample data and run once to avoid reading .opencode logs or long loops
    await cmd.parseAsync(['--sample', '--once', '--log', tmpPath], { from: 'user' });

    // Ensure the snapshot writer was invoked
    expect(spy).toHaveBeenCalled();
    const call = spy.mock.calls[0];
    // writeSnapshots signature: (logPath, rows)
    expect(call[0]).toBe(tmpPath);
    const rows = call[1];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    const r = rows[0];
    // Each row should have a pane (agent) and status keys
    expect(r).toHaveProperty('pane');
    expect(r).toHaveProperty('status');
    expect(typeof r.pane).toBe('string');
    expect(['Busy', 'Free', 'Waiting']).toContain(r.status);
  } finally {
    spy.mockRestore();
  }
}, 20000);
