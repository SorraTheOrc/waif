import { describe, test, expect, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import { resolve } from 'path';

const cli = 'node dist/index.js';
const outPath = resolve('docs/dev/CONTEXT_PACK.md');

describe('waif context command', () => {
  afterEach(() => {
    try { if (existsSync(outPath)) unlinkSync(outPath); } catch (e) {}
  });

  test('writes default file', () => {
    execSync(`${cli} context --out ${outPath}`);
    expect(existsSync(outPath)).toBe(true);
    const content = readFileSync(outPath, 'utf8');
    expect(content).toMatch(/CONTEXT PACK/);
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
