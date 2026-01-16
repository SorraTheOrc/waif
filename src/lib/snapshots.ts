import { appendFileSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { redactSecrets } from './redact.js';

export type Snapshot = {
  time: string;
  job_id: string;
  name: string;
  command?: string;
  exit_code: number | null;
  // prefer separate sanitized stdout/stderr fields for compatibility
  stdout?: string;
  stderr?: string;
  sanitized_output?: string;
  summary?: string;
  // Metadata fields (may be populated by writer when missing)
  durationMs?: number | null;
  metadata_version?: number;
  sanitized?: boolean;
  truncated?: boolean;
};

export function writeJobSnapshot(dir: string, snapshot: Snapshot, options?: { retention?: number }) {
  const retention = options?.retention ?? 10;
  const outDir = dir || 'history';
  try {
    mkdirSync(outDir, { recursive: true });
  } catch (e) {
    // best-effort
  }

  const file = join(outDir, `${snapshot.job_id}.jsonl`);

  // Redact stdout/stderr and compute combined sanitized_output
  const redStdout = redactSecrets(snapshot.stdout ?? '');
  const redStderr = redactSecrets(snapshot.stderr ?? '');
  const combined = [redStdout || undefined, redStderr || undefined].filter(Boolean).join('\n');
  const redactedOutput = snapshot.sanitized_output ? redactSecrets(snapshot.sanitized_output) : combined;
  const truncated = String(redactedOutput || '').includes('[TRUNCATED');
  const summary = snapshot.summary ?? undefined;

  // Enrich snapshot with metadata fields if missing
  const enriched = Object.assign({}, snapshot, {
    stdout: redStdout || undefined,
    stderr: redStderr || undefined,
    sanitized_output: redactedOutput,
    summary,
    metadata_version: snapshot.metadata_version ?? 1,
    durationMs: snapshot.durationMs ?? null,
    sanitized: typeof snapshot.sanitized === 'boolean' ? snapshot.sanitized : true,
    truncated: typeof snapshot.truncated === 'boolean' ? snapshot.truncated : truncated,
  });

  const line = JSON.stringify(enriched) + '\n';
  appendFileSync(file, line, { encoding: 'utf8' });

  // Enforce retention: keep last `retention` non-empty lines
  try {
    const data = readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (data.length > retention) {
      const keep = data.slice(-retention);
      writeFileSync(file, keep.map((l) => `${l}\n`).join(''), 'utf8');
    }
  } catch (e) {
    // ignore
  }
}

export function appendSnapshotFile(filePath: string, snapshot: Snapshot, options?: { retention?: number }) {
  const retention = options?.retention ?? 10;
  try {
    const dir = dirname(filePath);
    if (dir && dir !== '.') mkdirSync(dir, { recursive: true });
  } catch (e) {
    // best-effort
  }

  // Redact/stdout/stderr handling
  const redStdout = redactSecrets(snapshot.stdout ?? '');
  const redStderr = redactSecrets(snapshot.stderr ?? '');
  const combined = [redStdout || undefined, redStderr || undefined].filter(Boolean).join('\n');
  const redactedOutput = snapshot.sanitized_output ? redactSecrets(snapshot.sanitized_output) : combined;
  const truncated = String(redactedOutput || '').includes('[TRUNCATED');

  const enriched = Object.assign({}, snapshot, {
    stdout: redStdout || undefined,
    stderr: redStderr || undefined,
    sanitized_output: redactedOutput,
    metadata_version: snapshot.metadata_version ?? 1,
    durationMs: snapshot.durationMs ?? null,
    sanitized: typeof snapshot.sanitized === 'boolean' ? snapshot.sanitized : true,
    truncated: typeof snapshot.truncated === 'boolean' ? snapshot.truncated : truncated,
  });

  appendFileSync(filePath, JSON.stringify(enriched) + '\n', 'utf8');

  // retention on filePath
  try {
    const data = readFileSync(filePath, 'utf8').split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (data.length > retention) {
      const keep = data.slice(-retention);
      writeFileSync(filePath, keep.map((l) => `${l}\n`).join(''), 'utf8');
    }
  } catch (e) {
    // ignore
  }
}
