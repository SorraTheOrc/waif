#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { createNextCommand } from './commands/next.js';
import { createRecentCommand } from './commands/recent.js';
import { createInProgressCommand } from './commands/inProgress.js';
import { createStartWorkCommand } from './commands/startWork.js';
import { createOodaCommand } from './commands/ooda.js';
import { createShowCommand } from './commands/show.js';
import { createPlanCheckCommand } from './commands/plan-check.js';
import { createActionCommand } from './commands/action.js';
import { handleError, logStdout } from './lib/io.js';
import { getCliVersion } from './lib/version.js';

// Env compatibility shim: make WF_* and WAIF_* interchangeable at runtime.
// This copies values from WF_<SUFFIX> to WAIF_<SUFFIX> when the latter is undefined,
// and vice-versa. Keep minimal and early so the rest of the app can rely on either.
for (const [k, v] of Object.entries(process.env)) {
  if (!v) continue;
  if (k.startsWith('WF_')) {
    const rest = k.slice(3);
    const waifKey = `WAIF_${rest}`;
    if (process.env[waifKey] === undefined) process.env[waifKey] = v;
  } else if (k.startsWith('WAIF_')) {
    const rest = k.slice(5);
    const wfKey = `WF_${rest}`;
    if (process.env[wfKey] === undefined) process.env[wfKey] = v;
  }
}

import { normalizeSlashCommandArgv } from './lib/argv.js';

export async function run(argv = process.argv.slice(2)): Promise<number> {
  const { argv: normalizedArgv } = normalizeSlashCommandArgv(argv);

  // Handle version fast-path before commander parses or commands execute.
  if (normalizedArgv[0] === '--version' || normalizedArgv[0] === '-v') {
    logStdout(getCliVersion());
    return 0;
  }

  const program = new Command();
  program
    .name('wf')
    .description('WAIF CLI scaffold (Workflow Alien Intelligence)')
    .option('--json', 'Emit JSON output')
    .option('--verbose', 'Emit debug logs to stderr')
    .showHelpAfterError();

  program.addCommand(createNextCommand());
  program.addCommand(createRecentCommand());
  const inProgress = createInProgressCommand();
  inProgress.alias('in_progress');
  program.addCommand(inProgress);
  program.addCommand(createStartWorkCommand());
  program.addCommand(createOodaCommand());
  program.addCommand(createShowCommand());
  program.addCommand(createPlanCheckCommand());
  program.addCommand(createActionCommand());

  try {
    await program.parseAsync(normalizedArgv, { from: 'user' });
    return 0;
  } catch (err) {
    const opts = program.opts<{ json?: boolean }>();
    return handleError(err, Boolean(opts.json));
  }
}

// Run if invoked as main script (handles both direct and symlinked execution)
const scriptPath = realpathSync(process.argv[1]);
const modulePath = fileURLToPath(import.meta.url);

if (scriptPath === modulePath) {
  run()
    .then((code) => {
      process.exit(code);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
