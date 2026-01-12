import { appendFileSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';

export type Snapshot = {
  time: string;
  job_id: string;
  name: string;
  exit_code: number | null;
  sanitized_output: string;
  summary?: string;
};

export function writeJobSnapshot(dir: string, snapshot: Snapshot, options?: { retention?: number }) {
  const retention = options?.retention ?? 10;
  const outDir = dir || 'history';
  // Ensure directory exists
  try {
    writeFileSync(join(outDir, '.keep'), '');
  } catch (e) {
    try {
      // attempt to create the directory by writing a file in it
      writeFileSync(join(outDir, '.keep'), '', { flag: 'w' });
    } catch (e2) {
      // try to create using mkdir fallback
      try { require('fs').mkdirSync(outDir, { recursive: true }); } catch (e3) {}
    }
  }

  const file = join(outDir, `${snapshot.job_id}.jsonl`);
  const line = JSON.stringify(snapshot) + '\n';
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
