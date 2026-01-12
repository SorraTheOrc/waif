import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { loadConfig } from '../src/lib/config.js';
import { createOodaCommand, printJobResult } from '../src/commands/ooda.js';

describe('printJobResult helper', () => {
  it('does not print when jsonOutput is true', async () => {
    const job = { capture: ['stdout'] } as any;
    const print = printJobResult;
    const result = { stdout: 'hello\n' } as any;

    const spyOut = vi.spyOn(process.stdout, 'write').mockImplementation(() => true as any);
    const spyErr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true as any);

    print(job, result, true);

    expect(spyOut).not.toHaveBeenCalled();
    expect(spyErr).not.toHaveBeenCalled();

    spyOut.mockRestore();
    spyErr.mockRestore();
  });

  it('prints stdout/stderr when jsonOutput is false', async () => {
    const job = { capture: ['stdout', 'stderr'] } as any;
    const print = printJobResult;
    const result = { stdout: 'hello\n', stderr: 'err\n' } as any;

    const spyOut = vi.spyOn(process.stdout, 'write').mockImplementation(() => true as any);
    const spyErr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true as any);

    print(job, result, false);

    expect(spyOut).toHaveBeenCalled();
    expect(spyErr).toHaveBeenCalled();

    spyOut.mockRestore();
    spyErr.mockRestore();
  });
});
