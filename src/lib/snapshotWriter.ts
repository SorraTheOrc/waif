import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { redactSecrets } from './redact.js';
import type { Job } from './config.js';

export interface WriteOpts {
  redactCommand?: boolean;
  keepSummaryLines?: number;
}

export function writeJobSnapshot(logPath: string, job: Job, result: { exitCode: number | null; status: 'success' | 'failure' | 'timeout'; stdout?: string; stderr?: string }, opts?: WriteOpts) {
  if (!logPath) return;
  try {
    const dir = path.dirname(logPath);
    if (dir && dir !== '.') mkdirSync(dir, { recursive: true });

    const time = new Date().toISOString();
    const sanitize = (s?: string) => {
      if (!s) return undefined;
      const txt = opts?.redactCommand ? redactSecrets(s) : s;
      // take first line or up to 200 chars
      const firstLine = txt.split(/\r?\n/)[0];
      const short = firstLine.length > 200 ? firstLine.slice(0, 200) + '...[TRUNCATED]' : firstLine;
      return short;
    };

    const sanitizedStdout = result.stdout ? redactSecrets(result.stdout) : undefined;
    const sanitizedStderr = result.stderr ? redactSecrets(result.stderr) : undefined;

    const entry: Record<string, unknown> = {
      time,
      job_id: job.id,
      name: job.name,
      command: opts?.redactCommand ? undefined : job.command,
      exit_code: result.exitCode,
      status: result.status,
      summary: sanitize(result.stdout) ?? sanitize(result.stderr) ?? '',
      sanitized_output: (sanitizedStdout || sanitizedStderr) ?? undefined,
    };

    appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
  } catch (e) {
    // best-effort
  }
}

export function enforceRetention(logPath: string, keepLast?: number) {
  if (!logPath || !keepLast || keepLast <= 0) return;
  try {
    const content = readFileSync(logPath, 'utf8');
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const keep = lines.slice(Math.max(0, lines.length - keepLast));
    const out = keep.map((l) => `${l}\n`).join('');
    writeFileSync(logPath, out, 'utf8');
  } catch (e) {
    // best-effort
  }
}

export default { writeJobSnapshot, enforceRetention };
