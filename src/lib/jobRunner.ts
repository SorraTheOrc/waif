import { spawn } from 'node:child_process';
import { redactSecrets } from './redact.js';
import type { Job } from './config.js';

export interface JobRunResult {
  timedOut: boolean;
  exitCode: number | null;
  // aliases for different consumer shapes
  code?: number | null;
  exit_code?: number | null;
  stdout: string;
  stderr: string;
  status: 'success' | 'failure' | 'timeout';
  duration_ms: number;
}

const DEFAULT_TIMEOUT_SECONDS = 60;
const MAX_CAPTURE = 100_000; // chars

export async function runJobCommand(job: Job): Promise<JobRunResult> {
  const start = Date.now();
  const timeoutSeconds = typeof job.timeout_seconds === 'number' ? job.timeout_seconds : DEFAULT_TIMEOUT_SECONDS;
  const timeoutMs = Math.max(1, Math.floor(timeoutSeconds * 1000));

  const captureStdout = (job.capture ?? []).includes('stdout');
  const captureStderr = (job.capture ?? []).includes('stderr');

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let timedOut = false;

  const child = spawn(job.command, {
    shell: true,
    cwd: job.cwd || process.cwd(),
    env: { ...process.env, ...(job.env ?? {}) },
    stdio: ['ignore', captureStdout ? 'pipe' : 'ignore', captureStderr ? 'pipe' : 'ignore'],
  });

  if (captureStdout && child.stdout) child.stdout.on('data', (c: Buffer) => stdoutChunks.push(c));
  if (captureStderr && child.stderr) child.stderr.on('data', (c: Buffer) => stderrChunks.push(c));

  return await new Promise<JobRunResult>((resolve) => {
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
      // If process doesn't emit 'close' after kill, ensure we still finish
      setTimeout(() => {
        finish(null);
      }, 200);
    }, timeoutMs);

    let finished = false;
    const finish = (code: number | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      const rawOut = captureStdout ? Buffer.concat(stdoutChunks).toString('utf8') : '';
      const rawErr = captureStderr ? Buffer.concat(stderrChunks).toString('utf8') : '';

      // truncate to MAX_CAPTURE chars
      const trunc = (s: string) => {
        if (!s) return '';
        if (s.length <= MAX_CAPTURE) return s;
        const tail = s.length - MAX_CAPTURE;
        return s.slice(0, MAX_CAPTURE) + `\n[TRUNCATED ${tail} chars]`;
      };

      const stdout = redactSecrets(trunc(rawOut));
      const stderr = redactSecrets(trunc(rawErr));
      const duration_ms = Date.now() - start;
      const status: JobRunResult['status'] = timedOut ? 'timeout' : code === 0 ? 'success' : 'failure';
      resolve({ timedOut, exitCode: typeof code === 'number' ? code : null, stdout, stderr, status, duration_ms });
    };

    child.on('error', () => finish(null));
    child.on('close', (code) => finish(typeof code === 'number' ? code : null));
  });
}

export default { runJobCommand };
