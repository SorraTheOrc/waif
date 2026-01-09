import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/lib/config.js';

describe('wf-e6r.2.4 - Valid config loads', () => {
  it('loads and validates a valid config file', async () => {
    const cfg = await loadConfig('tests/fixtures/ooda.valid.yaml');
    expect(cfg).toBeDefined();
    expect(cfg.jobs).toBeInstanceOf(Array);
    expect(cfg.jobs.length).toBeGreaterThan(0);
     expect(cfg.jobs[0].id).toBe('daily-health');
     expect(cfg.jobs[0].command).toBeDefined();

  });
});
