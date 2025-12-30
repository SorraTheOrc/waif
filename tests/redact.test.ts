import { describe, it, expect } from 'vitest';
import { redactSecrets } from '../src/lib/redact.js';

describe('redactSecrets', () => {
  it('truncates long text and indicates truncation', () => {
    const long = 'a'.repeat(2000);
    const out = redactSecrets(long);
    expect(out).toContain('[TRUNCATED');
    expect(out.length).toBeLessThan(1200);
  });

  it('redacts bearer tokens and sk- keys', () => {
    const input = 'Authorization: Bearer abcDEFGhijk12345==\nskey=sk-abcdefghijklmnop123456';
    const out = redactSecrets(input);
    expect(out).not.toContain('abcDEFGhijk12345');
    expect(out).toContain('Bearer [REDACTED]');
    expect(out).toContain('sk-[REDACTED]');
  });

  it('redacts long hex strings and base64-like strings', () => {
    const hex = 'deadbeef'.repeat(8);
    const b64 = 'A'.repeat(60) + '==';
    const out = redactSecrets(`val1:${hex}\nval2:${b64}`);
    expect(out).not.toContain(hex);
    expect(out).toContain('[REDACTED_HEX]');
    expect(out).toContain('[REDACTED_BASE64]');
  });

  it('short strings unaffected', () => {
    const s = 'hello world';
    expect(redactSecrets(s)).toEqual(s);
  });
});
