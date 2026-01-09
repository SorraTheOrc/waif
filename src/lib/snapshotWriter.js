import { mkdirSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';

export function writeJobSnapshot(filePath, job, result, opts = {}) {
  if (!filePath) return;
  try {
    const dir = require('node:path').dirname(filePath);
    if (dir && dir !== '.') mkdirSync(dir, { recursive: true });
    const time = new Date().toISOString();
    const sanitizedOutput = (result.stdout || '') + (result.stderr ? `\n${result.stderr}` : '');
    const summary = (sanitizedOutput.split(/\r?\n/)[0] || '').slice(0, 200);
    const snapshot = {
      time,
      job_id: job.id,
      name: job.name,
      command: job.command,
      exit_code: result.code,
      status: result.timedOut ? 'timeout' : result.code === 0 ? 'success' : 'failure',
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
