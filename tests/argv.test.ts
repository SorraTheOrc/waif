import { describe, expect, test } from 'vitest';
import { normalizeSlashCommandArgv } from '../src/lib/argv.js';

describe('normalizeSlashCommandArgv', () => {
  test('passes through argv when no leading slash token', () => {
    const { argv, stripped } = normalizeSlashCommandArgv(['next', 'wf-ba2.4.3']);
    expect(argv).toEqual(['next', 'wf-ba2.4.3']);
    expect(stripped).toBe(false);
  });

  test('strips leading slash from first token', () => {
    const { argv, stripped } = normalizeSlashCommandArgv(['/next', 'wf-ba2.4.3']);
    expect(argv).toEqual(['next', 'wf-ba2.4.3']);
    expect(stripped).toBe(true);
  });

  test('drops empty command when only slash present', () => {
    const { argv, stripped } = normalizeSlashCommandArgv(['/','wf-ba2.4.3']);
    expect(argv).toEqual(['wf-ba2.4.3']);
    expect(stripped).toBe(true);
  });

  test('works with empty argv', () => {
    const { argv, stripped } = normalizeSlashCommandArgv([]);
    expect(argv).toEqual([]);
    expect(stripped).toBe(false);
  });
});
