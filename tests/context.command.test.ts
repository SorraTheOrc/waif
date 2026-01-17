import { describe, test, expect, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import { resolve } from 'path';

const cli = 'node dist/index.js';
const outPath = resolve('docs/dev/CONTEXT_PACK.md');

describe('wf context command', () => {
  afterEach(() => {
    try { if (existsSync(outPath)) unlinkSync(outPath); } catch (e) {}
  });

  test('writes default file and overwrites on each run', () => {
    // First run should write the canonical file
    execSync(`${cli} context`);
    expect(existsSync(outPath)).toBe(true);
    const content1 = readFileSync(outPath, 'utf8');

    // Second run should overwrite (no error)
    execSync(`${cli} context`);
    const content2 = readFileSync(outPath, 'utf8');
    expect(content1).toBe(content2);
  });

  test('fails without --force when file exists', () => {
    execSync(`${cli} context --out ${outPath}`);
    let threw = false;
    try {
      execSync(`${cli} context --out ${outPath}`);
    } catch (e) {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});
