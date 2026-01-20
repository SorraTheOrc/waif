import { spawnSync } from 'child_process';

import { CliError } from '../types.js';

export type ExecResult = { stdout: string; stderr: string };

export function execFileOrThrow(cmd: string, args: string[], opts?: { timeoutMs?: number; input?: string }): ExecResult {
  const res = spawnSync(cmd, args, {
    encoding: 'utf8',
    timeout: opts?.timeoutMs ?? 30_000,
    input: opts?.input,
  });

  if (res.error) {
    throw new CliError(`${cmd} not available: ${res.error.message}`, 1);
  }

  const stdout = String(res.stdout ?? '');
  const stderr = String(res.stderr ?? '');

  if (typeof res.status === 'number' && res.status !== 0) {
    throw new CliError(`${cmd} failed: ${stderr || stdout}`.trim(), res.status || 1);
  }

  return { stdout, stderr };
}

export function isCliAvailable(cmd: string): boolean {
  const res = spawnSync(cmd, ['--version'], { encoding: 'utf8', timeout: 2000 });
  if (res.error) return false;
  if (typeof res.status === 'number' && res.status !== 0) return false;
  return true;
}

export function ensureCliAvailable(cmd: string, installHint: string) {
  if (isCliAvailable(cmd)) return;
  throw new CliError(`Missing required tool: ${cmd}. ${installHint}`);
}

export function requireCleanWorkingTree(): void {
  const override = process.env.WAIF_GIT_STATUS_PORCELAIN;
  const porcelain = (override !== undefined)
    ? String(override)
    : execFileOrThrow('git', ['status', '--porcelain=v1']).stdout;

  if (porcelain.trim().length === 0) return;

  throw new CliError(
    [
      'Working tree is dirty; aborting to avoid mixing changes.',
      'Remediation options:',
      '- commit or stash your changes',
      '- or run this command from a clean worktree',
    ].join('\n'),
    1,
  );
}

export function sanitizeBranchSlugFromTitle(title: string, maxLen = 40): string {
  const lower = String(title ?? '').trim().toLowerCase();
  // Keep ASCII letters/digits/spaces; turn everything else into spaces.
  const cleaned = lower.replace(/[^a-z0-9\s]/g, ' ');
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const slug = parts.join('-');

  if (!slug) return 'work';
  if (slug.length <= maxLen) return slug;
  return slug.slice(0, maxLen).replace(/-+$/g, '') || 'work';
}

export function gitLocalBranchExists(branch: string): boolean {
  const res = spawnSync('git', ['rev-parse', '--verify', `refs/heads/${branch}`], { encoding: 'utf8', timeout: 5000 });
  return res.status === 0;
}

export function gitCheckoutBranch(branch: string, create: boolean): void {
  if (create) {
    execFileOrThrow('git', ['checkout', '-b', branch]);
    return;
  }
  execFileOrThrow('git', ['checkout', branch]);
}
