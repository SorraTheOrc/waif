import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import yaml from 'js-yaml';
import { createOodaCommand } from '../src/commands/ooda.js';

const tmpDir = os.tmpdir();

describe('run-job deterministic E2E', () => {
  const cfgPath = path.join(tmpDir, `ooda-e2e-${Date.now()}.yaml`);
  const snapshotPath = path.join(tmpDir, `ooda-e2e-snap-${Date.now()}.jsonl`);

  afterEach(() => {
    try { if (fs.existsSync(cfgPath)) fs.unlinkSync(cfgPath); } catch (e) {}
    try { if (fs.existsSync(snapshotPath)) fs.unlinkSync(snapshotPath); } catch (e) {}
  });

  it('writes a single snapshot and enforces retention', async () => {
    const cfg = {
      jobs: [
        {
          id: 'e2e-exit',
          name: 'e2e',
          command: `node tests/helpers/exit.js 0`,
          schedule: "*/5 * * * * *",
          capture: ['stdout'],
          timeout_seconds: 5,
          retention: { keep_last: 1 },
        },
      ],
    };

    fs.writeFileSync(cfgPath, yaml.dump(cfg), 'utf8');

    const cmd = createOodaCommand();
    // run the run-job command programmatically
    const args = ['run-job', '--config', cfgPath, '--job', 'e2e-exit', '--log', snapshotPath];
    await cmd.parseAsync(args, { from: 'user' });

    // after first run, snapshot exists and contains one line
    expect(fs.existsSync(snapshotPath)).toBe(true);
    const lines1 = fs.readFileSync(snapshotPath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
    expect(lines1.length).toBe(1);
    const s1 = JSON.parse(lines1[0]);
    expect(s1.job_id).toBe('e2e-exit');
    expect(s1.exit_code).toBe(0);

    // run again, should enforce retention keep_last:1 and still have single line
    await cmd.parseAsync(args, { from: 'user' });
    const lines2 = fs.readFileSync(snapshotPath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
    expect(lines2.length).toBe(1);
    const s2 = JSON.parse(lines2[0]);
    expect(s2.job_id).toBe('e2e-exit');
    expect(s2.exit_code).toBe(0);
  });
});
