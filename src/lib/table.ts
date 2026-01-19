import { displayWidth, padDisplay, truncateDisplay } from './displayWidth.js';
import { computeWorkflowStage, stageCode } from './stage.js';

export type ColumnConfig<Row> = {
  key: keyof Row | string;
  header: string;
  minWidth?: number;
  maxWidth?: number;
  droppable?: boolean;
};

export type TableOptions<Row> = {
  columns: ColumnConfig<Row>[];
  rows: Row[];
  termWidth?: number;
  sep?: string;
};

export type IssueForTable = {
  id: string;
  title?: string;
  status?: string;
  issue_type?: string;
  priority?: number;
  assignee?: string;
  labels?: string[];
  dependency_count?: number;
  dependent_count?: number;
  // We support both shapes:
  // - bd show: dependencies[] entries are issue-like objects w/ dependency_type + status
  // - older/jsonl-ish: dependencies[] entries are edge-like objects w/ type + depends_on_id
  dependencies?: Array<{ id?: string; status?: string; dependency_type?: string; type?: string; depends_on_id?: string }>;
};

function isTerminalStatus(status: string): boolean {
  const normalized = status.toLowerCase();
  return normalized === 'closed' || normalized === 'done' || normalized === 'tombstone';
}

function computeBlockersCount(issue: IssueForTable): number {
  const deps = issue.dependencies;
  if (deps && Array.isArray(deps) && deps.length > 0) {
    return deps.filter((d) => {
      const rel = String(d?.dependency_type ?? d?.type ?? '').toLowerCase();
      if (rel !== 'blocks') return false;
      const status = String(d?.status ?? '').toLowerCase();
      return status.length === 0 ? true : !isTerminalStatus(status);
    }).length;
  }

  // Fallback: Beads list output exposes only total dependency count.
  if (typeof issue.dependency_count === 'number') return issue.dependency_count;

  return 0;
}

function computeBlocksCount(issue: IssueForTable): number {
  if (typeof issue.dependent_count === 'number') return issue.dependent_count;
  return 0;
}

export function renderGenericTable<Row extends Record<string, any>>(options: TableOptions<Row>): string {
  const sep = options.sep ?? '  ';
  const termWidth = typeof options.termWidth === 'number'
    ? options.termWidth
    : (typeof process !== 'undefined' && process.stdout && typeof process.stdout.columns === 'number')
      ? process.stdout.columns
      : (Number(process.env.COLUMNS || 0) || 120);

  const cols = options.columns.map((c) => ({
    key: c.key,
    header: c.header,
    minWidth: Math.max(1, c.minWidth ?? displayWidth(c.header)),
    maxWidth: c.maxWidth ?? Infinity,
    droppable: Boolean(c.droppable),
  }));

  const rows = options.rows ?? [];
  if (!cols.length) return '';

  // Base widths from header and content
  const baseWidths = cols.map((c) => {
    const headerW = displayWidth(c.header);
    const contentW = Math.max(0, ...rows.map((r) => displayWidth(String((r as any)[c.key] ?? ''))));
    const raw = Math.max(headerW, contentW, c.minWidth ?? 1);
    return Math.min(raw, c.maxWidth ?? raw);
  });

  // Desired widths start at base widths
  const desired = [...baseWidths];

  const totalWidth = (widths: number[]) => widths.reduce((sum, w) => sum + w, 0) + sep.length * Math.max(0, widths.length - 1);

  // Drop droppable columns from the right until fit, shrinking non-droppable title-like columns last.
  const visible = cols.map((c, idx) => ({ ...c, width: desired[idx], idx }));

  while (totalWidth(visible.map((v) => v.width)) > termWidth) {
    // try to drop a droppable column from the right
    const droppableIdx = [...visible].reverse().find((v) => v.droppable);
    if (droppableIdx) {
      const idx = visible.findIndex((v) => v.idx === droppableIdx.idx);
      visible.splice(idx, 1);
      continue;
    }

    // Otherwise shrink the widest column if possible
    const widest = visible.reduce((best, v) => (v.width > best.width ? v : best), visible[0]);
    if (widest.width > (widest.minWidth ?? 1)) {
      widest.width = Math.max(widest.minWidth ?? 1, widest.width - 1);
      continue;
    }

    break;
  }

  const headerLine = visible.map((v) => padDisplay(v.header, v.width)).join(sep);
  const dashLine = visible.map((v) => '-'.repeat(Math.max(3, v.width))).join(sep);

  const bodyLines = rows.map((r) => {
    const parts = visible.map((v) => {
      const raw = (r as any)[v.key];
      const truncated = truncateDisplay(raw, v.width);
      return padDisplay(truncated, v.width);
    });
    return parts.join(sep);
  });

  return [headerLine, dashLine, ...bodyLines].join('\n');
}

