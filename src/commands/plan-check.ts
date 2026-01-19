import { Command } from 'commander';
import { logStdout, emitJson } from '../lib/io.js';
import * as bd from '../lib/bd.js';
import { analyzeIssues, getFindings } from '../lib/planCheck.js';
import { renderIssuesTable, renderGenericTable } from '../lib/table.js';
import { computeWorkflowStage, stageCode } from '../lib/stage.js';
import { CliError } from '../types.js';
import { renderIssueTitle } from '../lib/issueTitle.js';

export function createPlanCheckCommand() {
  const cmd = new Command('doctor');
  cmd
    .description('Validate beads plan integrity (interactive-only). By default only open or in_progress issues are scanned; use --include-closed to include closed issues.')
    .option('--type <kind>', 'Filter to a specific problem type: intake, dependency, cycles, orphans, missing-stage')
    .option('--include-closed', 'Include closed issues in the scan')
    .option('--json', 'Emit JSON (reserved)')
    .option('--verbose', 'Emit debug logs to stderr')
    .action((options, command) => {
      const verbose = Boolean(options.verbose ?? command.parent?.getOptionValue('verbose'));
      const includeClosed = Boolean(options.includeClosed ?? command.parent?.getOptionValue('includeClosed'));
      const typeOpt = typeof options.type === 'string' ? String(options.type).toLowerCase() : undefined;
      const jsonMode = Boolean(options.json ?? command.parent?.getOptionValue('json'));

      const normalize = (t?: string) => {
        if (!t) return undefined;
        const s = String(t).toLowerCase();
        if (['intake', 'dependency', 'dependencies'].includes(s)) return 'intake';
        if (['dependency', 'dependencies', 'dep'].includes(s)) return 'dependency';
        if (['cycle', 'cycles'].includes(s)) return 'cycles';
        if (['orphan', 'orphans'].includes(s)) return 'orphans';
        if (['missing-stage', 'missingstage', 'no-stage', 'nostage', 'stage-missing', 'missingstage', 'stage', 'stages'].includes(s)) return 'missingStage';
        return undefined;
      };

      const reqType = normalize(typeOpt);
      if (typeOpt && !reqType) {
        throw new CliError(`Unknown type: ${typeOpt}. Valid types: intake, dependency, cycles, orphans, missing-stage`, 2);
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

        // Filter by status unless includeClosed is true
        if (!includeClosed) {
          issues = issues.filter((it: any) => {
            const st = (it.status || '').toString().toLowerCase();
            return st === 'open' || st === 'in_progress' || st === 'in-progress' || st === 'in progress';
          });
        }
      } catch (e) {
        logStdout('Failed to load beads issues: ' + (e instanceof Error ? e.message : String(e)));
        return;
      }

  // Compute findings once
  const findingsAll = getFindings(issues);

  // If jsonMode requested, emit only JSON and skip human tables
      if (jsonMode) {
        if (!reqType) {
          emitJson({ intake: findingsAll.intake, dependency: findingsAll.dependency, cycles: findingsAll.cycles, orphans: findingsAll.orphans, missingStage: findingsAll.missingStage });
        } else {
          const out: any = {};
          out[reqType] = (findingsAll as any)[reqType];
          emitJson(out);
        }
        return;
      }

      // Interactive human-friendly rendering (unchanged behavior)
      if (!reqType) {
        // Render grouped tables for all categories (human-friendly)
        const headerAll = '# wf doctor — Plan Validator\n\nThe validator found the following items. These are informational; no fixes were applied.\n\n';

        const anyFound = findingsAll.intake.length || findingsAll.dependency.length || findingsAll.cycles.length || findingsAll.orphans.length || findingsAll.missingStage.length;
        if (!anyFound) {
          // No issues — reuse the existing markdown message
          const md = analyzeIssues(issues);
          logStdout(md);
        } else {
          logStdout(headerAll);

          // Intake
          if (findingsAll.intake.length) {
            logStdout('## Intake completeness\n');
            const rows = findingsAll.intake.map((it) => {
              const orig = issues.find((x: any) => x.id === it.id) || {};
              const stage = String((computeWorkflowStage(orig.labels).stage) ?? 'unknown');
              const title = renderIssueTitle(orig as any, 60);
              return { id: it.id, stage: stageCode(stage as any), title, missing: it.missing.join(', ') };
            });
            const table = renderGenericTable({
              columns: [
                { key: 'id', header: 'ID', minWidth: 2 },
                { key: 'stage', header: 'Stage', minWidth: 3, maxWidth: 12 },
                { key: 'title', header: 'Type / Status / Title', minWidth: 10, maxWidth: 60 },
                { key: 'missing', header: 'Missing headings', minWidth: 10, maxWidth: 40, droppable: true },
              ],
              rows,
              sep: '  ',
            });
            logStdout(table + '\n');
          }

          // Dependency
          if (findingsAll.dependency.length) {
            logStdout('## Dependency issues\n');
            const rows = findingsAll.dependency.map((d) => {
              const orig = issues.find((x: any) => x.id === d.id) || {};
              const stage = String((computeWorkflowStage(orig.labels).stage) ?? 'unknown');
              const title = renderIssueTitle(orig as any, 60);
              return { id: d.id, stage: stageCode(stage as any), title, ref: d.ref };
            });
            const table = renderGenericTable({
              columns: [
                { key: 'id', header: 'ID', minWidth: 2 },
                { key: 'stage', header: 'Stage', minWidth: 3, maxWidth: 12 },
                { key: 'title', header: 'Type / Status / Title', minWidth: 10, maxWidth: 60 },
                { key: 'ref', header: 'Missing reference', minWidth: 10, maxWidth: 40 },
              ],
              rows,
              sep: '  ',
            });
            logStdout(table + '\n');
          }

          // Cycles
          if (findingsAll.cycles.length) {
            logStdout('## Cycles\n');
            const rows = findingsAll.cycles.map((c, idx) => ({ cycle: String(idx + 1), path: c.join(' -> ') }));
            const table = renderGenericTable({
              columns: [
                { key: 'cycle', header: 'Cycle #', minWidth: 3 },
                { key: 'path', header: 'Path', minWidth: 10, maxWidth: 100 },
              ],
              rows,
              sep: '  ',
            });
            logStdout(table + '\n');
          }

          // Orphans
          if (findingsAll.orphans.length) {
            logStdout('## Orphans (leaf tasks)\n');
            const rows = findingsAll.orphans.map((o) => {
              const orig = issues.find((x: any) => x.id === o.id) || {};
              const stage = String((computeWorkflowStage(orig.labels).stage) ?? 'unknown');
              const title = renderIssueTitle(orig as any, 60);
              return { id: o.id, stage: stageCode(stage as any), title };
            });
            const table = renderGenericTable({
              columns: [
                { key: 'id', header: 'ID', minWidth: 2 },
                { key: 'stage', header: 'Stage', minWidth: 3, maxWidth: 12 },
                { key: 'title', header: 'Type / Status / Title', minWidth: 10, maxWidth: 60 },
              ],
              rows,
              sep: '  ',
            });
            logStdout(table + '\n');
          }

          // Missing stage
          if (findingsAll.missingStage.length) {
            logStdout('## Missing stage labels\n');
            const rows = findingsAll.missingStage.map((m) => {
              const orig = issues.find((x: any) => x.id === m.id) || {};
              const title = renderIssueTitle(orig as any, 60);
              return { id: m.id, title };
            });
            const table = renderGenericTable({
              columns: [
                { key: 'id', header: 'ID', minWidth: 2 },
                { key: 'title', header: 'Type / Status / Title', minWidth: 10, maxWidth: 80 },
              ],
              rows,
              sep: '  ',
            });
            logStdout(table + '\n');
          }
        }
      } else {
        // render only requested section
        const findings = getFindings(issues);
        const header = '# wf doctor — Plan Validator\n\n';

        if (reqType === 'intake') {
          logStdout(header + '## Intake completeness\n\n');
          if (findings.intake.length === 0) {
            logStdout('No intake issues found.');
          } else {
            const rows = findings.intake.map((it) => {
              const orig = issues.find((x: any) => x.id === it.id) || {};
              const stage = String((computeWorkflowStage(orig.labels).stage) ?? 'unknown');
              const title = renderIssueTitle(orig as any, 60);
              return { id: it.id, stage: stageCode(stage as any), title, missing: it.missing.join(', ') };
            });
            const table = renderGenericTable({
              columns: [
                { key: 'id', header: 'ID', minWidth: 2 },
                { key: 'stage', header: 'Stage', minWidth: 3, maxWidth: 12 },
                { key: 'title', header: 'Type / Status / Title', minWidth: 10, maxWidth: 60 },
                { key: 'missing', header: 'Missing headings', minWidth: 10, maxWidth: 40, droppable: true },
              ],
              rows,
              sep: '  ',
            });
            logStdout(table);
          }
        } else if (reqType === 'dependency') {
          logStdout(header + '## Dependency issues\n\n');
          if (findings.dependency.length === 0) {
            logStdout('No dependency issues found.');
          } else {
            const rows = findings.dependency.map((d) => {
              const orig = issues.find((x: any) => x.id === d.id) || {};
              const stage = String((computeWorkflowStage(orig.labels).stage) ?? 'unknown');
              const title = renderIssueTitle(orig as any, 60);
              return { id: d.id, stage, title, ref: d.ref };
            });
            const table = renderGenericTable({
              columns: [
                { key: 'id', header: 'ID', minWidth: 2 },
                { key: 'stage', header: 'Stage', minWidth: 3, maxWidth: 12 },
                { key: 'title', header: 'Type / Status / Title', minWidth: 10, maxWidth: 60 },
                { key: 'ref', header: 'Missing reference', minWidth: 10, maxWidth: 40 },
              ],
              rows,
              sep: '  ',
            });
            logStdout(table);
          }
        } else if (reqType === 'cycles') {
          logStdout(header + '## Cycles\n\n');
          if (findings.cycles.length === 0) {
            logStdout('No cycles found.');
          } else {
            const rows = findings.cycles.map((c, idx) => ({ cycle: String(idx + 1), path: c.join(' -> ') }));
            const table = renderGenericTable({
              columns: [
                { key: 'cycle', header: 'Cycle #', minWidth: 3 },
                { key: 'path', header: 'Path', minWidth: 10, maxWidth: 100 },
              ],
              rows,
              sep: '  ',
            });
            logStdout(table);
          }
        } else if (reqType === 'orphans') {
          logStdout(header + '## Orphans (leaf tasks)\n\n');
          if (findings.orphans.length === 0) {
            logStdout('No orphans found.');
          } else {
            const rows = findings.orphans.map((o) => {
              const orig = issues.find((x: any) => x.id === o.id) || {};
              const stage = String((computeWorkflowStage(orig.labels).stage) ?? 'unknown');
              const title = renderIssueTitle(orig as any, 60);
              return { id: o.id, stage, title };
            });
            const table = renderGenericTable({
              columns: [
                { key: 'id', header: 'ID', minWidth: 2 },
                { key: 'stage', header: 'Stage', minWidth: 3, maxWidth: 12 },
                { key: 'title', header: 'Type / Status / Title', minWidth: 10, maxWidth: 60 },
              ],
              rows,
              sep: '  ',
            });
            logStdout(table);
          }
        } else if (reqType === 'missingStage') {
          logStdout(header + '## Missing stage labels\n\n');
          if (findings.missingStage.length === 0) {
            logStdout('No issues missing stage labels.');
          } else {
            const rows = findings.missingStage.map((m) => {
              const orig = issues.find((x: any) => x.id === m.id) || {};
              const title = renderIssueTitle(orig as any, 60);
              return { id: m.id, title };
            });
            const table = renderGenericTable({
              columns: [
                { key: 'id', header: 'ID', minWidth: 2 },
                { key: 'title', header: 'Type / Status / Title', minWidth: 10, maxWidth: 80 },
              ],
              rows,
              sep: '  ',
            });
            logStdout(table);
          }
        }
      }

    });

  return cmd;
}
