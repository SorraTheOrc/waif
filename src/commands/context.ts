import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { Command } from 'commander';
import { CliError } from '../types.js';
import { logStdout } from '../lib/io.js';

function ensureParent(outPath: string) {
  const parent = dirname(outPath);
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
}

function buildTemplate(): string {
  return `# CONTEXT PACK

## Overview

This file is an agent-oriented signpost. See docs/dev/context_pack_PRD.md for requirements and selection rules.

## Important docs

- docs/dev/context_pack_PRD.md — Canonical PRD for Context Pack
- docs/Workflow.md — Project workflow rules
- AGENTS.md / @AGENTS.md — Agent roles and responsibilities

## How to query live state

- Beads issues: bd ready --json
- Current in-progress: bd list --status=in_progress --json
`;
}

export function createContextCommand() {
  const cmd = new Command('context');
  cmd
    .description('Generate/refresh docs/dev/CONTEXT_PACK.md')
    .alias('ctx')
    .option('--out <path>', 'Path to write context pack (if omitted, prints to stdout)')
    .option('--force', 'Overwrite existing file')
    .option('--max-tokens <n>', 'Soft max tokens (not enforced in v1)')
    .action((options, command) => {
      const outOpt = options.out as string | undefined;
      const force = Boolean(options.force);
      const content = buildTemplate();

      if (!outOpt) {
        // Print to stdout by default
        logStdout(content);
        return;
      }

      const out = resolve(outOpt);
      if (!force && existsSync(out)) {
        throw new CliError(`File already exists at ${out}. Use --force to overwrite`, 2);
      }

      ensureParent(out);
      writeFileSync(out, content, { encoding: 'utf8' });
      logStdout(`Wrote context pack to ${out}`);
    });

  return cmd;
}
