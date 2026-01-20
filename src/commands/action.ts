import { Command } from 'commander';

import { CliError } from '../types.js';
import { logStdout } from '../lib/io.js';
import { runBdSync, showIssue } from '../lib/bd.js';
import {
  ensureCliAvailable,
  execFileOrThrow,
  gitCheckoutBranch,
  gitLocalBranchExists,
  requireCleanWorkingTree,
  sanitizeBranchSlugFromTitle,
} from '../lib/wrappers.js';
import { findActionByName, loadActionFromFile, runAction, discoverRepoActions } from '../lib/actions.js';
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

function shouldUpdateStatus(issue: any): boolean {
  const status = String(issue?.status ?? '').toLowerCase();
  return status !== 'in_progress';
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
    .action((beadId: string, params: string[] | undefined, options: StartOptions) => {
      // Commander may place flags after variadic args; support consuming --dry-run from params too.
      params = params ?? [];
      const paramFlags = new Set(params.filter((p) => p.startsWith('--')));
      // Detect --dry-run from options, from params (when flags placed after variadic args),
      // or from the raw argv (defensive for tests and different commander versions).
      const dryRun = Boolean(options?.dryRun) || paramFlags.has('--dry-run') || process.argv.includes('--dry-run');
      // Remove recognized flags from params before parsing positional/key=val inputs
      params = params.filter((p) => p !== '--dry-run');

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

      // Provide the action with discovered inputs via environment-like map.
      // For now we keep the same behavior but surface `positional` and `inputs`.
      // Future runner will accept these and dispatch into action steps.
      logStdout(`Action inputs positional=${JSON.stringify(positional)} inputs=${JSON.stringify(inputs)}`);

      const issueRaw = showIssue(beadId);
      const issue = normalizeBdShowResult(issueRaw);
      if (!issue || !issue.id) {
        throw new CliError(`Issue ${beadId} not found`, 1);
      }

      const slug = sanitizeBranchSlugFromTitle(String(issue.title ?? beadId));
      const branch = `bd-${beadId}/${slug}`;

      const actions: string[] = [];

      if (shouldUpdateStatus(issue)) {
        actions.push(`bd update ${beadId} --status in_progress`);
      } else {
        actions.push(`# already in_progress: ${beadId}`);
      }

      if (gitLocalBranchExists(branch)) {
        actions.push(`git checkout ${branch}`);
      } else {
        actions.push(`git checkout -b ${branch}`);
      }

      actions.push(`bd update ${beadId} --external-ref "branch:${branch}" (if empty)`);
      actions.push(`bd comments add ${beadId} "Branch created: ${branch} (local)" (idempotent)`);

      if (dryRun) {
        logStdout(`Dry run: would start work on ${beadId}`);
        actions.forEach((a) => logStdout(a));
        return;
      }

      if (shouldUpdateStatus(issue)) {
        runBdSync(['update', beadId, '--status', 'in_progress']);
      }

      const exists = gitLocalBranchExists(branch);
      gitCheckoutBranch(branch, !exists);

      // Record external ref without clobbering an existing external_ref.
      const refreshed = normalizeBdShowResult(showIssue(beadId));
      const currentRef = String(refreshed?.external_ref ?? '').trim();
      const desiredRef = `branch:${branch}`;
      if (!currentRef) {
        runBdSync(['update', beadId, '--external-ref', desiredRef]);
      }

      // Add a single comment; skip if already present.
      try {
        const commentsJson = runBdSync(['comments', beadId, '--json']);
        const comments = JSON.parse(commentsJson);
        const msg = `Branch created: ${branch} (local)`;
        const already = Array.isArray(comments) && comments.some((c: any) => String(c?.text ?? '') === msg);
        if (!already) {
          runBdSync(['comments', 'add', beadId, msg]);
        }
      } catch {
        // If listing comments fails, still attempt to add; bd will dedupe poorly but we tried.
        runBdSync(['comments', 'add', beadId, `Branch created: ${branch} (local)`]);
      }

      logStdout(`Branch ready: ${branch} (local)`);
      logStdout(`Next: git push -u origin ${branch}`);
    });

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
    .action((actionId: string | undefined, params: string[] | undefined, options: any) => {
      if (!actionId) {
        // no-op: just show help
        cmd.help();
        return;
      }

      const dryRun = Boolean(options.dryRun);

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

      logStdout(`Running action ${actionDef.name} (source=${source})`);
      runAction(actionDef, positional, inputs, dryRun);
    });
  return cmd;
}
