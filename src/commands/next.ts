import { readFileSync } from 'fs';
import { resolve } from 'path';
import { spawnSync } from 'child_process';
import { Command } from 'commander';
import { CliError } from '../types.js';
import { emitJson, logStdout } from '../lib/io.js';
import { renderIssueTitle } from '../lib/issueTitle.js';
import { renderIssuesTable } from '../lib/table.js';
import { copyToClipboard } from '../lib/clipboard.js';
import Fuse from 'fuse.js';

const ANSI = {
  blue: '\u001b[34m',
  red: '\u001b[31m',
  reset: '\u001b[0m',
} as const;

function isColorEnabled(): boolean {
  if (!process.stdout.isTTY) return false;
  if (process.env.NO_COLOR) return false;
  if (process.env.WAIF_NO_COLOR) return false;
  return true;
}

function heading(text: string): string {
  const line = `# ${text}`;
  if (!isColorEnabled()) return line;
  return `${ANSI.blue}${line}${ANSI.reset}`;
}

function issuesTable(issues: Issue[]): string {
  return renderIssuesTable(issues, {
    color: {
      enabled: isColorEnabled(),
      blockedRow: ANSI.red,
      reset: ANSI.reset,
    },
  });
}

interface Issue {
  id: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: number;
  created_at?: string;
  assignee?: string;
  dependency_count?: number;
  dependent_count?: number;
  dependencies?: Array<{ type?: string; depends_on_id?: string }>;
  [key: string]: unknown;
}

type BvPriorityEntry = { id: string; score?: number; rank?: number; rationale?: string };

type IssuesSource = 'bd' | 'jsonl' | 'env';
type BvSource = 'bv' | 'env' | 'none';

type LoadResult = { issues: Issue[]; source: IssuesSource };
type BvResult = { scores: Map<string, BvPriorityEntry>; source: BvSource };

function runSpawn(cmd: string, args: string[], timeout = 30000): { stdout: string } {
  const res = spawnSync(cmd, args, { encoding: 'utf8', timeout });
  if (res.error) {
    const err: any = new Error(`${cmd} spawn error: ${res.error.message}`);
    (err as any).original = res.error;
    throw err;
  }
  if (res.status !== 0) {
    const stderr = res.stderr ? String(res.stderr) : '';
    const stdout = res.stdout ? String(res.stdout) : '';
    const err: any = new Error(`${cmd} exited ${res.status}: ${stderr || stdout}`);
    err.exitCode = res.status;
    err.stdout = stdout;
    err.stderr = stderr;
    throw err;
  }
  return { stdout: res.stdout ?? '' };
}

function runBd(args: string[], timeout = 30000): string {
  return runSpawn('bd', args, timeout).stdout;
}


function runBv(args: string[], timeout = 30000): string {
  return runSpawn('bv', args, timeout).stdout;
}

function isCliAvailable(cmd: string): boolean {
  const res = spawnSync(cmd, ['--version'], { encoding: 'utf8', timeout: 2000 });
  if (res.error) return false;
  if (typeof res.status === 'number' && res.status !== 0) return false;
  return true;
}

function parseIssuesFromJsonl(path: string, verbose: boolean): Issue[] {
  const resolved = resolve(path);
  if (verbose) process.stderr.write(`[debug] loading issues from ${resolved}\n`);
  const raw = readFileSync(resolved, 'utf8');
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as Issue;
      } catch (e) {
        if (verbose) process.stderr.write(`[debug] skipping unparsable line: ${line}\n`);
        return null;
      }
    })
    .filter((v): v is Issue => Boolean(v));
}

function loadIssues(verbose: boolean): LoadResult {
  const envPath = process.env.WAIF_ISSUES_PATH;
  if (envPath) {
    return { issues: parseIssuesFromJsonl(envPath, verbose), source: 'env' };
  }

  if (isCliAvailable('bd')) {
    try {
      const out = runBd(['ready', '--json']);
      const parsed = JSON.parse(out);
      if (Array.isArray(parsed)) {
        return { issues: parsed as Issue[], source: 'bd' };
      }
    } catch (e) {
      if (verbose) process.stderr.write(`[debug] bd ready failed: ${(e as Error).message}\n`);
    }
  }

  // fallback to jsonl file
  return { issues: parseIssuesFromJsonl('.beads/issues.jsonl', verbose), source: 'jsonl' };
}

