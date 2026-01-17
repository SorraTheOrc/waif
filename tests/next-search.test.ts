import { join } from 'path';
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

const CLI = [process.execPath, 'dist/index.js'];

function makeIssues(path: string, issues: any[]) {
  writeFileSync(path, issues.map((i) => JSON.stringify(i)).join('\n') + '\n', 'utf8');
}

describe('wf next search', () => {
  it('promotes matching title above higher bv score', async () => {
    const tmpIssues = join(tmpdir(), `issues-${Date.now()}-search1.jsonl`);
    makeIssues(tmpIssues, [
      { id: 'wf-1', title: 'Higher BV score but not match', status: 'open', priority: 2 },
      { id: 'wf-2', title: 'Context selection strategy', status: 'open', priority: 2 },
      { id: 'wf-3', title: 'Other task', status: 'open', priority: 2 },
    ]);

    const bvPayload = JSON.stringify({ items: [
      { id: 'wf-1', score: 100, rank: 1, rationale: 'higher' },
      { id: 'wf-2', score: 95, rank: 2, rationale: 'slightly lower' },
      { id: 'wf-3', score: 10, rank: 3, rationale: 'low' },
    ]});

    const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), 'next', '-n', '3', '--json', 'context'], {
      env: {
        WAIF_ISSUES_PATH: tmpIssues,
        WAIF_BV_PRIORITY_JSON: bvPayload,
        WAIF_CLIPBOARD_CMD: process.execPath,
        WAIF_NO_COLOR: '1',
        PATH: '',
      },
    });

    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout.trim());
    // first recommended should be wf-2 because it matches title 'context'
    expect(Array.isArray(payload)).toBe(true);
    expect(payload[0].id).toBe('wf-2');
  });

  it('no-match falls back to default recommendation', async () => {
    const tmpIssues = join(tmpdir(), `issues-${Date.now()}-search2.jsonl`);
    makeIssues(tmpIssues, [
      { id: 'wf-1', title: 'Higher BV score', status: 'open', priority: 2 },
      { id: 'wf-2', title: 'Another task', status: 'open', priority: 2 },
      { id: 'wf-3', title: 'Other task', status: 'open', priority: 2 },
    ]);

    const bvPayload = JSON.stringify({ items: [
      { id: 'wf-1', score: 100, rank: 1, rationale: 'higher' },
      { id: 'wf-2', score: 95, rank: 2, rationale: 'slightly lower' },
      { id: 'wf-3', score: 10, rank: 3, rationale: 'low' },
    ]});

    const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), 'next', '-n', '3', 'nomatchterm'], {
      env: {
        WAIF_ISSUES_PATH: tmpIssues,
        WAIF_BV_PRIORITY_JSON: bvPayload,
        WAIF_CLIPBOARD_CMD: process.execPath,
        WAIF_NO_COLOR: '1',
        PATH: '',
      },
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Search: no-match; using default recommendation');
    expect(stdout).toContain('wf-1');
  });
});
