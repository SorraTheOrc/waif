import { readFileSync } from 'fs';
import { resolve } from 'path';
import { spawnSync } from 'child_process';
import { Command } from 'commander';
import { CliError } from '../types.js';
import { emitJson, logStdout } from '../lib/io.js';
import { renderIssueTitle } from '../lib/issueTitle.js';
import { renderIssuesTable } from '../lib/table.js';
import { copyToClipboard } from '../lib/clipboard.js';
import { extractBlockers, extractChildren, type IssueWithRelations } from '../lib/relations.js';
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

interface Issue extends IssueWithRelations {
  id: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: number;
  created_at?: string;
  assignee?: string;
  dependency_count?: number;
  dependent_count?: number;
  dependencies?: Array<{ dependency_type?: string; type?: string; depends_on_id?: string }>;
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

function startStatus(message: string) {
  // Write ephemeral status to stderr with newline so it stays visible.
  // Use stderr to avoid polluting stdout (JSON output).
  if (!process.stderr.isTTY) return false;
  if (process.env.WAIF_NO_STATUS) return false;
  try {
    process.stderr.write(`${message.trim()}\n`);
    return true;
  } catch {
    return false;
  }
}

function clearStatus() {
  if (!process.stderr.isTTY) return false;
  if (process.env.WAIF_NO_STATUS) return false;
  try {
    // Move cursor up one line and clear it
    process.stderr.write('\u001b[1A\u001b[2K');
    return true;
  } catch {
    return false;
  }
}

function maybeSyncBeads(verbose: boolean) {
  const override = process.env.WAIF_BD_SYNC;
  if (override && override.toLowerCase() === '0') return;

  if (!isCliAvailable('bd')) return;

  const printed = startStatus('Syncing beads...');
  try {
    runBd(['sync'], 30_000);
  } catch (e) {
    if (verbose) process.stderr.write(`[debug] bd sync failed (continuing): ${(e as Error).message}\n`);
  } finally {
    if (printed) clearStatus();
  }
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
  return issue.dependencies.some((d) => String(d?.dependency_type ?? d?.type ?? '').toLowerCase() === 'blocks');
}

function isEpicInProgress(issue: Issue): boolean {
  const type = String((issue as any).issue_type ?? '').toLowerCase();
  const status = String(issue.status ?? '').toLowerCase();
  return type === 'epic' && status === 'in_progress';
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
      metadata: { source: bv.source, rank: bvEntry.rank ?? null, selection: 'bv_priority' },
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
    metadata: { priority, created_at: issue.created_at ?? null, tie_break: 'created_at', selection: 'priority_fallback' },
  };
}

type Selection = { issue: Issue; score: number; rationale: string; metadata: Record<string, unknown> };

function hydrateEpicRelations(epic: Issue, verbose: boolean): Issue {
  if ((epic.dependencies && epic.dependencies.length) || (epic.dependents && epic.dependents.length) || (epic.children && epic.children.length)) {
    return epic;
  }

  const envShow = process.env.WAIF_BD_SHOW_JSON;
  if (envShow) {
    try {
      const parsed = JSON.parse(envShow);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const match = list.find((i: any) => i?.id === epic.id);
      if (match) return { ...epic, ...match } as Issue;
    } catch (e) {
      if (verbose) process.stderr.write(`[debug] failed to parse WAIF_BD_SHOW_JSON: ${(e as Error).message}\n`);
    }
  }

  if (!isCliAvailable('bd')) return epic;

  try {
    const out = runBd(['show', epic.id, '--json']);
    const parsed = JSON.parse(out);
    if (parsed && typeof parsed === 'object') {
      return { ...epic, ...(Array.isArray(parsed) ? parsed[0] : parsed) } as Issue;
    }
  } catch (e) {
    if (verbose) process.stderr.write(`[debug] failed to hydrate epic relations: ${(e as Error).message}\n`);
  }
  return epic;
}

type RelatedCandidate = Selection & { relation: 'child' | 'blocker' };

function mapRelatedIssueToSelection(issue: Issue, relation: 'child' | 'blocker', bv: BvResult): RelatedCandidate {
  const { score, rationale, metadata } = computeScore(issue, bv);
  return { issue, score, rationale, metadata: { ...metadata, relation } as Record<string, unknown>, relation };
}