// ---------------------------------------------------------------------------
// Issues table (in-progress/next/recent)
// ---------------------------------------------------------------------------

type RenderIssuesTableOptions = {
  color?: {
    enabled: boolean;
    blockedRow: string;
    reset: string;
  };
  sort?: 'id' | 'none';
  termWidth?: number;
};

export function renderIssuesTable(issues: IssueForTable[], options: RenderIssuesTableOptions = {}): string {
  if (!issues.length) return '';

  const sortMode = options.sort ?? 'id';

  const rows = issues
    .map((i) => {
      const blockers = computeBlockersCount(i);
      const blocks = computeBlocksCount(i);
      const { stage } = computeWorkflowStage(i.labels);
      return {
        id: i.id,
        stage,
        title: renderIssueTitle(i, 0),
        priority: typeof i.priority === 'number' ? String(i.priority) : '',
        blockers: String(blockers),
        blocks: String(blocks),
        assignee: typeof i.assignee === 'string' ? i.assignee : '',
      };
    });

  if (sortMode === 'id') rows.sort((a, b) => a.id.localeCompare(b.id));

  const columns: ColumnConfig<typeof rows[number]>[] = [
    { key: 'id', header: 'ID', minWidth: 2, maxWidth: 20, droppable: false },
    { key: 'stage', header: 'Stage', minWidth: 3, maxWidth: 12, droppable: false },
    { key: 'title', header: 'Type / Status / Title', minWidth: 4, maxWidth: 60, droppable: false },
    { key: 'priority', header: 'Priority', minWidth: 3, maxWidth: 8, droppable: true },
    { key: 'blockers', header: 'Blockers', minWidth: 3, maxWidth: 8, droppable: true },
    { key: 'blocks', header: 'Blocks', minWidth: 3, maxWidth: 8, droppable: true },
    { key: 'assignee', header: 'Assignee', minWidth: 3, maxWidth: 20, droppable: true },
  ];

  const stageCol = columns.find((c) => c.key === 'stage');
  if (stageCol) {
    const tw = options.termWidth ?? (typeof process !== 'undefined' && process.stdout ? process.stdout.columns : undefined);
    const veryNarrow = typeof tw === 'number' ? tw <= 70 : false;
    for (const r of rows as any[]) {
      r.stage = veryNarrow ? stageCode(r.stage) : r.stage;
    }
    stageCol.maxWidth = veryNarrow ? 3 : 12;
  }

  const table = renderGenericTable({ columns, rows, termWidth: options.termWidth, sep: '  ' });
  if (!options.color?.enabled) return table;

  // Apply color to blocked rows
  const lines = table.split('\n');
  const headerLines = lines.slice(0, 2);
  const bodyLines = lines.slice(2);
  const colored = bodyLines.map((line, idx) => {
    const blockersNumber = Number(rows[idx]?.blockers);
    if (Number.isFinite(blockersNumber) && blockersNumber > 0) {
      return `${options.color!.blockedRow}${line}${options.color!.reset}`;
    }
    return line;
  });

  return [...headerLines, ...colored].join('\n');
}

export function renderInProgressIssuesTable(issues: IssueForTable[]): string {
  return renderIssuesTable(issues);
}

// ---------------------------------------------------------------------------
// OODA table (Agent / Status / Title)
// ---------------------------------------------------------------------------

export type OodaRow = { agent: string; status: string; title: string };

export function renderOodaTable(rows: OodaRow[], termWidth?: number): string {
  const columns: ColumnConfig<OodaRow>[] = [
    { key: 'agent', header: 'Agent', minWidth: 3, maxWidth: 30, droppable: true },
    { key: 'status', header: 'Status', minWidth: 4, maxWidth: 12, droppable: true },
    { key: 'title', header: 'Title', minWidth: 8, maxWidth: 120, droppable: false },
  ];

  // Safety: if all columns present still overflow due to wide glyphs, renderGenericTable will shrink droppables first, then the widest column.
  return renderGenericTable<OodaRow>({ columns, rows, termWidth, sep: ' | ' });
}

// ---------------------------------------------------------------------------
// Existing issue title rendering helpers (unchanged)
// ---------------------------------------------------------------------------

import { renderIssueTitle } from './issueTitle.js';

export function renderIssueRow(issue: IssueForTable): string {
  return renderIssueTitle(issue, 0);
}
