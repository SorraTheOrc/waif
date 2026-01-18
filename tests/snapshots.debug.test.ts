import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as snapshots from '../src/lib/snapshots.js';
import fs from 'fs';

describe('snapshots debug logging', () => {
  let debugSpy: any;
  let appendSyncStub: any;
  let readSyncStub: any;
  let writeSyncStub: any;

  beforeEach(() => {
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    appendSyncStub = vi.spyOn(fs, 'appendFileSync').mockImplementation(() => { throw new Error('append failed'); });
    readSyncStub = vi.spyOn(fs, 'readFileSync').mockImplementation(() => '');
    writeSyncStub = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writeJobSnapshot does not throw and logs debug on append failure', () => {
    const snap = {
      time: new Date().toISOString(),
      job_id: 'job-1',
      name: 'job',
      exit_code: null
    } as any;

    expect(() => snapshots.writeJobSnapshot('history', snap)).not.toThrow();
    expect(debugSpy).toHaveBeenCalled();
    const calledWith = debugSpy.mock.calls.map((c: any[]) => String(c[0]));
    expect(calledWith.some((s: string) => s.includes('[wf-pdpc] writeJobSnapshot'))).toBeTruthy();
  });

  it('appendSnapshotFile does not throw and logs debug on append failure', () => {
    const snap = {
      time: new Date().toISOString(),
      job_id: 'job-2',
      name: 'job',
      exit_code: null
    } as any;

    expect(() => snapshots.appendSnapshotFile('/tmp/nonexistent/seq.jsonl', snap)).not.toThrow();
    expect(debugSpy).toHaveBeenCalled();
    const calledWith = debugSpy.mock.calls.map((c: any[]) => String(c[0]));
    expect(calledWith.some((s: string) => s.includes('[wf-pdpc] appendSnapshotFile'))).toBeTruthy();
  });
});
