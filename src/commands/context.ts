import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { Command } from 'commander';
import { CliError } from '../types.js';
import { logStdout } from '../lib/io.js';
import { scanDocs } from '../lib/contextGenerator.js';

function ensureParent(outPath: string) {
  const parent = dirname(outPath);
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
}

async function buildGenerated(): Promise<string> {
  const entries = await scanDocs(process.cwd(), ['docs'])
  const lines: string[] = []
  lines.push('# CONTEXT PACK')
  lines.push('')
  lines.push('## Generated entries')
  lines.push('')
  for (const e of entries) {
    lines.push(`- ${e.path} — ${e.summary}`)
  }
  lines.push('')
  lines.push('## How to query live state')
  lines.push('')
  lines.push('- Beads issues: bd ready --json')
  lines.push('- Current in-progress: bd list --status=in_progress --json')
  return lines.join('\n')
}

export function createContextCommand() {
  const cmd = new Command('context');
  cmd
    .description('Generate/refresh docs/dev/CONTEXT_PACK.md')
    .alias('ctx')
    .option('--out <path>', 'Path to write context pack (if omitted, prints to stdout)')
    .option('--force', 'Overwrite existing file')
    .option('--max-tokens <n>', 'Soft max tokens (not enforced in v1)')
    .action(async (options, command) => {
      // Default behavior: write to canonical path and overwrite on every run
      const outOpt = (options.out as string | undefined) ?? 'docs/dev/CONTEXT_PACK.md';
      const force = Boolean(options.force);
      const content = await buildGenerated();

      const out = resolve(outOpt);

      // If user explicitly provided --out, preserve overwrite protection unless --force supplied
      if (options.out && !force && existsSync(out)) {
        throw new CliError(`File already exists at ${out}. Use --force to overwrite`, 2);
      }

      ensureParent(out);
      writeFileSync(out, content, { encoding: 'utf8' });
      logStdout(`Wrote context pack to ${out}`);
    });

  return cmd;
}
