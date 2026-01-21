import { join } from 'path';
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

const CLI = [process.execPath, 'dist/index.js'];

function makeRelated(rel: any) {
  return { dependency_type: rel.dependency_type, type: rel.type, id: rel.id, depends_on_id: rel.depends_on_id, status: rel.status, title: rel.title, priority: rel.priority, assignee: rel.assignee };
}

function makeIssues(path: string, issues: any[]) {
  writeFileSync(path, issues.map((i) => JSON.stringify(i)).join('\n') + '\n', 'utf8');
}

describe('wf next epic in-progress recursion', () => {
  it('prefers highest BV leaf across in-progress epics', async () => {
    const tmpIssues = join(tmpdir(), `issues-${Date.now()}-epic-chain.jsonl`);
    makeIssues(tmpIssues, [
      { id: 'wf-epic1', title: 'Epic 1', status: 'in_progress', issue_type: 'epic', priority: 0 },
      { id: 'wf-epic3', title: 'Epic 3', status: 'in_progress', issue_type: 'epic', priority: 2 },
    ]);

    const epicShow = [
      {
        id: 'wf-epic1',
        title: 'Epic 1',
        status: 'in_progress',
        issue_type: 'epic',
        dependents: [
          makeRelated({ id: 'wf-task2', dependency_type: 'parent-child', status: 'open', priority: 2, title: 'Task 2' }),
        ],
        dependencies: [],
      },
      {
        id: 'wf-epic3',
        title: 'Epic 3',
        status: 'in_progress',
        issue_type: 'epic',
        dependents: [
          makeRelated({ id: 'wf-task4', dependency_type: 'parent-child', status: 'open', priority: 1, title: 'Task 4' }),
          makeRelated({ id: 'wf-task5', dependency_type: 'parent-child', status: 'open', priority: 3, title: 'Task 5' }),
        ],
        dependencies: [],
      },
      { id: 'wf-task2', title: 'Task 2', status: 'open', priority: 2 },
      { id: 'wf-task4', title: 'Task 4', status: 'open', priority: 1 },
      { id: 'wf-task5', title: 'Task 5', status: 'open', priority: 3 },
    ];

    const bvPayload = JSON.stringify({ items: [
      { id: 'wf-epic1', score: 100 },
      { id: 'wf-task2', score: 5 },
      { id: 'wf-epic3', score: 10 },
      { id: 'wf-task4', score: 50 },
      { id: 'wf-task5', score: 1 },
    ] });

    const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), 'next', '--json'], {
      env: {
        WAIF_ISSUES_PATH: tmpIssues,
        WAIF_CLIPBOARD_CMD: process.execPath,
        PATH: '',
        WAIF_NO_COLOR: '1',
        WAIF_BD_SHOW_JSON: JSON.stringify(epicShow),
        WAIF_BV_PRIORITY_JSON: bvPayload,
      },
      input: '',
    });

    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout.trim());
    expect(payload.id).toBe('wf-task4');
    expect(payload.waif.epic_context.epic_id).toBe('wf-epic3');
    expect(payload.waif.epic_context.recommended_id).toBe('wf-task4');
  });
});
