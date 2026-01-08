import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/lib/config.js';

describe('wf-e6r.2.8 - Invalid job id pattern', () => {
  it('throws an error when job id contains invalid characters', async () => {
    await expect(loadConfig('tests/fixtures/ooda.invalid-id.yaml')).rejects.toThrowError(
      /jobs\[0\].*id/i,
    );
  });
});
