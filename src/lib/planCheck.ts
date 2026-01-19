export type BeadIssue = {
  id: string;
  title?: string;
  description?: string;
  status?: string;
  issue_type?: string;
  dependencies?: Array<{ issue_id?: string; depends_on_id?: string; type?: string }>;
  depends_on?: string[] | undefined;
  parent?: string | undefined;
  labels?: string[];
};

function hasHeading(desc: string | undefined, heading: string) {
  if (!desc) return false;
  const re = new RegExp(`^\\s*${heading}\\s*$`, 'im');
  return re.test(desc);
}

export function analyzeIssues(issues: BeadIssue[]) {
  const findings: string[] = [];

  // Build adjacency for dependency checking
  const adj = new Map<string, string[]>();
  const ids = new Set<string>();
  for (const it of issues) {
    ids.add(it.id);
    const deps: string[] = [];
    if (Array.isArray(it.dependencies)) {
      for (const d of it.dependencies) {
        if (d && d.depends_on_id) deps.push(d.depends_on_id);
      }
    } else if (Array.isArray((it as any).depends_on)) {
      for (const d of (it as any).depends_on) deps.push(String(d));
    }
    adj.set(it.id, deps);
  }

  // 1) Intake completeness
  for (const it of issues) {
    const missing: string[] = [];
    if (!hasHeading(it.description, 'Problem')) missing.push('Problem');
    if (!hasHeading(it.description, 'Users')) missing.push('Users');
    if (!hasHeading(it.description, 'Success criteria')) missing.push('Success criteria');
    if (!hasHeading(it.description, 'Constraints')) missing.push('Constraints');
    if (missing.length) {
      findings.push(`- [Intake] ${it.id} ${it.title ? `(${it.title}) ` : ''}missing headings: ${missing.join(', ')}`);
    }
  }

  // 2) Missing referenced IDs (scan descriptions for wf- or bd- tokens)
  const idPattern = /\b(wf-[A-Za-z0-9.\-]+|bd-[A-Za-z0-9.\-]+)\b/g;
  for (const it of issues) {
    const desc = it.description ?? '';
    const matches = Array.from(desc.matchAll(idPattern)).map((m) => m[0]);
    for (const m of matches) {
      if (!ids.has(m)) {
        findings.push(`- [Dependency] ${it.id} references missing issue ${m}`);
      }
    }
  }

  // 3) Cycles detection (simple DFS)
  const visited = new Set<string>();
  const rec = new Set<string>();
  const cycles: string[][] = [];

  function dfs(node: string, path: string[]) {
    if (rec.has(node)) {
      const idx = path.indexOf(node);
      cycles.push(path.slice(idx).concat(node));
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    rec.add(node);
    const neigh = adj.get(node) ?? [];
    for (const n of neigh) {
      if (!ids.has(n)) continue;
      dfs(n, path.concat(n));
    }
    rec.delete(node);
  }

  for (const id of ids) dfs(id, [id]);
  for (const c of cycles) {
    findings.push(`- [Cycle] ${c.join(' -> ')}`);
  }

  // 4) Orphans: leaf tasks (non-epic) with no parent and no deps and no dependents
  const dependents = new Map<string, number>();
  for (const id of ids) dependents.set(id, 0);
  for (const [k, arr] of adj.entries()) {
    for (const d of arr) {
      dependents.set(d, (dependents.get(d) ?? 0) + 1);
    }
  }

  for (const it of issues) {
    const isEpic = it.issue_type === 'epic' || (Array.isArray(it.labels) && it.labels.includes('epic'));
    const hasParent = Boolean((it as any).parent);
    const hasDeps = (adj.get(it.id) ?? []).length > 0;
    const hasDependents = (dependents.get(it.id) ?? 0) > 0;
    if (!isEpic && !hasParent && !hasDeps && !hasDependents) {
      findings.push(`- [Orphan] ${it.id} ${it.title ? `(${it.title}) ` : ''}is a leaf task with no parent or deps`);
    }
  }

  if (findings.length === 0) {
    return '# wf doctor — Plan Validator\n\nNo issues detected. All checks passed.';
  }

  // Format human-readable Markdown
  const header = '# wf doctor — Plan Validator\n\nThe validator found the following items. These are informational; no fixes were applied.\n\n';
  return header + findings.join('\n') + '\n';
}
