import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/lib/config.js';

// The fixture intentionally contains a YAML syntax error (unterminated string)
describe('wf-e6r.2.11 - YAML syntax error', () => {
  it('throws a YAML parse error with context', async () => {
    await expect(loadConfig('tests/fixtures/ooda.invalid-yaml.yaml')).rejects.toThrowError(/YAML|unterminated/i);
  });
});
