import { renderIssuesTable, type IssueForTable } from './table.js';

export type RelatedIssue = {
  id?: string;
  title?: string;
  status?: string;
  dependency_type?: string;
  type?: string;
  depends_on_id?: string;
  priority?: number;
  assignee?: string;
  dependency_count?: number;
  dependent_count?: number;
  dependencies?: RelatedIssue[];
};

export type IssueWithRelations = {
  id?: string;
  title?: string;
  status?: string;
  issue_type?: string;
  priority?: number;
  assignee?: string;
  dependency_count?: number;
  dependent_count?: number;
  dependencies?: RelatedIssue[];
  dependents?: RelatedIssue[];
  children?: RelatedIssue[];
  [key: string]: unknown;
};

const TERMINAL_STATUSES = new Set(['closed', 'done', 'tombstone']);

function isTerminalStatus(status: unknown): boolean {
  if (typeof status !== 'string') return false;
  return TERMINAL_STATUSES.has(status.toLowerCase());
}

function mapToIssueForTable(rel?: RelatedIssue): IssueForTable | null {
  if (!rel) return null;
  const id = rel.id ?? rel.depends_on_id;
  if (!id) return null;

  return {
    id,
    title: rel.title,
    status: typeof rel.status === 'string' ? rel.status : undefined,
    priority: typeof rel.priority === 'number' ? rel.priority : undefined,
    assignee: typeof rel.assignee === 'string' ? rel.assignee : undefined,
    dependency_count: typeof rel.dependency_count === 'number' ? rel.dependency_count : undefined,
    dependent_count: typeof rel.dependent_count === 'number' ? rel.dependent_count : undefined,
    dependencies: Array.isArray(rel.dependencies) ? (rel.dependencies as IssueForTable['dependencies']) : undefined,
    // Preserve labels when present so table can compute stage per-issue
    labels: Array.isArray((rel as any).labels) ? ((rel as any).labels as string[]) : (typeof (rel as any).label === 'string' ? [ (rel as any).label ] : undefined),
  } as IssueForTable;
}

export function extractBlockers(issue: IssueWithRelations): IssueForTable[] {
  if (!issue?.dependencies || !Array.isArray(issue.dependencies)) return [];

  const blockers: IssueForTable[] = [];
  for (const dep of issue.dependencies) {
    if (!dep) continue;
    const dependencyType = String(dep.dependency_type ?? dep.type ?? '').toLowerCase();
    if (dependencyType !== 'blocks') continue;
    if (isTerminalStatus(dep.status)) continue;

    const mapped = mapToIssueForTable(dep);
    if (mapped) blockers.push(mapped);
  }

  return blockers;
}

function pickChildren(issue: IssueWithRelations): RelatedIssue[] {
  const dependents = Array.isArray(issue.dependents) ? issue.dependents : [];
  const childrenField = Array.isArray(issue.children) ? issue.children : [];

  if (dependents.length) return dependents;
  return childrenField;
}

export function extractChildren(issue: IssueWithRelations): IssueForTable[] {
  const related = pickChildren(issue);
  if (!related.length) return [];

  const children = related
    .filter((rel) => {
      const relation = String(rel?.dependency_type ?? rel?.type ?? '').toLowerCase();
      if (relation && relation !== 'parent-child') return false;
      if (isTerminalStatus(rel?.status)) return false;
      return true;
    })
    .map(mapToIssueForTable)
    .filter((child): child is IssueForTable => Boolean(child));

  return children;
}

function renderSection(title: string, issues: IssueForTable[], termWidth?: number): string {
  if (!issues.length) return '';

  // account for indentation so nested tables respect the parent terminal width
  const innerWidth = typeof termWidth === 'number' ? Math.max(10, termWidth - 4) : termWidth;
  const rendered = renderIssuesTable(issues, { sort: 'id', termWidth: innerWidth });
  const indented = rendered
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
  return `  ${title}
${indented}`;
}


export function renderBlockersSection(issue: IssueWithRelations, termWidth?: number): string {
  return renderSection('Blockers', extractBlockers(issue), termWidth);
}

export function renderChildrenSection(issue: IssueWithRelations, termWidth?: number): string {
  return renderSection('Children', extractChildren(issue), termWidth);
}
