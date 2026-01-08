import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/lib/config.js';

describe('wf-e6r.2.9 - Invalid capture value', () => {
  it('throws an error when capture includes unsupported values', async () => {
    await expect(loadConfig('tests/fixtures/ooda.invalid-capture.yaml')).rejects.toThrowError(
      /capture/i,
    );
  });
});
