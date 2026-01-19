import { Command } from 'commander';
import { logStdout, emitJson } from '../lib/io.js';
import * as bd from '../lib/bd.js';
import { analyzeIssues, getFindings } from '../lib/planCheck.js';

export function createPlanCheckCommand() {
  const cmd = new Command('doctor');
  cmd
    .description('Validate beads plan integrity (interactive-only)')
    .option('--type <kind>', 'Filter to a specific problem type: intake, dependency, cycles, orphans')
    .option('--json', 'Emit JSON (reserved)')
    .option('--verbose', 'Emit debug logs to stderr')
    .action((options, command) => {
      const verbose = Boolean(options.verbose ?? command.parent?.getOptionValue('verbose'));
      const typeOpt = typeof options.type === 'string' ? String(options.type).toLowerCase() : undefined;

      const normalize = (t?: string) => {
        if (!t) return undefined;
        if (['intake', 'dependency', 'dependencies'].includes(t)) return 'intake';
        if (['dependency', 'dependencies', 'dep'].includes(t)) return 'dependency';
        if (['cycle', 'cycles'].includes(t)) return 'cycles';
        if (['orphan', 'orphans'].includes(t)) return 'orphans';
        return undefined;
      };

      const reqType = normalize(typeOpt);
      if (typeOpt && !reqType) {
        // lazy import CliError to avoid unused import when not thrown
        const { CliError } = require('../types.js');
        throw new CliError(`Unknown type: ${typeOpt}. Valid types: intake, dependency, cycles, orphans`, 2);
      }

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
      if (!reqType) {
        logStdout(md);
      } else {
        // render only requested section
        const findings = getFindings(issues);
        const header = '# wf doctor — Plan Validator\n\n';
        if (reqType === 'intake') {
          logStdout(header + '## Intake completeness\n');
          if (findings.intake.length === 0) {
            logStdout('No intake issues found.');
          } else {
            for (const it of findings.intake) logStdout(`- ${it.id} ${it.title ? `(${it.title}) ` : ''}missing headings: ${it.missing.join(', ')}`);
          }
        } else if (reqType === 'dependency') {
          logStdout(header + '## Dependency issues\n');
          if (findings.dependency.length === 0) {
            logStdout('No dependency issues found.');
          } else {
            for (const d of findings.dependency) logStdout(`- ${d.id} references missing issue ${d.ref}`);
          }
        } else if (reqType === 'cycles') {
          logStdout(header + '## Cycles\n');
          if (findings.cycles.length === 0) {
            logStdout('No cycles found.');
          } else {
            for (const c of findings.cycles) logStdout(`- ${c.join(' -> ')}`);
          }
        } else if (reqType === 'orphans') {
          logStdout(header + '## Orphans (leaf tasks)\n');
          if (findings.orphans.length === 0) {
            logStdout('No orphans found.');
          } else {
            for (const o of findings.orphans) logStdout(`- ${o.id} ${o.title ? `(${o.title}) ` : ''}is a leaf task with no parent or deps`);
          }
        }
      }

      // reserve --json for automation: emit structured JSON findings when requested
      const jsonMode = Boolean(options.json ?? command.parent?.getOptionValue('json'));
      if (jsonMode) {
        const findings = getFindings(issues);
        if (!reqType) {
          emitJson({ intake: findings.intake, dependency: findings.dependency, cycles: findings.cycles, orphans: findings.orphans });
        } else {
          const out: any = {};
          out[reqType] = (findings as any)[reqType];
          emitJson(out);
        }
      }
    });

  return cmd;
}
