import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/lib/config.js';
import path from 'node:path';
import fs from 'node:fs/promises';

const tempDir = path.resolve('tests/tmp');

async function ensureTempDir() {
  await fs.mkdir(tempDir, { recursive: true });
}

function tempPath(name: string) {
  return path.join(tempDir, name);
}

describe('wf-e6r.2.12 - Config file not found', () => {
  it('throws a clear error when default config is missing', async () => {
    await ensureTempDir();
    const missingPath = tempPath('no-ooda-file.yaml');
    await fs.rm(missingPath, { force: true });

    await expect(loadConfig(missingPath)).rejects.toThrowError(/ooda-scheduler\.yaml|ENOENT|not\s+found/i);
  });
});