function collectEpicRelated(epic: Issue, assignee: string | undefined, bv: BvResult, verbose: boolean): RelatedCandidate[] {
  const hydrated = hydrateEpicRelations(epic, verbose);
  const children = extractChildren(hydrated).map((c) => ({ issue: c, relation: 'child' as const }));
  const blockers = extractBlockers(hydrated).map((b) => ({ issue: b, relation: 'blocker' as const }));
  const combined = [...children, ...blockers];
  if (!combined.length) return [];

  const dedup = new Map<string, { issue: Issue; relation: 'child' | 'blocker' }>();
  for (const rel of combined) {
    const id = rel.issue.id;
    if (!id) continue;
    if (assignee && (rel.issue.assignee ?? '').trim() !== assignee) continue;
    if (dedup.has(id)) continue;
    dedup.set(id, { issue: rel.issue as Issue, relation: rel.relation });
  }

  const filtered: RelatedCandidate[] = [];
  for (const { issue, relation } of dedup.values()) {
    if (!eligible(issue as Issue)) continue;
    filtered.push(mapRelatedIssueToSelection(issue as Issue, relation, bv));
  }

  return filtered;
}

function pickEpicRecommendation(epic: Issue, assignee: string | undefined, bv: BvResult, verbose: boolean): { recommendation: RelatedCandidate | null; reason?: 'in_progress_child' | 'bv_priority' | 'priority_fallback'; related: RelatedCandidate[] } {
  const related = collectEpicRelated(epic, assignee, bv, verbose);
  if (!related.length) return { recommendation: null, related: [] };

  const inProgressChildren = related.filter((r) => r.relation === 'child' && String(r.issue.status ?? '').toLowerCase() === 'in_progress');
  if (inProgressChildren.length) {
    const sorted = [...inProgressChildren].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const prA = typeof a.issue.priority === 'number' ? a.issue.priority : 99;
      const prB = typeof b.issue.priority === 'number' ? b.issue.priority : 99;
      if (prA !== prB) return prA - prB;
      const ca = a.issue.created_at ? Date.parse(a.issue.created_at) : Number.MAX_SAFE_INTEGER;
      const cb = b.issue.created_at ? Date.parse(b.issue.created_at) : Number.MAX_SAFE_INTEGER;
      if (ca !== cb) return ca - cb;
      return a.issue.id.localeCompare(b.issue.id);
    });
    return { recommendation: sorted[0], reason: 'in_progress_child', related };
  }

  const sorted = [...related].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const prA = typeof a.issue.priority === 'number' ? a.issue.priority : 99;
    const prB = typeof b.issue.priority === 'number' ? b.issue.priority : 99;
    if (prA !== prB) return prA - prB;
    const ca = a.issue.created_at ? Date.parse(a.issue.created_at) : Number.MAX_SAFE_INTEGER;
    const cb = b.issue.created_at ? Date.parse(b.issue.created_at) : Number.MAX_SAFE_INTEGER;
    if (ca !== cb) return ca - cb;
    return a.issue.id.localeCompare(b.issue.id);
  });

  const top = sorted[0];
  const hasBv = (top.metadata?.source ?? top.metadata?.bvSource ?? '') !== undefined && (top.metadata as any).selection === 'bv_priority';
  const reason: 'bv_priority' | 'priority_fallback' = hasBv ? 'bv_priority' : 'priority_fallback';
  return { recommendation: top, reason, related };
}

