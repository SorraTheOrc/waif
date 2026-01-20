import { Command } from 'commander';

import { CliError } from '../types.js';
import { emitJson, logStdout, logStderr } from '../lib/io.js';
import { ensureCliAvailable, execFileOrThrow, requireCleanWorkingTree, sanitizeBranchSlugFromTitle } from '../lib/wrappers.js';
import { showIssue } from '../lib/bd.js';
import { findActionByName, loadActionFromFile, runAction, discoverRepoActions, DryRunRenderedStep } from '../lib/actions.js';
import YAML from 'js-yaml';
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

type StartOptions = {
  dryRun?: boolean;
};

function normalizeBdShowResult(value: any): any {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function createActionCommand() {
  const cmd = new Command('action');
  cmd.description('Action-based producer workflow wrappers');

  const start = new Command('start');
  start
    .description('Claim a bead and create/check out a local topic branch')
    .argument('<bead-id>', 'Beads issue id (e.g., wf-123)')
    .argument('[params...]', 'Positional parameters and key=val inputs passed to the action')
    .option('--dry-run', 'Print intended actions without making changes')
    .option('--json', 'Emit JSON dry-run output (dry-run only)')
    .action((beadId: string, params: string[] | undefined, options: StartOptions & { json?: boolean }) => {
      // Commander may place flags after variadic args; support consuming flags from params too.
      params = params ?? [];
      const flagParams = new Set(params.filter((p) => p.startsWith('--')));
      // Detect flags whether commander parsed them or they were left in params.
      const rawArgv = Array.isArray(process.argv) ? process.argv : [];
      const dryRun = Boolean(options?.dryRun) || flagParams.has('--dry-run') || rawArgv.includes('--dry-run');
      const jsonMode = Boolean(options?.json) || flagParams.has('--json') || rawArgv.includes('--json');
      if (jsonMode && !dryRun) {
        throw new CliError('--json is only supported with --dry-run for now', 1);
      }
      // Remove recognized flags from params before parsing positional/key=val inputs
      params = params.filter((p) => p !== '--dry-run' && p !== '--json');

      // Parse positional params into ordered params and key=value inputs
      const positional: string[] = [];
      const inputs: Record<string, string> = {};
      params.forEach((p) => {
        const idx = p.indexOf('=');
        if (idx > 0) {
          const k = p.slice(0, idx);
          const v = p.slice(idx + 1);
          inputs[k] = v;
        } else {
          positional.push(p);
        }
      });

      ensureCliAvailable('git', 'Install git and ensure it is on PATH.');
      ensureCliAvailable('bd', 'Install beads (bd) and ensure it is on PATH.');

      if (!dryRun) {
        requireCleanWorkingTree();
      } else {
        // Still run status for more helpful output, but don't block.
        execFileOrThrow('git', ['status', '--porcelain=v1']);
      }

      // Ensure bead id is present in positional[0] so templates can read it directly.
      const actionPositional = [beadId, ...positional];
      if (!inputs.bead_id) {
        inputs.bead_id = beadId;
      }

      const issueRaw = showIssue(beadId);
      const issue = normalizeBdShowResult(issueRaw);
      if (!issue || !issue.id) {
        throw new CliError(`Issue ${beadId} not found`, 1);
      }

      const slug = sanitizeBranchSlugFromTitle(String(issue.title ?? beadId));
      if (!inputs.branch) {
        inputs.branch = `bd-${beadId}/${slug}`;
      }
      if (!inputs.branch_ref) {
        inputs.branch_ref = `branch:${inputs.branch}`;
      }
      if (!inputs.issue_title) {
        inputs.issue_title = String(issue.title ?? '');
      }
      if (!inputs.issue_status && issue.status) {
        inputs.issue_status = String(issue.status);
      }
      if (!inputs.status_target) {
        inputs.status_target = 'in_progress';
      }

      const found = findActionByName('start');
      if (!found) {
        throw new CliError('Action not found: start', 1);
      }

      const runMsg = `Running action ${found.action.name} (source=${found.source})`;
      if (jsonMode) {
        logStderr(runMsg);
      } else {
        logStdout(runMsg);
      }

      if (dryRun && !jsonMode) {
        logStdout('Dry run plan:');
      }

      const dryRunSteps: DryRunRenderedStep[] = [];
      runAction(found.action, actionPositional, inputs, {
        dryRun,
        onDryRunStep: (_step, rendered) => {
          if (jsonMode) {
            dryRunSteps.push(rendered);
          } else {
            logStdout(formatDryRunSummary(rendered));
          }
        },
      });

      if (jsonMode && dryRun) {
        emitJson({ action: found.action.name, dry_run: dryRunSteps });
      }
    });

function formatDryRunSummary(step: DryRunRenderedStep) {
  switch (step.type) {
    case 'bd_update_status_if_not':
      return `- Ensure status is ${step.status}`;
    case 'git_ensure_branch':
      return `- Checkout or create branch ${step.branch}`;
    case 'bd_update_external_ref_if_empty':
      return `- Record external ref ${step.value}`;
    case 'bd_comments_ensure':
      return `- Ensure comment "${step.text}" exists`;
    case 'shell':
      return `- Run shell: ${step.cmd}`;
    case 'bd':
      return `- Run bd: ${step.cmd}`;
    default:
      return `- Step: ${JSON.stringify(step)}`;
  }
}

  cmd.addCommand(start);

  const list = new Command('list');
  list.description('List discovered actions (repo .waif/actions)');
  list.option('--dir <path>', 'Directory to search for actions (default: .waif/actions)');
  list.action((options: any) => {
    const dir = options.dir ?? '.waif/actions';
    const found = discoverRepoActions(dir);
    if (!found || found.length === 0) {
      logStdout(`No actions discovered in ${dir}`);
      return;
    }
    for (const f of found) {
      logStdout(`${f.action.name}\t${f.path}`);
    }
  });
  cmd.addCommand(list);

  const info = new Command('info');
  info.description('Show action definition details')
    .argument('<action-name>', 'Action name to show')
    .option('--dir <path>', 'Directory to search for action (default: .waif/actions)')
    .action((name: string, options: any) => {
      if (options?.dir) {
        const p = join(options.dir, `${name}.yml`);
        const a = loadActionFromFile(p);
        const dump = YAML.dump(a as any);
        logStdout(dump);
        return;
      }

      const found = findActionByName(name);
      if (!found) throw new CliError(`Action not found: ${name}`, 1);
      const dump = YAML.dump(found.action as any);
      logStdout(dump);
    });
  cmd.addCommand(info);

  const init = new Command('init');
  init.description('Scaffold a new action in .waif/actions')
    .argument('<action-name>', 'Action name to create (also used as filename)')
    .option('--dir <path>', 'Directory to create actions in (default: .waif/actions)')
    .action((name: string, options: any) => {
      const dir = options.dir ?? '.waif/actions';
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const file = join(dir, `${name}.yml`);
      if (existsSync(file)) throw new CliError(`Action file already exists: ${file}`, 1);
      const template = {
        name,
        description: `Action ${name} - describe what this does`,
        runs: [{ type: 'noop' }],
      } as any;
      writeFileSync(file, YAML.dump(template), { encoding: 'utf8' });
      logStdout(`Created action: ${file}`);
    });
  cmd.addCommand(init);

  const lint = new Command('lint');
  lint.description('Validate action YAML files against schema')
    .option('--dir <path>', 'Directory to search for actions (default: .waif/actions)')
    .option('--file <path>', 'Validate a single action file')
    .action((options: any) => {
      const dir = options.dir ?? '.waif/actions';
      if (options.file) {
        const a = loadActionFromFile(options.file);
        // loadActionFromFile throws on validation failure, so success means OK
        logStdout(`OK: ${options.file}`);
        return;
      }

      // Read directory entries without attempting to pre-load/validate them so
      // we can report per-file errors instead of failing fast.
      try {
        const files = readdirSync(dir);
        const yamlFiles = files.filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
        if (yamlFiles.length === 0) {
          logStdout(`No actions discovered in ${dir}`);
          return;
        }

        let failed = false;
        for (const fn of yamlFiles) {
          const p = join(dir, fn);
          try {
            loadActionFromFile(p);
            logStdout(`OK: ${p}`);
          } catch (e: any) {
            failed = true;
            logStdout(`ERR: ${p} -> ${String(e?.message ?? e)}`);
          }
        }

        if (failed) throw new CliError('One or more actions failed validation', 1);
      } catch (e: any) {
        // Directory missing or unreadable -> only swallow "not found" errors.
        if (e && e.code === 'ENOENT') {
          logStdout(`No actions discovered in ${dir}`);
          return;
        }
        // Propagate other errors (including validation CliError) so caller sees non-zero exit.
        throw e;
      }
    });
  cmd.addCommand(lint);

  // Override subcommand descriptions with repo-discovered action descriptions
  // when an action file with a matching name exists. This keeps help text in
  // sync with the repository action definitions without requiring special
  // casing for each subcommand.
  try {
    const repoActions = discoverRepoActions('.waif/actions');
    for (const a of repoActions) {
      const name = a.action?.name;
      if (!name) continue;
      const cmdObj = cmd.commands.find((c) => c.name() === name);
      if (cmdObj && a.action.description) {
        cmdObj.description(String(a.action.description));
      }
    }
  } catch (e) {
    // ignore discovery errors for help rendering
  }

  // Default behavior: run a discovered action by name.
  // This is invoked when the user runs `wf action <name> [params...]` and no explicit subcommand matches.
  cmd
    .argument('[action-id]', 'Action id to run (discovered from .waif/actions or bundled actions)')
    .argument('[params...]', 'Positional parameters and key=val inputs passed to the action')
    .option('--file <path>', 'Load action from explicit file')
    .option('--dry-run', 'Print intended actions without making changes')
    .option('--json', 'Emit JSON dry-run output (dry-run only)')
    .option('--pretty', 'Force human-readable dry-run output (default)')
    .action((actionId: string | undefined, params: string[] | undefined, options: any) => {
      if (!actionId) {
        // no-op: just show help
        cmd.help();
        return;
      }

      params = params ?? [];
      const flagParams = new Set(params.filter((p) => p.startsWith('--')));

      const rawArgv = Array.isArray(process.argv) ? process.argv : [];
      const dryRun = Boolean(options.dryRun) || flagParams.has('--dry-run') || rawArgv.includes('--dry-run');
      const jsonMode = Boolean(options.json) || flagParams.has('--json') || rawArgv.includes('--json');
      if (jsonMode && !dryRun) {
        throw new CliError('--json is only supported with --dry-run for now', 1);
      }

      // Parse params into positional and inputs
      const positional: string[] = [];
      const inputs: Record<string, string> = {};
      (params ?? []).forEach((p) => {
        const idx = p.indexOf('=');
        if (idx > 0) {
          inputs[p.slice(0, idx)] = p.slice(idx + 1);
        } else {
          positional.push(p);
        }
      });

      let actionDef;
      let source = options.file;
      if (options.file) {
        actionDef = loadActionFromFile(source);
      } else {
        const found = findActionByName(actionId);
        if (!found) throw new CliError(`Action not found: ${actionId}`, 1);
        actionDef = found.action;
        source = found.source;
      }

      const runMsg = `Running action ${actionDef.name} (source=${source})`;
      if (jsonMode) {
        logStderr(runMsg);
      } else {
        logStdout(runMsg);
      }
      if (dryRun && !jsonMode) {
        logStdout('Dry run plan:');
      }
      const dryRunSteps: DryRunRenderedStep[] = [];
      runAction(actionDef, positional, inputs, {
        dryRun,
        onDryRunStep: (_step, rendered) => {
          if (jsonMode) {
            dryRunSteps.push(rendered);
          } else {
            logStdout(formatDryRunSummary(rendered));
          }
        },
      });

      if (jsonMode && dryRun) {
        emitJson({ action: actionDef.name, dry_run: dryRunSteps });
      }
    });
  return cmd;
}
