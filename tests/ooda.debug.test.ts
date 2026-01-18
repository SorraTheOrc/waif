import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const appendSnapshotFileMock = vi.hoisted(() => vi.fn());

vi.mock('../src/lib/snapshots.js', () => ({ appendSnapshotFile: appendSnapshotFileMock }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    appendFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => ''),
    writeFileSync: vi.fn(),
  } as any;
});

import * as fs from 'node:fs';
import { writeSnapshots, writeJobSnapshot, enforceRetention, printJobResult } from '../src/commands/ooda.js';

const BASE_JOB = {
  id: 'job-1',
  name: 'Job One',
  command: 'echo hi',
  retention: { keep_last: 2 },
  capture: ['stdout', 'stderr'],
} as any;

describe('ooda debug logging best-effort helpers', () => {
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    appendSnapshotFileMock.mockReset();
    appendSnapshotFileMock.mockImplementation(() => {});
    (fs.appendFileSync as any).mockReset();
    (fs.appendFileSync as any).mockImplementation(() => {});
    (fs.mkdirSync as any).mockReset();
    (fs.mkdirSync as any).mockImplementation(() => {});
    (fs.readFileSync as any).mockReset();
    (fs.readFileSync as any).mockImplementation(() => 'line1\nline2');
    (fs.writeFileSync as any).mockReset();
    (fs.writeFileSync as any).mockImplementation(() => {});
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    debugSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('writeSnapshots logs debug on failure but does not throw', () => {
    (fs.mkdirSync as any).mockImplementation(() => {
      throw new Error('mkdir fail');
    });
    (fs.appendFileSync as any).mockImplementation(() => {
      throw new Error('append fail');
    });

    expect(() => writeSnapshots('/tmp/ooda-debug/log.jsonl', [{ pane: 'a', title: 't', status: 'Busy', reason: 'r' } as any])).not.toThrow();
    expect(debugSpy.mock.calls.some(([msg]) => String(msg).includes('writeSnapshots'))).toBe(true);
  });

  it('writeJobSnapshot logs debug when appendSnapshotFile throws', () => {
    appendSnapshotFileMock.mockImplementation(() => {
      throw new Error('appendSnapshot fail');
    });

    expect(() => writeJobSnapshot('/tmp/ooda-debug/snapshot.jsonl', BASE_JOB, 'success', 0, 'out', 'err', false)).not.toThrow();
    expect(debugSpy.mock.calls.some(([msg]) => String(msg).includes('writeJobSnapshot'))).toBe(true);
  });

  it('enforceRetention logs debug when fs operations fail', () => {
    (fs.readFileSync as any).mockImplementation(() => {
      throw new Error('read fail');
    });

    expect(() => enforceRetention('/tmp/ooda-debug/snapshot.jsonl', 1)).not.toThrow();
    expect(debugSpy.mock.calls.some(([msg]) => String(msg).includes('enforceRetention'))).toBe(true);
  });

  it('printJobResult does not throw on stdout write failure and logs', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => {
      throw new Error('stdout fail');
    });

    const job = { ...BASE_JOB, capture: ['stdout'] } as any;
    expect(() => printJobResult(job, { stdout: 'hi\n' }, false)).not.toThrow();
    expect(debugSpy.mock.calls.some(([msg]) => String(msg).includes('printJobResult'))).toBe(true);
    writeSpy.mockRestore();
  });
});