function selectTopN(issues: Issue[], bv: BvResult, n: number, verbose: boolean): Selection[] {
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
    const priorityA = typeof a.issue.priority === 'number' ? a.issue.priority : 99;
    const priorityB = typeof b.issue.priority === 'number' ? b.issue.priority : 99;
    if (priorityA !== priorityB) return priorityA - priorityB; // lower is higher priority
    const createdA = a.issue.created_at ? Date.parse(a.issue.created_at) : Number.MAX_SAFE_INTEGER;
    const createdB = b.issue.created_at ? Date.parse(b.issue.created_at) : Number.MAX_SAFE_INTEGER;
    if (createdA !== createdB) return createdA - createdB;
    return a.issue.id.localeCompare(b.issue.id);
  });
  if (verbose) {
    scored.slice(0, Math.min(5, n)).forEach((s: { issue: Issue; score: number; rationale: string }, idx: number) => {
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
    .option('-a, --assignee <name>', 'Only consider issues assigned to <name>')
    .action((search: string | undefined, options, command) => {
      const jsonOutput = Boolean(options.json ?? command.parent?.getOptionValue('json'));
      const verbose = Boolean(options.verbose ?? command.parent?.getOptionValue('verbose'));
      const numberRaw = options.number ?? command.parent?.getOptionValue('number');
      const n = numberRaw ? Math.max(1, parseInt(String(numberRaw), 10) || 1) : 1;
      const assignee = typeof options.assignee === 'string' ? options.assignee.trim() : undefined;

      // Keep local bd state in sync before selecting next work.
      maybeSyncBeads(verbose);

      const { issues, source } = loadIssues(verbose);
      const candidateIssues = assignee
        ? issues.filter((issue) => ((issue.assignee ?? '').trim() === assignee) || isEpicInProgress(issue))
        : issues;

      if (assignee && candidateIssues.length === 0) {
        throw new CliError(`No eligible issues found for assignee "${assignee}"`, 1);
      }

      const printedReview = startStatus('Reviewing dependencies...');
      const bv = loadBvScores(verbose);
      const printedSelect = startStatus('Selecting next issue...');
      let selected: Selection[];
      try {
        selected = selectTopN(candidateIssues, bv, n, verbose);
      } finally {
        const clearsNeeded = (printedReview ? 1 : 0) + (printedSelect ? 1 : 0);
        for (let i = 0; i < clearsNeeded; i += 1) {
          clearStatus();
        }
      }

      const epicContext: { epic?: Issue; recommendation?: RelatedCandidate; reason?: string; relation?: 'child' | 'blocker'; related?: RelatedCandidate[] } = {};

      let finalSelection: Selection[] = selected;

      const epicCandidates = candidateIssues.filter(isEpicInProgress);
      let epicFocus: Issue | undefined;
      const topSelected = selected[0]?.issue;
      if (topSelected && isEpicInProgress(topSelected)) {
        epicFocus = topSelected;
      } else if (epicCandidates.length) {
        const topEpic = selectTopN(epicCandidates, bv, 1, verbose)[0];
        epicFocus = topEpic?.issue;
      }

      if (epicFocus) {
        const { recommendation, reason, related } = pickEpicRecommendation(epicFocus, assignee, bv, verbose);
        if (recommendation) {
          epicContext.epic = epicFocus;
          epicContext.recommendation = recommendation;
          epicContext.reason = reason;
          epicContext.relation = recommendation.relation;
          epicContext.related = related;
          finalSelection = [recommendation];
        }
      }

      // If search provided, re-rank selected candidates by fuzzy match
      // Note: if search is provided, we re-evaluate topN against the same filtered candidate set
      // When an in-progress epic triggered epicContext, search is constrained to that epic's related items.
      let searchApplied = false;
      let searchMatched = false;
      if (search && search.trim().length > 0) {
        searchApplied = true;
        const topN = n || 10;
        const baseCandidates = epicContext.recommendation && epicContext.related?.length
          ? epicContext.related
          : selectTopN(candidateIssues, bv, topN, verbose);
        const candidates = baseCandidates.map((c) => ('relation' in c ? c : { ...c, relation: undefined })) as Array<RelatedCandidate | (Selection & { relation?: string })>;
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
          // no-match fallback: keep original selection (selected or epic-focused) and indicate no-match
          searchMatched = false;
        } else {
          ranked.sort((a, b) => {
            if (b.adjustedScore !== a.adjustedScore) return b.adjustedScore - a.adjustedScore;
            if (b.originalScore !== a.originalScore) return b.originalScore - a.originalScore;
            return a.issue.id.localeCompare(b.issue.id);
          });
          finalSelection = ranked.map((r: Ranked) => ({ issue: r.issue, score: r.adjustedScore, rationale: r.rationale, metadata: r.metadata }));
          searchMatched = true;
        }
      }

      // Copy only the first recommended id to clipboard when enabled
      const clipboardEnabled = Boolean(options.clipboard ?? true) && !jsonOutput;
      if (clipboardEnabled && finalSelection.length > 0) {
        const clipboardResult = copyToClipboard(finalSelection[0].issue.id);
        if (!clipboardResult.ok && verbose) {
          process.stderr.write(`[debug] clipboard copy failed: ${clipboardResult.error}\n`);
        }
      }

      if (jsonOutput) {
        const payload = finalSelection.map((s: { issue: Issue; score?: number; rationale?: string; metadata?: Record<string, unknown> }, idx: number) => ({
          ...s.issue,
          waif: {
            score: s.score,
            rationale: s.rationale,
            rank: idx + 1,
            metadata: { ...s.metadata, issuesSource: source, bvSource: bv.source },
            epic_context: epicContext.epic && epicContext.recommendation
              ? {
                  epic_id: epicContext.epic.id,
                  epic_status: epicContext.epic.status,
                  recommended_id: epicContext.recommendation.issue.id,
                  selection_reason: epicContext.reason,
                  relation: epicContext.relation,
                  related_ids: epicContext.related?.map((r) => r.issue.id).filter(Boolean),
                }
              : undefined,
          },
        }));
        emitJson(payload.length === 1 ? payload[0] : payload);
        return;
      }

      // Human output: frontmatter notes shown before the table
      const frontmatter: string[] = [];
      const topIssue = finalSelection[0]?.issue;
      if (topIssue && String(topIssue.status ?? '').toLowerCase() === 'in_progress') {
        frontmatter.push(`Recommended is already in_progress: ${topIssue.id}`);
      }
      if (epicContext.epic && epicContext.recommendation) {
        const relLabel = epicContext.relation === 'blocker' ? 'blocker' : 'child';
        const progressNote = String(epicContext.recommendation.issue.status ?? '').toLowerCase() === 'in_progress'
          ? ' (in_progress — finish started work)'
          : '';
        frontmatter.push(`Epic context: ${epicContext.epic.id} (${epicContext.epic.status ?? ''})`);
        frontmatter.push(`Recommended ${relLabel}: ${epicContext.recommendation.issue.id}${progressNote}`);
      }
      if (frontmatter.length) {
        frontmatter.forEach((line) => logStdout(line));
        logStdout('');
      }

      // Human output: render a table with up to n rows, then show details for the first
      const recommendedIssues = finalSelection.map((s: { issue: Issue }) => s.issue);
      if (epicContext.epic && epicContext.recommendation && !searchApplied) {
        // When epic mode triggers without search, align display to the recommended related issue
        const match = recommendedIssues.find((i) => i.id === epicContext.recommendation?.issue.id);
        if (match) {
          recommendedIssues.splice(0, recommendedIssues.length, match);
        }
      }
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

      if (epicContext.epic && epicContext.recommendation) {
        const relLabel = epicContext.relation === 'blocker' ? 'blocker' : 'child';
        const progressNote = String(epicContext.recommendation.issue.status ?? '').toLowerCase() === 'in_progress'
          ? ' (in_progress — finish started work)'
          : '';
        logStdout(`Epic context: ${epicContext.epic.id} (${epicContext.epic.status ?? ''})`);
        logStdout(`Recommended ${relLabel}: ${epicContext.recommendation.issue.id}${progressNote}`);
        logStdout('');
      }

      logStdout(heading('Details'));
      logStdout('');
      if (finalSelection.length > 0) {
        const top = finalSelection[0];
        if (isCliAvailable('bd')) {
          const printedDetails = startStatus('Fetching details...');
          try {
            const shown = runBd(['show', top.issue.id]);
            if (printedDetails) clearStatus();
            logStdout(shown.trim());
            return;
          } catch (e) {
            if (printedDetails) clearStatus();
            if (verbose) process.stderr.write(`[debug] bd show failed: ${(e as Error).message}\n`);
          }
        }

        const rendered = renderIssueTitle(top.issue);
        logStdout(`${top.issue.id}: ${rendered}`);
      }

    });

  return cmd;
}
