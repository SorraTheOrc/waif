import { chmodSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

const CLI = [process.execPath, 'dist/index.js'];

function makeFakeBd(binDir: string, issuesArray: Record<string, any>[]) {
  const bdPath = join(binDir, 'bd');

  const script = [
    `#!${process.execPath}`,
    '',
    `const issues = ${JSON.stringify(issuesArray, null, 2)};`,
    "const args = process.argv.slice(2);",
    '',
    "if (args[0] === '--version') {",
    "  process.stdout.write('bd 0.0.0\\n');",
    '  process.exit(0);',
    '}',
    '',
    "if (args[0] === 'list') {",
    "  const json = args.includes('--json');",
    "  if (!json) {",
    "    process.stderr.write('Expected --json\\n');",
    '    process.exit(2);',
    '  }',
    '',
    '  process.stdout.write(JSON.stringify(issues) + "\\n");',
    '  process.exit(0);',
    '}',
    '',
    "process.stderr.write('Unsupported bd args: ' + args.join(' ') + '\\n');",
    'process.exit(2);',
    '',
  ].join('\n');

  writeFileSync(bdPath, script, { encoding: 'utf8' });
  chmodSync(bdPath, 0o755);
  return bdPath;
}

describe('wf doctor (integration)', () => {
  it('shows unk stage for beads without a stage label', async () => {
    const binDir = mkdtempSync(join(tmpdir(), 'wf-bd-'));

    const issues = [
      { id: 'wf-no-stage', title: 'No stage', status: 'open', issue_type: 'chore' },
      { id: 'wf-prd', title: 'Has stage', status: 'open', issue_type: 'feature', labels: ['stage:prd'] },
    ];

    makeFakeBd(binDir, issues);

    const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), 'doctor'], {
      env: {
        ...process.env,
        PATH: binDir,
      },
    });

    expect(exitCode).toBe(0);
    // Ensure the unk stage appears on the same row as the wf-no-stage id
    const lines = stdout.split('\n');
    const found = lines.some((l) => l.includes('wf-no-stage') && l.includes('unk'));
    expect(found).toBe(true);
  });
});
