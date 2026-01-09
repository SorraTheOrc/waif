import { mkdirSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';

export function writeJobSnapshot(filePath, job, result, opts = {}) {
  if (!filePath) return;
  try {
    const dir = require('node:path').dirname(filePath);
    if (dir && dir !== '.') mkdirSync(dir, { recursive: true });
    const time = new Date().toISOString();
  const stdoutText = (result.stdout ?? result.stdout ?? '') || '';
  const stderrText = (result.stderr ?? result.stderr ?? '') || '';
  const sanitizedOutput = stdoutText + (stderrText ? `\n${stderrText}` : '');
  const summary = (sanitizedOutput.split(/\r?\n/)[0] || '').slice(0, 200);
  const exitCode = result.exitCode ?? result.code ?? result.exit_code ?? null;
  const timedOut = Boolean(result.timedOut ?? result.timed_out ?? false);
  const status = result.status ?? (timedOut ? 'timeout' : exitCode === 0 ? 'success' : 'failure');
  const snapshot = {
    time,
    job_id: job.id,
    name: job.name,
    command: job.command,
    exit_code: exitCode,
    status,
    summary,
    sanitized_output: sanitizedOutput.slice(0, 100000),
  };
    appendFileSync(filePath, JSON.stringify(snapshot) + '\n', 'utf8');
  } catch (e) {
    // best-effort
  }
}

export function enforceRetention(filePath, keepLast) {
  if (!filePath || !keepLast || keepLast <= 0) return;
  try {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const trimmed = lines.slice(Math.max(0, lines.length - keepLast));
    writeFileSync(filePath, trimmed.map((l) => `${l}\n`).join(''), 'utf8');
  } catch (e) {
    // best-effort
  }
}
