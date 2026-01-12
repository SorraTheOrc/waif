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
  try {
    // Ensure dir exists
    writeFileSync(join(outDir, '.keep'), '');
  } catch (e) {}

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
