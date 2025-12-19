import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { describe, expect, it, vi, afterEach } from 'vitest';

// Utility to reset modules between tests so mocks apply to fresh imports
async function importBd() {
  return await import('../src/lib/bd.js');
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('bd wrapper', () => {
  it('updates via bd CLI when available', async () => {
    const spawnMock = vi.fn((cmd: string, args: string[], opts: { input?: string }) => {
      if (args[0] === '--version') {
        return { status: 0, stdout: 'bd 1.0.0', stderr: '' };
      }
      if (args[0] === 'show') {
        return { status: 0, stdout: JSON.stringify({ id: 'wf-1', description: 'hello' }), stderr: '' };
      }
      if (args[0] === 'update') {
        // ensure the link line is present in the body passed via stdin
        expect(opts.input).toContain('Linked PRD: /tmp/prd.md');
        return { status: 0, stdout: '', stderr: '' };
      }
      throw new Error(`unexpected args: ${args.join(' ')}`);
    });

    vi.doMock('child_process', () => ({ spawnSync: spawnMock }));
    const { updateIssueAddPrdLink } = await importBd();

    const res = updateIssueAddPrdLink('wf-1', '/tmp/prd.md');
    expect(res).toEqual({ updated: true, method: 'bd' });
    // calls: version, show, update
    expect(spawnMock).toHaveBeenCalledWith('bd', ['--version'], expect.any(Object));
    expect(spawnMock).toHaveBeenCalledWith('bd', ['show', 'wf-1', '--json'], expect.any(Object));
    expect(spawnMock).toHaveBeenCalledWith('bd', ['update', 'wf-1', '--body-file', '-'], expect.objectContaining({ input: expect.any(String) }));
  });

  it('is idempotent when link already exists via bd CLI', async () => {
    const spawnMock = vi.fn((cmd: string, args: string[]) => {
      if (args[0] === '--version') return { status: 0, stdout: 'bd 1.0.0', stderr: '' };
      if (args[0] === 'show') return { status: 0, stdout: JSON.stringify({ id: 'wf-1', description: 'hello\n\nLinked PRD: /tmp/prd.md' }), stderr: '' };
      // update should not be called when link already exists
      throw new Error('update should not be invoked');
    });

    vi.doMock('child_process', () => ({ spawnSync: spawnMock }));
    const { updateIssueAddPrdLink } = await importBd();

    const res = updateIssueAddPrdLink('wf-1', '/tmp/prd.md');
    expect(res).toEqual({ updated: false, method: 'bd' });
    expect(spawnMock).toHaveBeenCalledWith('bd', ['--version'], expect.any(Object));
    expect(spawnMock).toHaveBeenCalledWith('bd', ['show', 'wf-1', '--json'], expect.any(Object));
  });

  it('falls back to .beads/issues.jsonl when bd is unavailable', async () => {
    const spawnMock = vi.fn(() => {
      throw new Error('bd not installed');
    });

    vi.doMock('child_process', () => ({ spawnSync: spawnMock }));

    // prepare temp .beads/issues.jsonl
    const dir = mkdtempSync(join(tmpdir(), 'bd-fallback-'));
    const beadsDir = join(dir, '.beads');
    const issuesPath = join(beadsDir, 'issues.jsonl');
    require('fs').mkdirSync(beadsDir, { recursive: true });
    writeFileSync(issuesPath, JSON.stringify({ id: 'wf-xyz', description: 'original' }) + '\n', 'utf8');

    const cwdOriginal = process.cwd();
    process.chdir(dir);
    try {
      const { updateIssueAddPrdLink } = await importBd();
      const res = updateIssueAddPrdLink('wf-xyz', '/tmp/prd.md');
      expect(res).toEqual({ updated: true, method: 'jsonl' });

      const updated = readFileSync(issuesPath, 'utf8');
      expect(updated).toContain('Linked PRD: /tmp/prd.md');
    } finally {
      process.chdir(cwdOriginal);
    }
  });
});
