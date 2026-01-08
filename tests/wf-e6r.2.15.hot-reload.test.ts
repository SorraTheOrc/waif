import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { loadConfig, validateConfig } from '../src/lib/config.js';

const tempDir = path.resolve('tests/tmp');
const ensureTempDir = async () => {
  await fs.mkdir(tempDir, { recursive: true });
};
const tempPath = (name: string) => path.join(tempDir, name);

afterEach(async () => {
  const files = ['ooda.hot-reload.yaml'];
  await Promise.all(
    files.map(async (f) => {
      try {
        await fs.rm(tempPath(f), { force: true });
      } catch {
        // best-effort cleanup
      }
    }),
  );
});

describe('wf-e6r.2.15 - hot reload validation', () => {
  it('emits validation error then accepts updated valid config', async () => {
    await ensureTempDir();
    const cfgPath = tempPath('ooda.hot-reload.yaml');

    await fs.writeFile(
      cfgPath,
      `jobs:
  - id: job1
    name: Demo
    command: echo hello
    schedule: '* * * * *'
`,
      'utf8',
    );

    // initial load should succeed
    const initial = await loadConfig(cfgPath);
    expect(initial.jobs).toHaveLength(1);

    // write invalid config
    await fs.writeFile(
      cfgPath,
      `jobs:
  - id: job1
    name: Demo
    command: echo hello
    schedule: ''
`,
      'utf8',
    );

    // simulate watcher validation callback
    const invalidContent = await fs.readFile(cfgPath, 'utf8');
    const invalidParsed = yaml.load(invalidContent);
    const invalidResult = validateConfig(invalidParsed);
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors?.some((e) => /schedule is required/i.test(e.message ?? '') || /schedule/i.test(e.path))).toBe(true);

    // write valid config again
    await fs.writeFile(
      cfgPath,
      `jobs:
  - id: job1
    name: Demo updated
    command: echo hi
    schedule: '*/5 * * * *'
`,
      'utf8',
    );

    const updated = await loadConfig(cfgPath);
    expect(updated.jobs[0].name).toBe('Demo updated');
    expect(updated.jobs[0].schedule).toBe('*/5 * * * *');
  });
});
