import { spawn } from 'child_process';
import { promisify } from 'util';
import { redactSecrets } from './redact.js';

export type Job = {
  id: string;
  name: string;
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  capture?: boolean;
};

export type RunResult = {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  sanitized_output: string;
  durationMs: number;
  // Whether the sanitizer truncated the output
  truncated: boolean;
};

// Minimal helper that runs a shell command and captures output with timeout.
export async function runJobCommand(job: Job, options?: { timeoutMs?: number; cwd?: string; env?: Record<string, string>; capture?: boolean }): Promise<RunResult> {
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const cwd = options?.cwd ?? job.cwd ?? process.cwd();
  const env = Object.assign({}, process.env, job.env ?? options?.env ?? {});
  const capture = options?.capture ?? job.capture ?? true;

  const start = Date.now();

  return new Promise<RunResult>((resolve) => {
    const child = spawn(job.command, { shell: true, cwd, env });
    let stdout = '';
    let stderr = '';
    let finished = false;
    let timedOut = false;

    const onFinish = (code: number | null, signal: string | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      const durationMs = Date.now() - start;
      const combined = (capture ? stdout : '') + (stderr ? `\n${stderr}` : '');
      const sanitized = redactSecrets(combined);
      // detect truncation marker emitted by redactSecrets
      const truncated = sanitized.includes('[TRUNCATED');
      wrappedResolve({ exitCode: code, signal, stdout: capture ? stdout : '', stderr, sanitized_output: sanitized, durationMs, truncated });
    };

    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('exit', (code, signal) => onFinish(code, signal));
    child.on('error', (err) => {
      stderr += err.message;
      onFinish(null, null);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch (e) {}
      onFinish(null, 'SIGKILL');
    }, timeoutMs);

    // Clear timer when finished
    const origResolve = resolve;
    const wrappedResolve = (v: RunResult) => {
      clearTimeout(timer);
      origResolve(v);
    };
  });
}
