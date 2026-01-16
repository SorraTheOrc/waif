import { appendFileSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { redactSecrets } from './redact.js';

export type Snapshot = {
  time: string;
  job_id: string;
  name: string;
  exit_code: number | null;
  sanitized_output: string;
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

  const redactedOutput = redactSecrets(snapshot.sanitized_output ?? '');
  const truncated = redactedOutput.includes('[TRUNCATED');
  const summary = snapshot.summary ?? undefined;

  // Enrich snapshot with metadata fields if missing
  const enriched = Object.assign({}, snapshot, {
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
