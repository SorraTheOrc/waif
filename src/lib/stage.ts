export type StageToken =
  | 'unknown'
  | 'idea'
  | 'prd'
  | 'milestone'
  | 'planning'
  | 'in_progress'
  | 'review'
  | 'done';

const STAGE_PREFIX = 'stage:';

// From docs/dev/workflow_stage_tracking_PRD.md
const STAGE_MATURITY_ORDER: StageToken[] = [
  'unknown',
  'idea',
  'prd',
  'milestone',
  'planning',
  'in_progress',
  'review',
  'done',
];

const MATURITY_RANK = new Map<StageToken, number>(STAGE_MATURITY_ORDER.map((s, idx) => [s, idx]));

export function extractStageTokens(labels: unknown[] | string | undefined | null): StageToken[] {
  const tokens: StageToken[] = [];
  if (labels == null) return tokens;

  // Normalize to an array of candidate strings
  let candidates: string[] = [];
  if (Array.isArray(labels)) {
    for (const l of labels) {
      if (typeof l === 'string') {
        candidates.push(l);
      } else if (l && typeof l === 'object') {
        // common shapes: { name: 'stage:prd' } or { label: 'stage:prd' }
        const name = (l as any).name ?? (l as any).label ?? (l as any).title ?? undefined;
        if (typeof name === 'string') candidates.push(name);
      }
    }
  } else if (typeof labels === 'string') {
    candidates = labels.split(/\s*,\s*/).filter(Boolean);
  }

  for (const label of candidates) {
    if (typeof label !== 'string') continue;
    const lower = label.toLowerCase().trim();

    if (!lower.startsWith(STAGE_PREFIX)) continue;

    const token = lower.slice(STAGE_PREFIX.length).trim();
    if (!token) continue;

    // accept only known tokens
    if ((MATURITY_RANK as any).has(token)) {
      tokens.push(token as StageToken);
    }
  }

  return tokens;
}

export function computeWorkflowStage(labels: string[] | undefined | null): { stage: StageToken; hasMultiple: boolean } {
  const tokens = extractStageTokens(labels);
  if (tokens.length === 0) return { stage: 'unknown', hasMultiple: false };

  let best: StageToken = tokens[0]!;
  for (const t of tokens.slice(1)) {
    const r1 = MATURITY_RANK.get(best) ?? 0;
    const r2 = MATURITY_RANK.get(t) ?? 0;
    if (r2 > r1) best = t;
  }

  return { stage: best, hasMultiple: tokens.length > 1 };
}

// Compute stage for an issue object; if the issue itself has no stage labels, derive from children labels.
export function computeStageForIssue(issue: any): { stage: StageToken; hasMultiple: boolean; derivedFromChildren?: boolean } {
  if (!issue) return { stage: 'unknown', hasMultiple: false };
  const labels = (issue as any).labels ?? (issue as any).labels;
  const primary = computeWorkflowStage(labels ?? undefined);
  if (primary.stage !== 'unknown' || !Array.isArray(issue.children)) {
    return { ...primary, derivedFromChildren: false };
  }

  // Derive from children: collect all child stage tokens
  const childTokens: StageToken[] = [];
  for (const child of issue.children) {
    const cLabels = (child && (child.labels ?? child.label ?? child.name)) || undefined;
    const toks = extractStageTokens(cLabels as any);
    for (const t of toks) childTokens.push(t);
  }

  if (childTokens.length === 0) return { stage: 'unknown', hasMultiple: false, derivedFromChildren: false };

  // Pick most mature among childTokens
  let best: StageToken = childTokens[0]!;
  for (const t of childTokens.slice(1)) {
    const r1 = MATURITY_RANK.get(best) ?? 0;
    const r2 = MATURITY_RANK.get(t) ?? 0;
    if (r2 > r1) best = t;
  }

  return { stage: best, hasMultiple: childTokens.length > 1, derivedFromChildren: true };
}

export function stageCode(stage: StageToken): string {
  switch (stage) {
    case 'unknown':
      return 'unk';
    case 'idea':
      return 'ide';
    case 'prd':
      return 'prd';
    case 'milestone':
      return 'mil';
    case 'planning':
      return 'pln';
    case 'in_progress':
      return 'inp';
    case 'review':
      return 'rev';
    case 'done':
      return 'don';
  }
}
