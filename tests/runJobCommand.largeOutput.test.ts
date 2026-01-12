import { describe, it, expect } from 'vitest';
import { runJobCommand } from '../src/commands/ooda.js';

describe('runJobCommand large output handling', () => {
  it('captures large stdout without truncation', async () => {
    const job = {
      id: 'large-1',
      name: 'emit-large',
      command: 'node tests/helpers/emit-large.js',
      timeout_seconds: 10,
      capture: ['stdout'],
      redact: false,
    } as any;

    const result = await runJobCommand(job);

    expect(typeof result.stdout).toBe('string');
    expect(result.stdout!.length).toBeGreaterThanOrEqual(900_000);
    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(0);
  }, 20_000);
});