function loadBvScores(verbose: boolean): BvResult {
  const envJson = process.env.WAIF_BV_PRIORITY_JSON;
  if (envJson) {
    try {
      const parsed = JSON.parse(envJson);
      const scores = Array.isArray(parsed)
        ? (parsed as BvPriorityEntry[])
        : Array.isArray(parsed?.items)
          ? (parsed.items as BvPriorityEntry[])
          : [];
      const map = new Map(scores.filter((s) => s.id).map((s) => [s.id, s] as const));
      return { scores: map, source: 'env' };
    } catch (e) {
      if (verbose) process.stderr.write(`[debug] failed to parse WAIF_BV_PRIORITY_JSON: ${(e as Error).message}\n`);
    }
  }

  if (isCliAvailable('bv')) {
    try {
      const out = runBv(['--robot-priority', '--json']);
      const parsed = JSON.parse(out);
      const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
      const map = new Map((items as BvPriorityEntry[]).filter((s) => s.id).map((s) => [s.id, s] as const));
      return { scores: map, source: 'bv' };
    } catch (e) {
      if (verbose) process.stderr.write(`[debug] bv priority unavailable: ${(e as Error).message}\n`);
    }
  }

  return { scores: new Map(), source: 'none' };
}

function isBlocked(issue: Issue): boolean {
  if (!issue.dependencies || !Array.isArray(issue.dependencies)) return false;
  return issue.dependencies.some((d) => (d?.type || '').toLowerCase() === 'blocks');
}

function eligible(issue: Issue): boolean {
  const status = (issue.status || '').toLowerCase();
  if (!(status === 'open' || status === 'in_progress')) return false;
  return !isBlocked(issue);
}

function computeScore(issue: Issue, bv: BvResult): { score: number; rationale: string; metadata: Record<string, unknown> } {
  const bvEntry = bv.scores.get(issue.id);
  if (bvEntry && typeof bvEntry.score === 'number') {
    return {
      score: bvEntry.score,
      rationale: bvEntry.rationale || 'bv priority score',
      metadata: { source: bv.source, rank: bvEntry.rank ?? null },
    };
  }

  const priority = typeof issue.priority === 'number' ? issue.priority : 2;
  const createdAt = issue.created_at ? Date.parse(issue.created_at) : Number.MAX_SAFE_INTEGER;
  const priorityScore = (5 - priority) * 1_000_000;
  const recencyScore = createdAt === Number.MAX_SAFE_INTEGER ? 0 : -createdAt / 1000;
  const score = priorityScore + recencyScore;
  const rationaleParts = [`priority ${priority}`];
  if (createdAt !== Number.MAX_SAFE_INTEGER) rationaleParts.push('earlier created');
  return {
    score,
    rationale: rationaleParts.join(' + '),
    metadata: { priority, created_at: issue.created_at ?? null, tie_break: 'created_at' },
  };
}

function selectTopN(issues: Issue[], bv: BvResult, n: number, verbose: boolean) {
  const candidates = issues.filter(eligible);
  if (!candidates.length) {
    throw new CliError('No eligible issues found (need open, unblocked issues)', 1);
  }
  const scored = candidates.map((issue) => {
    const { score, rationale, metadata } = computeScore(issue, bv);
    return { issue, score, rationale, metadata };
  });
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.issue.id.localeCompare(b.issue.id);
  });
  if (verbose) {
    scored.slice(0, Math.min(5, n)).forEach((s, idx) => {
      process.stderr.write(`[debug] rank ${idx + 1}: ${s.issue.id} score=${s.score} (${s.rationale})\n`);
    });
  }
  return scored.slice(0, n);
}

