import { appendFileSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

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
  // Ensure directory exists (create by touching a file or mkdir)
  try {
    writeFileSync(join(outDir, '.keep'), '');
  } catch (e) {
    try {
      writeFileSync(join(outDir, '.keep'), '', { flag: 'w' });
    } catch (e2) {
      try { require('fs').mkdirSync(outDir, { recursive: true }); } catch (e3) {}
    }
  }

  const file = join(outDir, `${snapshot.job_id}.jsonl`);

  // Enrich snapshot with metadata fields if missing
  const enriched = Object.assign({}, snapshot, {
    metadata_version: snapshot.metadata_version ?? 1,
    durationMs: snapshot.durationMs ?? null,
    sanitized: typeof snapshot.sanitized === 'boolean' ? snapshot.sanitized : true,
    truncated: typeof snapshot.truncated === 'boolean' ? snapshot.truncated : false,
  });

  const line = JSON.stringify(enriched) + '\n';
  appendFileSync(file, line, { encoding: 'utf8' });

  // Enforce retention: keep last `retention` lines
  try {
    const data = readFileSync(file, 'utf8').trim().split('\n');
    if (data.length > retention) {
      const keep = data.slice(-retention);
      writeFileSync(file, keep.join('\n') + '\n', 'utf8');
    }
  } catch (e) {
    // ignore
  }
}
