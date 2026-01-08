import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/lib/config.js';

describe('wf-e6r.2.7 - Invalid cron expression', () => {
  it('throws a clear error when cron expression is invalid', async () => {
    await expect(loadConfig('tests/fixtures/ooda.invalid-cron.yaml')).rejects.toThrowError(
      /jobs\[0\].*schedule/i,
    );
  });
});
