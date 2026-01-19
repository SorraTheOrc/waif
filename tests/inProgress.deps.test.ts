import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

const CLI = [process.execPath, 'dist/index.js'];

describe('wf in-progress dependencies', () => {
  it('renders Blockers/Depends on lines using bd show fixture', async () => {
    const inProgress = JSON.stringify([
      { id: 'wf-ip1', title: 'First', status: 'in_progress', priority: 2 },
    ]);

    const bdShow = JSON.stringify({
      id: 'wf-ip1',
      dependencies: [
        {
          depends_on_id: 'ge-hch.5',
          title: 'M2 — AI-assisted branching integration',
          dependency_type: 'blocks',
          status: 'open',
          priority: 1,
        },
      ],
    });

    const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), 'in-progress'], {
      env: {
        WAIF_IN_PROGRESS_JSON: inProgress,
        WAIF_BD_SHOW_JSON: bdShow,
        PATH: '',
      },
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain('# In Progress');
    // Should render a Blockers section and include the dependency id/title
    expect(stdout).toContain('Blockers');
    expect(stdout).toContain('ge-hch.5');
    expect(stdout).toContain('M2 — AI-assisted branching integration');
  });
});
