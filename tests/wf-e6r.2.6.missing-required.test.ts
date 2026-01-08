import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/lib/config.js';

describe('wf-e6r.2.6 - Missing required field', () => {
  it('throws a clear error when job.name is missing', async () => {
    await expect(loadConfig('tests/fixtures/ooda.missing-name.yaml')).rejects.toThrowError(
      /jobs\[0\].*name/i,
    );
  });
});
