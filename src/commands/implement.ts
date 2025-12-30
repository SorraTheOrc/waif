import { Command } from 'commander';
import { spawnSync } from 'child_process';
import { logStdout, emitJson } from '../lib/io.js';

function runSpawn(cmd: string, args: string[], timeout = 30000): { stdout: string; status: number } {
  const res = spawnSync(cmd, args, { encoding: 'utf8', timeout });
  return { stdout: String(res.stdout ?? ''), status: typeof res.status === 'number' ? res.status : 0 };
}

function gitStatus(): string {
  const out = runSpawn('git', ['status', '--porcelain=v1', '-b']);
  return out.stdout;
}

function isWorkingTreeClean(): boolean {
  const status = gitStatus();
  return status.trim() === '';
}

function runWaifInProgressJson(): string | null {
  try {
    const res = runSpawn('node', ['dist/index.js', 'in-progress', '--json']);
    if (res.status !== 0) return null;
    return res.stdout.trim();
  } catch (e) {
    return null;
  }
}

function runWaifNextJson(): string | null {
  try {
    const res = runSpawn('node', ['dist/index.js', 'next', '--json']);
    if (res.status !== 0) return null;
    return res.stdout.trim();
  } catch (e) {
    return null;
  }
}

export function createImplementCommand() {
  const cmd = new Command('implement');
  cmd
    .description('Begin implementation for a Beads issue. Usage: /implement <bd-id>')
    .argument('[bdId]', 'Beads issue id')
    .option('--branch-from <ref>', 'Base ref for new branch (default: origin/main)')
    .action((bdId: string | undefined, opts, command) => {
      const jsonOutput = Boolean(command.parent?.getOptionValue('json'));

      // Safety gate: check working tree
      const status = gitStatus();
      if (status.trim() !== '') {
        const message = `Working tree is dirty. Please choose one of: A) carry changes into issue branch; B) commit first; C) stash; D) discard (CONFIRM); E) abort.`;
        if (jsonOutput) {
          emitJson({ error: 'dirty_working_tree', message, status });
          process.exit(2);
        }
        throw new Error(message);
      }

      // Determine bd id
      let id = bdId;
      if (!id) {
        // try in-progress
        const inProgress = runWaifInProgressJson();
        if (inProgress) {
          try {
            const parsed = JSON.parse(inProgress);
            if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].id) {
              id = parsed[0].id;
            }
          } catch (e) {
            // ignore
          }
        }
      }

      if (!id) {
        const next = runWaifNextJson();
        if (next) {
          try {
            const parsed = JSON.parse(next);
            if (parsed?.id) id = parsed.id;
          } catch (e) {
            // ignore
          }
        }
      }

      if (!id) {
        const message = 'No Beads id could be determined (explicit arg, in-progress, next). Please run again with /implement <bd-id>.';
        if (jsonOutput) {
          emitJson({ error: 'no_bd_id', message });
          process.exit(3);
        }
        throw new Error(message);
      }

      // Create branch name
      const suffix = 'implement-arg-handling';
      const branch = `feature/${id}/${suffix}`;

      // Create branch from base
      const base = opts.branchFrom || 'origin/main';
      const checkout = runSpawn('git', ['checkout', '-b', branch, base]);
      if (checkout.status !== 0) {
        const errMsg = `git failed to create branch ${branch} from ${base}: ${checkout.stdout}`;
        if (jsonOutput) {
          emitJson({ error: 'git_failed', message: errMsg });
          process.exit(4);
        }
        throw new Error(errMsg);
      }

      // Claim issue via bd
      const bdClaim = runSpawn('bd', ['update', id, '--status', 'in_progress', '--json']);
      if (bdClaim.status !== 0) {
        const errMsg = `bd update failed: ${bdClaim.stdout}`;
        if (jsonOutput) {
          emitJson({ error: 'bd_update_failed', message: errMsg });
          process.exit(5);
        }
        throw new Error(errMsg);
      }

      const success = { id, branch, base };
      if (jsonOutput) {
        emitJson(success);
        return;
      }

      logStdout(`Claimed ${id} and created branch ${branch} from ${base}`);
    });

  return cmd;
}
