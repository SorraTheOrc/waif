import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/lib/config.js';

describe('wf-e6r.2.10 - Invalid retention value', () => {
  it('throws an error when retention.keep_last is less than 1', async () => {
    await expect(loadConfig('tests/fixtures/ooda.invalid-retention.yaml')).rejects.toThrowError(
      /retention.*keep_last/i,
    );
  });
});
