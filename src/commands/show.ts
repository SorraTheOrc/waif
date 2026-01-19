import { Command } from 'commander';
import { CliError } from '../types.js';
import { emitJson, logStdout } from '../lib/io.js';
import { computeWorkflowStage } from '../lib/stage.js';
import { showIssue } from '../lib/bd.js';
import { renderIssuesTable } from '../lib/table.js';
import {
  renderBlockersSection,
  renderChildrenSection,
  type IssueWithRelations,
} from '../lib/relations.js';

interface Issue extends IssueWithRelations {
  id: string;
}

export function createShowCommand() {
  const cmd = new Command('show');
  cmd
    .description('Show a beads issue with blockers and children')
    .argument('<id>', 'Beads issue id')
    .option('--json', 'Emit JSON output')
    .option('--verbose', 'Emit debug logs to stderr')
    .action((id: string, options, command) => {
      const jsonOutput = Boolean(options.json ?? command.parent?.getOptionValue('json'));
      if (!id) {
        throw new CliError('issue id is required', 2);
      }

      let issue: Issue;
      try {
        const out = showIssue(id);
        issue = Array.isArray(out) ? (out[0] as Issue) : (out as Issue);
      } catch (e) {
        const err = e as any;
        const rawMsg = err?.stderr || err?.message || String(err);
        const exitCode = typeof err?.exitCode === 'number' ? err.exitCode : 1;
        if (rawMsg && /no issue found/i.test(rawMsg)) {
          throw new CliError(`Issue ${id} not found`, exitCode);
        }
        throw new CliError(`bd show failed for ${id}: ${rawMsg}`, exitCode);
      }

      const labels = Array.isArray((issue as any).labels) ? ((issue as any).labels as string[]) : undefined;
      const stageInfo = computeWorkflowStage(labels);

      if (jsonOutput) {
        emitJson({ ...issue, stage: stageInfo.stage });
        return;
      }

      const main = renderIssuesTable([{ ...issue, labels }], { sort: 'none' });

      logStdout(main);

      // Emit a one-line warning if multiple stage:* labels are present
      if (stageInfo.hasMultiple) {
        logStdout(`Warning: multiple stage:* labels present — selected '${stageInfo.stage}' per maturity order.`);
      }

      const blockersSection = renderBlockersSection(issue);
      if (blockersSection) {
        logStdout(blockersSection);
      }

      // Hydrate children if their objects lack labels so their stage displays correctly
      let childrenSection: string | undefined = '';
      const related = Array.isArray(issue.children) ? issue.children : Array.isArray(issue.dependents) ? issue.dependents : [];
      if (related.length) {
        const hydrated = [] as any[];
        for (const rel of related) {
          const cid = (rel && (rel.id ?? (rel as any).depends_on_id)) as string | undefined;
          // keep object if no id
          if (!cid) {
            hydrated.push(rel);
            continue;
          }

          const hasLabels = Array.isArray((rel as any).labels) && (rel as any).labels.length > 0;
          if (hasLabels) {
            hydrated.push(rel);
            continue;
          }

          try {
            const out = showIssue(cid);
            const child = Array.isArray(out) ? out[0] : out;
            hydrated.push(child ?? rel);
          } catch (e) {
            // if bd show failed for child, fall back to original rel
            hydrated.push(rel);
          }
        }

        const hydratedIssue = { ...issue, children: hydrated, dependents: hydrated } as Issue;
        childrenSection = renderChildrenSection(hydratedIssue);
      } else {
        childrenSection = renderChildrenSection(issue);
      }

      if (childrenSection) {
        logStdout(childrenSection);
      }
    });

  return cmd;
}
