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

  test('prints to stdout by default', () => {
    const out = execSync(`${cli} context`).toString();
    expect(out).toMatch(/CONTEXT PACK/);
    expect(existsSync(outPath)).toBe(false);
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