export function createNextCommand() {
  const cmd = new Command('next');
  cmd
    .description('Return the single best open, unblocked issue to work on now (copies issue id to clipboard)')
    .argument('[search]', 'Optional search string to bias selection')
    .option('--json', 'Emit JSON output')
    .option('--verbose', 'Emit debug logs to stderr')
    .option('--no-clipboard', 'Disable copying the recommended issue id to clipboard')
    .option('-n, --number <n>', 'Number of suggestions to return (default 1)')
    .action((search: string | undefined, options, command) => {
      const jsonOutput = Boolean(options.json ?? command.parent?.getOptionValue('json'));
      const verbose = Boolean(options.verbose ?? command.parent?.getOptionValue('verbose'));
      const numberRaw = options.number ?? command.parent?.getOptionValue('number');
      const n = numberRaw ? Math.max(1, parseInt(String(numberRaw), 10) || 1) : 1;

      const { issues, source } = loadIssues(verbose);
      const bv = loadBvScores(verbose);
      const selected = selectTopN(issues, bv, n, verbose);

      // If search provided, re-rank selected candidates by fuzzy match
      let finalSelection = selected;
      let searchApplied = false;
      let searchMatched = false;
      if (search && search.trim().length > 0) {
        searchApplied = true;
        const topN = n || 10;
        const candidates = selectTopN(issues, bv, topN, verbose);
        const items = candidates.map((c) => c.issue);

        const titleFuse = new Fuse(items, { keys: ['title'], includeScore: true, threshold: 0.4 });
        const descFuse = new Fuse(items, { keys: ['description'], includeScore: true, threshold: 0.6 });

        const titleResults = titleFuse.search(search);
        const descResults = descFuse.search(search);

        const titleMap = new Map(titleResults.map((r) => [(r.item as Issue).id, 1 - (typeof r.score === 'number' ? r.score : 1)] as const));
        const descMap = new Map(descResults.map((r) => [(r.item as Issue).id, 1 - (typeof r.score === 'number' ? r.score : 1)] as const));

        const titleBoost = 0.2;
        const descBoost = 0.1;

        type Ranked = { issue: Issue; originalScore: number; rationale: string; metadata: Record<string, unknown>; titleMatch: number; descMatch: number; adjustedScore: number };

        const ranked: Ranked[] = candidates.map((c) => {
          const originalScore = c.score ?? 0;
          const titleMatch = titleMap.get(c.issue.id) ?? 0;
          const descMatch = descMap.get(c.issue.id) ?? 0;
          // Use absolute magnitude so positive boosts improve (less-negative) bv scores
          const adjustedScore = originalScore + Math.abs(originalScore) * (titleBoost * titleMatch + descBoost * descMatch);
          return { issue: c.issue, originalScore, rationale: c.rationale, metadata: c.metadata, titleMatch, descMatch, adjustedScore };
        });

        const anyMatch = ranked.some((r) => r.titleMatch > 0 || r.descMatch > 0);
        if (!anyMatch) {
          // no-match fallback: keep original selection (selected) and indicate no-match
          finalSelection = selected;
          searchMatched = false;
        } else {
          ranked.sort((a, b) => {
            if (b.adjustedScore !== a.adjustedScore) return b.adjustedScore - a.adjustedScore;
            if (b.originalScore !== a.originalScore) return b.originalScore - a.originalScore;
            return a.issue.id.localeCompare(b.issue.id);
          });
          finalSelection = ranked.map((r) => ({ issue: r.issue, score: r.adjustedScore, rationale: r.rationale, metadata: r.metadata }));
          searchMatched = true;
        }
      }

      // Copy only the first recommended id to clipboard when enabled
      const clipboardEnabled = Boolean(options.clipboard ?? true);
      if (clipboardEnabled && finalSelection.length > 0) {
        const clipboardResult = copyToClipboard(finalSelection[0].issue.id);
        if (!clipboardResult.ok && verbose) {
          process.stderr.write(`[debug] clipboard copy failed: ${clipboardResult.error}\n`);
        }
      }

      if (jsonOutput) {
        const payload = finalSelection.map((s, idx) => ({ ...s.issue, waif: { score: s.score, rationale: s.rationale, rank: idx + 1, metadata: { ...s.metadata, issuesSource: source, bvSource: bv.source } } }));
        emitJson(payload.length === 1 ? payload[0] : payload);
        return;
      }

      // Human output: render a table with up to n rows, then show details for the first
      const recommendedIssues = finalSelection.map((s) => s.issue);
      // When search applied and matched, show only the chosen first item; otherwise show full selection
      const displayIssues = (searchApplied && searchMatched && finalSelection.length > 0)
        ? [finalSelection[0].issue]
        : recommendedIssues;

      if (searchApplied && finalSelection === selected) {
        // No-match: print the message before the table and leave a blank line after it
        logStdout('Search: no-match; using default recommendation');
        logStdout('');
        logStdout(issuesTable(recommendedIssues));
        logStdout('');
      } else {
        logStdout(issuesTable(displayIssues));
        logStdout('');

        if (searchApplied) {
          logStdout(`# Search applied: "${search}"`);
          logStdout('');
        }
      }

      logStdout(heading('Details'));
      logStdout('');
      if (finalSelection.length > 0) {
        const top = finalSelection[0];
        if (isCliAvailable('bd')) {
          try {
            const shown = runBd(['show', top.issue.id]);
            logStdout(shown.trim());
            return;
          } catch (e) {
            if (verbose) process.stderr.write(`[debug] bd show failed: ${(e as Error).message}\n`);
          }
        }

        const rendered = renderIssueTitle(top.issue);
        logStdout(`${top.issue.id}: ${rendered}`);
      }

    });

  return cmd;
}
