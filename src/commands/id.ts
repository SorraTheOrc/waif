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

export function createIdCommand() {
  const cmd = new Command('id');
  cmd.description('Beads/id based workflow helpers');

  const start = new Command('start');
  start
    .description('Claim a bead and create/check out a local topic branch')
    .argument('<bead-id>', 'Beads issue id (e.g., wf-123)')
    .option('--dry-run', 'Print intended actions without making changes')
    .action((beadId: string, options: StartOptions) => {
      const dryRun = Boolean(options.dryRun);

      ensureCliAvailable('git', 'Install git and ensure it is on PATH.');
      ensureCliAvailable('bd', 'Install beads (bd) and ensure it is on PATH.');

      if (!dryRun) {
        requireCleanWorkingTree();
      } else {
        // Still run status for more helpful output, but don't block.
        execFileOrThrow('git', ['status', '--porcelain=v1']);
      }

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
  return cmd;
}
