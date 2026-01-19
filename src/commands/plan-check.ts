import { Command } from 'commander';
import { logStdout, emitJson } from '../lib/io.js';
import * as bd from '../lib/bd.js';
import { analyzeIssues, getFindings } from '../lib/planCheck.js';

export function createPlanCheckCommand() {
  const cmd = new Command('doctor');
  cmd
    .description('Validate beads plan integrity (interactive-only)')
    .option('--json', 'Emit JSON (reserved)')
    .option('--verbose', 'Emit debug logs to stderr')
    .action((options, command) => {
      const verbose = Boolean(options.verbose ?? command.parent?.getOptionValue('verbose'));

      let issues: any[] = [];
      // Prefer bd CLI
      try {
        if (bd.isBdAvailable()) {
          const out = (bd as any).runBdSync(['list', '--json']);
          issues = JSON.parse(out);
        } else {
          // fallback: read .beads/issues.jsonl
          const raw = require('fs').readFileSync('.beads/issues.jsonl', 'utf8') || '';
          issues = raw
            .split(/\r?\n/)
            .filter(Boolean)
            .map((l: string) => JSON.parse(l));
        }
      } catch (e) {
        logStdout('Failed to load beads issues: ' + (e instanceof Error ? e.message : String(e)));
        return;
      }

      const md = analyzeIssues(issues);
      // default interactive human output
      logStdout(md);
      // reserve --json for automation: emit structured JSON findings when requested
      const jsonMode = Boolean(options.json ?? command.parent?.getOptionValue('json'));
      if (jsonMode) {
        const findings = getFindings(issues);
        emitJson({ intake: findings.intake, dependency: findings.dependency, cycles: findings.cycles, orphans: findings.orphans });
      }
    });

  return cmd;
}
