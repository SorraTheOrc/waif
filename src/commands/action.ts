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
import { findActionByName, loadActionFromFile, runAction } from '../lib/actions.js';

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
      const dryRun = Boolean(options.dryRun) || paramFlags.has('--dry-run');
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
