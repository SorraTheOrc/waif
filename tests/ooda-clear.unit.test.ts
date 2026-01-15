import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock child_process before importing module so ESM namespace is mockable
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawnSync: vi.fn() } as any;
});

import { printJobHeader } from '../src/commands/ooda.js';
import * as child from 'node:child_process';

const JOB = { id: 'j1', name: 'job-one', command: 'echo hi' } as any;

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

  it('invokes clear when stdout.isTTY is true and then prints header', () => {
    // ensure TTY
    try { Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true }); } catch {}
    printJobHeader(JOB);
    expect(child.spawnSync).toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalled();
  });

  it('does not invoke clear when stdout.isTTY is false', () => {
    try { Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true }); } catch {}
    printJobHeader(JOB);
    expect(child.spawnSync).not.toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalled();
  });

  it('falls back to ANSI when spawnSync fails', () => {
    try { Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true }); } catch {}
    // make spawnSync return a non-zero status
    (child.spawnSync as any).mockImplementation(() => ({ status: 1 }));
    printJobHeader(JOB);
    expect(child.spawnSync).toHaveBeenCalled();
    // header should still be printed via process.stdout.write
    expect(writeSpy).toHaveBeenCalled();
  });
});
