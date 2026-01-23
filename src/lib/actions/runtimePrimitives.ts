import { CliError } from '../../types.js';
import { gitCheckoutBranch, gitLocalBranchExists } from '../wrappers.js';
import { showIssue, runBdSync } from '../bd.js';

export function gitEnsureBranch(branch: string) {
  if (!branch) {
    throw new CliError('git_ensure_branch: branch is required', 1);
  }

  const exists = gitLocalBranchExists(branch);
  gitCheckoutBranch(branch, !exists);
}

export function bdUpdateExternalRefIfEmpty(issueId: string, value: string) {
  if (!issueId) {
    throw new CliError('bd_update_external_ref_if_empty: bead id is required', 1);
  }
  if (!value) {
    throw new CliError('bd_update_external_ref_if_empty: value is required', 1);
  }

  const issueRaw = showIssue(issueId);
  const issue = Array.isArray(issueRaw) ? issueRaw[0] : issueRaw;
  const currentRef = String(issue?.external_ref ?? '').trim();
  if (currentRef) return;

  runBdSync(['update', issueId, '--external-ref', value]);
}

export function bdUpdateStatusIfNot(issueId: string, status: string) {
  if (!issueId) {
    throw new CliError('bd_update_status_if_not: bead id is required', 1);
  }
  if (!status) {
    throw new CliError('bd_update_status_if_not: status is required', 1);
  }

  const issueRaw = showIssue(issueId);
  const issue = Array.isArray(issueRaw) ? issueRaw[0] : issueRaw;
  const currentStatus = String(issue?.status ?? '').toLowerCase();
  if (currentStatus === status.toLowerCase()) return;

  runBdSync(['update', issueId, '--status', status]);
}

export function bdCommentsEnsure(issueId: string, text: string) {
  if (!issueId) {
    throw new CliError('bd_comments_ensure: bead id is required', 1);
  }

  const listRaw = runBdSync(['comments', issueId, '--json']);
  const comments = JSON.parse(listRaw);
  const exists = Array.isArray(comments) && comments.some((c: any) => String(c?.text ?? '') === text);
  if (exists) return;

  runBdSync(['comments', 'add', issueId, text]);
}
