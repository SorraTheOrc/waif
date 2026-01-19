import { Command } from 'commander';
import type { Mock } from 'vitest';
import { describe, expect, it, vi } from 'vitest';
import { createShowCommand } from '../src/commands/show.js';
import { showIssue } from '../src/lib/bd.js';

vi.mock('../src/lib/bd.js', () => ({
  showIssue: vi.fn(),
}));

function createTestProgram() {
  const program = new Command();
  program.exitOverride();
  program.addCommand(createShowCommand());
  return program;
}

describe('wf show', () => {
  it('prints main issue, blockers, and children tables', async () => {
     (showIssue as unknown as Mock).mockReturnValue({
       id: 'wf-123',
       title: 'Demo',
       status: 'open',
       priority: 2,
       assignee: 'alice',
       labels: ['stage:in_progress'],

      dependencies: [
        { depends_on_id: 'wf-1', dependency_type: 'blocks', status: 'open' },
        { depends_on_id: 'wf-2', dependency_type: 'parent-child' },
      ],
      children: [{ id: 'wf-2', title: 'Child', status: 'open', priority: 3 }],
    });

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true as any);

    const program = createTestProgram();
    await program.parseAsync(['show', 'wf-123'], { from: 'user' });

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('');
     expect(output).toContain('wf-123');
     expect(output).toContain('Stage');
     expect(output).toContain('in_progress');

    expect(output).toContain('Blockers');
    expect(output).toContain('Children');
    expect(output).toContain('wf-1');
    expect(output).toContain('wf-2');

    stdoutSpy.mockRestore();
  });

   it('adds computed stage to --json output', async () => {
     (showIssue as unknown as Mock).mockReturnValue({
       id: 'wf-123',
       title: 'Demo',
       status: 'open',
       priority: 2,
       labels: ['stage:prd_complete'],
     });

     const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true as any);

     const program = createTestProgram();
     await program.parseAsync(['show', 'wf-123', '--json'], { from: 'user' });

     const output = stdoutSpy.mock.calls.map((c) => c[0]).join('');
     expect(JSON.parse(output)).toMatchObject({ id: 'wf-123', stage: 'prd_complete' });

     stdoutSpy.mockRestore();
   });

   it('prints warning when multiple stage labels present and selects most mature', async () => {
     (showIssue as unknown as Mock).mockReturnValue({
       id: 'wf-999',
       title: 'Multiple stages',
       status: 'open',
       labels: ['stage:idea', 'stage:in_progress'],
     });

     const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true as any);

     const program = createTestProgram();
     await program.parseAsync(['show', 'wf-999'], { from: 'user' });

     const output = stdoutSpy.mock.calls.map((c) => c[0]).join('');
     expect(output).toContain("Warning: multiple stage:* labels present");
     expect(output).toContain("selected 'in_progress'");

     stdoutSpy.mockRestore();
   });

   it('errors when issue not found', async () => {

    (showIssue as unknown as Mock).mockImplementation(() => {
      const err: any = new Error('bd show failed');
      err.exitCode = 1;
      throw err;
    });

    const program = createTestProgram();

    await expect(program.parseAsync(['show', 'wf-missing'], { from: 'user' })).rejects.toThrow(/bd show failed/);
  });
});
