import { spawn } from 'node:child_process';
import { redactSecrets } from './redact.js';

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_CAPTURE = 100_000; // chars

export async function runJobCommand(job) {
  const captureStdout = (job.capture ?? []).includes('stdout');
  const captureStderr = (job.capture ?? []).includes('stderr');
  const stdoutChunks = [];
  const stderrChunks = [];
  let timedOut = false;

  const child = spawn(job.command, {
    shell: true,
    cwd: job.cwd || process.cwd(),
    env: { ...process.env, ...(job.env ?? {}) },
    stdio: ['ignore', captureStdout ? 'pipe' : 'ignore', captureStderr ? 'pipe' : 'ignore'],
  });

  if (captureStdout && child.stdout) child.stdout.on('data', (c) => stdoutChunks.push(Buffer.from(c)));
  if (captureStderr && child.stderr) child.stderr.on('data', (c) => stderrChunks.push(Buffer.from(c)));

  const timeoutMs = Math.max(1, Math.floor((job.timeout_seconds ?? DEFAULT_TIMEOUT_MS / 1000) * 1000));

  return await new Promise((resolve) => {
    let resolved = false;
    const finish = (codeVal, timedOutVal) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      const stdout = captureStdout ? Buffer.concat(stdoutChunks).toString('utf8').slice(0, MAX_CAPTURE) : undefined;
      const stderr = captureStderr ? Buffer.concat(stderrChunks).toString('utf8').slice(0, MAX_CAPTURE) : undefined;
      const exitCode = typeof codeVal === 'number' ? codeVal : null;
      const status = timedOutVal ? 'timeout' : exitCode === 0 ? 'success' : 'failure';
      resolve({ code: exitCode, exitCode, stdout: redactSecrets(stdout || ''), stderr: redactSecrets(stderr || ''), timedOut: timedOutVal, status });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (child && typeof child.kill === 'function') child.kill('SIGKILL');
      } catch (e) {
        // ignore
      }
      // resolve even if child never emits close
      finish(null, true);
    }, timeoutMs);

    child.on('error', () => {
      finish(null, timedOut);
    });

    child.on('close', (code) => {
      finish(typeof code === 'number' ? code : null, timedOut);
    });
  });
}
