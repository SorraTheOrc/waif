import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

const CLI = [process.execPath, 'dist/index.js'];

describe('wf action list/info/init (cli)', () => {
  it('init creates a scaffold and list/info show it', async () => {
    const temp = mkdtempSync(join(tmpdir(), 'wf-actions-'));
    const dir = `${temp}/.waif/actions`;

    const initRes = await execa(CLI[0], [...CLI.slice(1), 'action', 'init', 'example-action', '--dir', dir]);
    expect(initRes.exitCode).toBe(0);
    expect(initRes.stdout).toContain('Created action:');

    const listRes = await execa(CLI[0], [...CLI.slice(1), 'action', 'list', '--dir', dir]);
    expect(listRes.exitCode).toBe(0);
    expect(listRes.stdout).toContain('example-action');

    const infoRes = await execa(CLI[0], [...CLI.slice(1), 'action', 'info', 'example-action', '--dir', dir]);
    expect(infoRes.exitCode).toBe(0);
    expect(infoRes.stdout).toContain('name: example-action');
  });
});
