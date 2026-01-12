import { describe, it, expect } from 'vitest';
import { runJobCommand } from '../src/commands/ooda.js';

// Note: runJobCommand here refers to the legacy runner return shape (code/timedOut)

describe('runJobCommand exit codes', () => {
  it('returns the process exit code when not timed out', async () => {
    const job = {
      id: 'exit-1',
      name: 'exit-42',
      command: 'node tests/helpers/exit.js 42',
      timeout_seconds: 5,
      capture: [],
      redact: false,
    } as any;

    const result = await runJobCommand(job);

    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(42);
  });
});
