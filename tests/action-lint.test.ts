import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

const CLI = [process.execPath, 'dist/index.js'];

describe('wf action lint (cli)', () => {
  it('validates actions in a directory', async () => {
    const temp = mkdtempSync(join(tmpdir(), 'wf-actions-'));
    const dir = `${temp}/.waif/actions`;
    mkdirSync(dir, { recursive: true });
    // create dir and two files: valid and invalid
    const valid = `name: ok-action\ndescription: ok\nruns:\n  - type: noop\n`;
    const invalid = `name: bad-action\n# missing runs -> invalid\n`;
    writeFileSync(`${dir}/valid.yml`, valid, { encoding: 'utf8' });
    writeFileSync(`${dir}/bad.yml`, invalid, { encoding: 'utf8' });

    const res = await execa(CLI[0], [...CLI.slice(1), 'action', 'lint', '--dir', `${temp}/.waif/actions`], { reject: false });
    // we expect non-zero exit due to one invalid file
    expect(res.exitCode).not.toBe(0);
    expect(res.stdout).toContain('OK:');
    expect(res.stdout).toContain('ERR:');
  });
});
