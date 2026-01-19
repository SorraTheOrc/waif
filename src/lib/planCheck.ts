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

export type StructuredFindings = {
  intake: Array<{ id: string; title?: string; missing: string[] }>;
  dependency: Array<{ id: string; ref: string }>;
  cycles: string[][];
  orphans: Array<{ id: string; title?: string }>; 
};

export function getFindings(issues: BeadIssue[]): StructuredFindings {
  const intake: Array<{ id: string; title?: string; missing: string[] }> = [];
  const dependency: Array<{ id: string; ref: string }> = [];
  const cycles: string[][] = [];
  const orphans: Array<{ id: string; title?: string }> = [];

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
      intake.push({ id: it.id, title: it.title, missing });
    }
  }

  // 2) Missing referenced IDs (scan descriptions for wf- or bd- tokens)
  const idPattern = /\b(wf-[A-Za-z0-9.\-]+|bd-[A-Za-z0-9.\-]+)\b/g;
  for (const it of issues) {
    const desc = it.description ?? '';
    const matches = Array.from(desc.matchAll(idPattern)).map((m) => m[0]);
    for (const m of matches) {
      if (!ids.has(m)) {
        dependency.push({ id: it.id, ref: m });
      }
    }
  }

  // 3) Cycles detection (simple DFS)
  const visited = new Set<string>();
  const rec = new Set<string>();

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
      orphans.push({ id: it.id, title: it.title });
    }
  }

  return { intake, dependency, cycles, orphans };
}

export function analyzeIssues(issues: BeadIssue[]) {
  const findings = getFindings(issues);
  const hasAny = (findings.intake.length > 0) || (findings.dependency.length > 0) || (findings.cycles.length > 0) || (findings.orphans.length > 0);
  if (!hasAny) {
    return '# wf doctor — Plan Validator\n\nNo issues detected. All checks passed.';
  }

  // Format human-readable Markdown with separators per category
  const header = '# wf doctor — Plan Validator\n\nThe validator found the following items. These are informational; no fixes were applied.\n\n';
  const parts: string[] = [];

  if (findings.intake.length) {
    parts.push('## Intake completeness\n\n');
    findings.intake.forEach((it, idx) => {
      parts.push(`${idx + 1}. ${it.id} ${it.title ? `(${it.title}) ` : ''}missing headings: ${it.missing.join(', ')}`);
    });
    parts.push('\n');
  }

  if (findings.dependency.length) {
    parts.push('## Dependency issues\n\n');
    findings.dependency.forEach((d, idx) => {
      parts.push(`${idx + 1}. ${d.id} references missing issue ${d.ref}`);
    });
    parts.push('\n');
  }

  if (findings.cycles.length) {
    parts.push('## Cycles\n\n');
    findings.cycles.forEach((c, idx) => {
      parts.push(`${idx + 1}. ${c.join(' -> ')}`);
    });
    parts.push('\n');
  }

  if (findings.orphans.length) {
    parts.push('## Orphans (leaf tasks)\n\n');
    findings.orphans.forEach((o, idx) => {
      parts.push(`${idx + 1}. ${o.id}${o.title ? ` (${o.title})` : ''}`);
    });
    parts.push('\n');
  }

  return header + parts.join('\n') + '\n';
}

