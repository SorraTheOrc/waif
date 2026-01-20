import { describe, it, expect } from 'vitest';
import { getFindings } from '../src/lib/planCheck';

describe('planCheck orphan detection (mixed shapes)', () => {
  it('does not mark child with explicit parent as orphan', () => {
    const issues: any[] = [
      { id: 'ge-apq', issue_type: 'epic' },
      { id: 'ge-apq.1', issue_type: 'task', parent: 'ge-apq' },
    ];

    const findings = getFindings(issues);
    const orphanIds = findings.orphans.map((o) => o.id);
    expect(orphanIds).not.toContain('ge-apq.1');
  });

  it('recognizes dependency objects that use `id` instead of `depends_on_id`', () => {
    const issues: any[] = [
      { id: 'ge-apq', issue_type: 'epic' },
      { id: 'ge-apq.1', issue_type: 'task', dependencies: [{ id: 'ge-apq' }] },
    ];

    const findings = getFindings(issues);
    const orphanIds = findings.orphans.map((o) => o.id);
    expect(orphanIds).not.toContain('ge-apq.1');
  });

  it('honors summary dependency_count to avoid false orphaning', () => {
    const issues: any[] = [
      { id: 'ge-apq', issue_type: 'epic' },
      { id: 'ge-apq.1', issue_type: 'task', dependency_count: 1 },
    ];

    const findings = getFindings(issues);
    const orphanIds = findings.orphans.map((o) => o.id);
    expect(orphanIds).not.toContain('ge-apq.1');
  });
});
