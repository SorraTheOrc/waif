import { describe, it, expect, afterEach } from 'vitest';
import { loadConfig } from '../src/lib/config.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { chmodSync, existsSync, rmSync } from 'node:fs';

const tempDir = path.resolve('tests/tmp');
const fixturePath = path.join(tempDir, 'ooda.unreadable.yaml');

async function ensureTempDir() {
  await fs.mkdir(tempDir, { recursive: true });
}

afterEach(() => {
  if (existsSync(fixturePath)) {
    try {
      chmodSync(fixturePath, 0o644);
      rmSync(fixturePath);
    } catch (err) {
      // best effort cleanup
    }
  }
});

describe('wf-e6r.2.13 - Unreadable config file', () => {
  it('surfaces a permission error when file cannot be read', async () => {
    await ensureTempDir();
    await fs.writeFile(fixturePath, 'jobs: []', 'utf8');

    // Make file unreadable. If chmod fails (e.g., CI), fall back to mocking.
    let usedMock = false;
    try {
      chmodSync(fixturePath, 0);
    } catch (err) {
      usedMock = true;
    }

    const expectError = expect(loadConfig(fixturePath)).rejects.toThrowError(/(EACCES|permission|denied)/i);
    if (usedMock) {
      const original = fs.readFile;
      (fs as Record<string, any>).readFile = async () => {
        const err: NodeJS.ErrnoException = new Error('EACCES');
        err.code = 'EACCES';
        throw err;
      };
      try {
        await expectError;
      } finally {
        (fs as Record<string, any>).readFile = original;
      }
    } else {
      await expectError;
    }
  });
});
