import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';
import { Command } from 'commander';
import { CliError } from '../types.js';
import { logStdout } from '../lib/io.js';
import { scanDocs } from '../lib/contextGenerator.js';

function ensureParent(outPath: string) {
  const parent = dirname(outPath);
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
}

async function buildGenerated(outPath: string): Promise<string> {
  const cwd = process.cwd();
  const outRel = relative(cwd, outPath).replace(/\\/g, '/');
  const entries = (await scanDocs(cwd, ['docs'])).filter((e) => e.path.replace(/\\/g, '/') !== outRel);
  const lines: string[] = []
  lines.push('# CONTEXT PACK')
  lines.push('')
  lines.push('## Generated entries')
  lines.push('')
  for (const e of entries) {
    // file as a sub-heading with live link and excerpt
    const relLink = relative(dirname(outPath), resolve(cwd, e.path)).replace(/\\/g, '/');
    const link = relLink.startsWith('.') ? relLink : `./${relLink}`;
    lines.push(`### [${e.path}](${link})`)
    lines.push('')
    lines.push('```')
    lines.push(e.summary)
    lines.push('```')
    lines.push('')
  }
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
      const out = resolve(outOpt);
      const content = await buildGenerated(out);

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
