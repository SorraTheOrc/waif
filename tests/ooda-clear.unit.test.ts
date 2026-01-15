import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock child_process before importing module so ESM namespace is mockable
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawnSync: vi.fn() } as any;
});

import { printJobHeader, printJobResult } from '../src/commands/ooda.js';
import * as child from 'node:child_process';

const JOB = { id: 'j1', name: 'job-one', command: 'echo hi', clear_terminal: true, capture: ['stdout'] } as any;

describe('ooda clear-on-tty behavior', () => {
  let origIsTTY: any;
  let writeSpy: any;

  beforeEach(() => {
    origIsTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    // ensure we can redefine isTTY
    try { Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true }); } catch {}
    (child.spawnSync as any).mockClear();
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true as any);
  });

  afterEach(() => {
    writeSpy.mockRestore();
    if (origIsTTY) Object.defineProperty(process.stdout, 'isTTY', origIsTTY);
  });

  it('writes ANSI clear sequence on TTY and prints header and output', () => {
    try { Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true }); } catch {}
    printJobHeader(JOB);
    // spawnSync should not be used by implementation
    expect(child.spawnSync).not.toHaveBeenCalled();
    // first write should include ANSI clear sequence
    expect(writeSpy.mock.calls.length).toBeGreaterThan(0);
    const firstCallArg = writeSpy.mock.calls[0][0];
    expect(String(firstCallArg)).toContain('\x1b[2J');

    // simulate printing captured job stdout after header
    printJobResult(JOB, { stdout: 'hello', stderr: '' }, false);
    // ensure the captured stdout was written to stdout
    const wroteHello = writeSpy.mock.calls.some((c: any[]) => String(c[0]).includes('hello'));
    expect(wroteHello).toBe(true);
  });

  it('does nothing when not a TTY but still prints header content without clearing', () => {
    try { Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true }); } catch {}
    printJobHeader(JOB);
    expect(child.spawnSync).not.toHaveBeenCalled();
    // Should still print header lines
    expect(writeSpy).toHaveBeenCalled();
  });
});
