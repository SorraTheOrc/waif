import { readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execa } from 'execa';
import { expect, test } from 'vitest';

const CLI = ['node', 'dist/index.js'];

function tmpFile(name: string) {
  return join(tmpdir(), name);
}

test('wf --help shows core commands (next/recent/in-progress/show)', async () => {
  const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), '--help']);
  expect(exitCode).toBe(0);
  expect(stdout).toContain('next');
  expect(stdout).toContain('recent');
  expect(stdout).toContain('in-progress');
  expect(stdout).toContain('show');
  expect(stdout).toContain('id');
});

test('wf --version prints release semver in release mode', async () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
  const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), '--version'], {
    env: { WAIF_VERSION_MODE: 'release' },
  });
  expect(exitCode).toBe(0);
  expect(stdout.trim()).toBe(`v${pkg.version}`);
});

test('wf -v works', async () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
  const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), '-v'], {
    env: { WAIF_VERSION_MODE: 'release' },
  });
  expect(exitCode).toBe(0);
  expect(stdout.trim()).toBe(`v${pkg.version}`);
});

test('wf --version can emit dev stamp', async () => {
  const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), '--version'], {
    env: { WAIF_VERSION_MODE: 'dev' },
  });
  expect(exitCode).toBe(0);
  expect(stdout.trim()).toMatch(/^v0\.0\.0-dev\+\d{8}T\d{6}(\.[0-9a-f]+)?$/);
});
