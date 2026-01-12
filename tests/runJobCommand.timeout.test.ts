import { describe, it, expect } from 'vitest';
import { runJobCommand } from '../src/commands/ooda.js';

// allow the test runner extra time for the intentional timeout
const TEST_TIMEOUT_MS = 15_000;

describe('runJobCommand timeout behavior', () => {
  it('marks jobs as timed out when exceeding timeout_seconds', async () => {
    const job = {
      id: 't1',
      name: 't-sleep',
      command: 'node tests/helpers/sleep.js 5000',
      timeout_seconds: 1,
      capture: ['stdout'],
      redact: false,
    } as any;

    const result = await runJobCommand(job);

    expect(result.timedOut).toBe(true);
    expect(result.code).toBeNull();
  }, TEST_TIMEOUT_MS);
});
