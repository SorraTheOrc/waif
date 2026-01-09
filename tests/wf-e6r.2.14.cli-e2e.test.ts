import { test, expect } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { readFileSync, unlinkSync } from 'fs';
import * as ooda from '../src/commands/ooda.js';

test('cli e2e: programmatic run writes snapshots to file', async () => {
  const tmpPath = join(tmpdir(), `ooda-e2e-${Date.now()}.jsonl`);

  try {
    const cmd = ooda.createOodaCommand();
    // Use sample data and run once to avoid reading .opencode logs or long loops
    await cmd.parseAsync(['--sample', '--once', '--log', tmpPath], { from: 'user' });

    const content = readFileSync(tmpPath, 'utf8').trim();
    expect(content.length).toBeGreaterThan(0);
    const lines = content.split('\n');
    const first = JSON.parse(lines[0]);
    expect(first).toHaveProperty('agent');
    expect(['map', 'forge']).toContain(first.agent);
  } finally {
    try { unlinkSync(tmpPath); } catch (e) {}
  }
}, 20000);
