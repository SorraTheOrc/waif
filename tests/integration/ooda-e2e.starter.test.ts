import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { createOodaCommand } from '../../src/commands/ooda.js';

const tmpDirRoot = os.tmpdir();

function makeSnapshotPath() {
  const file = `ooda-e2e-${Date.now()}-${Math.random().toString(16).slice(2)}.jsonl`;
  return path.join(process.cwd(), 'history', file);
}

describe('integration: run-job snapshot starter', () => {
  const createdPaths: string[] = [];

  afterEach(() => {
    for (const file of createdPaths) {
      try {
        if (fs.existsSync(file)) fs.rmSync(file, { recursive: true, force: true });
      } catch {
        // best effort cleanup
      }
    }
  });

  it('writes a snapshot JSONL line under history/', async () => {
    const workDir = fs.mkdtempSync(path.join(tmpDirRoot, 'wf-ooda-e2e-'));
    createdPaths.push(workDir);

    const cfgPath = path.join(workDir, 'ooda.yaml');
    const snapshotPath = makeSnapshotPath();
    createdPaths.push(snapshotPath);

    const cfg = {
      jobs: [
        {
          id: 'starter-job',
          name: 'starter job',
          command: "node -e \"console.log('starter-ok')\"",
          schedule: '* * * * *',
          capture: ['stdout'],
          timeout_seconds: 5,
          retention: { keep_last: 3 },
        },
      ],
    };

    fs.writeFileSync(cfgPath, yaml.dump(cfg), 'utf8');

    const cmd = createOodaCommand();
    await cmd.parseAsync([
      'run-job',
      '--config',
      cfgPath,
      '--job',
      'starter-job',
      '--log',
      snapshotPath,
    ], { from: 'user' });

    expect(fs.existsSync(snapshotPath)).toBe(true);
    const lines = fs.readFileSync(snapshotPath, 'utf8').split(/\r?\n/).filter((l) => !!l.trim());
    expect(lines.length).toBeGreaterThan(0);

    const first = JSON.parse(lines[0]);
    expect(first.job_id).toBe('starter-job');
    expect(typeof first.status).toBe('string');
    expect(first.status.length).toBeGreaterThan(0);
  }, 15_000);
});
