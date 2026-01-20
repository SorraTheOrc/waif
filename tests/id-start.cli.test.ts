import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

const CLI = [process.execPath, 'dist/index.js'];

type FakeGitState = {
  dirty: boolean;
  branches: string[];
  currentBranch: string;
  createCount: number;
  checkoutCount: number;
};

function makeFakeGit(
  binDir: string,
  initial: { dirty?: boolean; branch?: string; existingBranches?: string[] } = {},
) {
  const gitPath = join(binDir, 'git');
  const statePath = join(binDir, 'git-state.json');

  const state: FakeGitState = {
    dirty: Boolean(initial.dirty),
    branches: Array.isArray(initial.existingBranches) ? [...initial.existingBranches] : [],
    currentBranch: initial.branch ?? 'main',
    createCount: 0,
    checkoutCount: 0,
  };
  writeFileSync(statePath, JSON.stringify(state), { encoding: 'utf8' });

  const script = [
    `#!${process.execPath}`,
    '',
    'const args = process.argv.slice(2);',
    'const { readFileSync, writeFileSync } = require("fs");',
    `const statePath = ${JSON.stringify(statePath)};`,
    '',
    'function readState() { return JSON.parse(readFileSync(statePath, "utf8")); }',
    'function writeState(s) { writeFileSync(statePath, JSON.stringify(s), { encoding: "utf8" }); }',
    '',
    "if (args[0] === '--version') { process.stdout.write('git 0.0.0\\n'); process.exit(0); }",
    "if (args[0] === 'status' && args.includes('--porcelain=v1')) {",
    '  const s = readState();',
    "  process.stdout.write(s.dirty ? ' M file.txt\\n' : '');",
    '  process.exit(0);',
    '}',
    "if (args[0] === 'rev-parse' && args[1] === '--verify') {",
    '  const s = readState();',
    '  const ref = String(args[2] || "");',
    '  const prefix = "refs/heads/";',
    '  const name = ref.startsWith(prefix) ? ref.slice(prefix.length) : ref;',
    '  process.exit(s.branches.includes(name) ? 0 : 1);',
    '}',
    "if (args[0] === 'checkout' && args[1] === '-b') {",
    '  const s = readState();',
    '  const name = String(args[2] || "");',
    '  if (name && !s.branches.includes(name)) s.branches.push(name);',
    '  s.currentBranch = name || s.currentBranch;',
    '  s.createCount += 1;',
    '  writeState(s);',
    '  process.exit(0);',
    '}',
    "if (args[0] === 'checkout') {",
    '  const s = readState();',
    '  s.currentBranch = String(args[1] || s.currentBranch);',
    '  s.checkoutCount += 1;',
    '  writeState(s);',
    '  process.exit(0);',
    '}',
    "process.stderr.write('Unsupported git args: ' + args.join(' ') + '\\n');",
    'process.exit(2);',
    '',
  ].join('\n');

  writeFileSync(gitPath, script, { encoding: 'utf8' });
  chmodSync(gitPath, 0o755);
  return { gitPath, statePath };
}

function makeFakeBd(binDir: string, issue: any) {
  const bdPath = join(binDir, 'bd');

  const statePath = join(binDir, 'bd-state.json');
  const initState = {
    issue,
    externalRef: String(issue?.external_ref || ''),
    comments: [] as { text: string }[],
  };
  writeFileSync(statePath, JSON.stringify(initState), { encoding: 'utf8' });

  const script = [
    `#!${process.execPath}`,
    '',
    'const args = process.argv.slice(2);',
    'const { readFileSync, writeFileSync } = require("fs");',
    `const statePath = ${JSON.stringify(statePath)};`,
    '',
    'function readState() { return JSON.parse(readFileSync(statePath, "utf8")); }',
    'function writeState(s) { writeFileSync(statePath, JSON.stringify(s), { encoding: "utf8" }); }',
    '',
    "if (args[0] === '--version') { process.stdout.write('bd 0.0.0\\n'); process.exit(0); }",
    '',
    "if (args[0] === 'show' && args.includes('--json')) {",
    '  const s = readState();',
    '  const out = { ...s.issue, external_ref: s.externalRef };',
    '  process.stdout.write(JSON.stringify([out]) + "\\n");',
    '  process.exit(0);',
    '}',
    '',
    "if (args[0] === 'update') {",
    '  const s = readState();',
    '  if (args.includes("--status")) {',
    '    s.issue = { ...s.issue, status: args[args.indexOf("--status") + 1] };',
    '  }',
    '  if (args.includes("--external-ref")) {',
    '    s.externalRef = args[args.indexOf("--external-ref") + 1];',
    '  }',
    '  writeState(s);',
    '  process.stdout.write("\\n");',
    '  process.exit(0);',
    '}',
    '',
    "if (args[0] === 'comments' && args[2] === '--json') {",
    '  const s = readState();',
    '  process.stdout.write(JSON.stringify(s.comments) + "\\n");',
    '  process.exit(0);',
    '}',
    "if (args[0] === 'comments' && args[1] === 'add') {",
    '  const s = readState();',
    '  s.comments.push({ text: args.slice(3).join(" ") });',
    '  writeState(s);',
    '  process.stdout.write("\\n");',
    '  process.exit(0);',
    '}',
    '',
    "process.stderr.write('Unsupported bd args: ' + args.join(' ') + '\\n');",
    'process.exit(2);',
    '',
  ].join('\n');

  writeFileSync(bdPath, script, { encoding: 'utf8' });
  chmodSync(bdPath, 0o755);
  return { bdPath, statePath };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, { encoding: 'utf8' }));
}

describe('wf action start (integration)', () => {
  it('dry-run prints intended actions', async () => {
    const binDir = mkdtempSync(join(tmpdir(), 'wf-id-'));
    makeFakeGit(binDir, { dirty: true });
    makeFakeBd(binDir, { id: 'wf-1', title: 'Add intake wrapper', status: 'open' });

    const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), 'action', 'start', 'wf-1', '--dry-run'], {
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ''}` },
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Dry run: would start work on wf-1');
    expect(stdout).toContain('bd update wf-1 --status in_progress');
  });

  it('fails fast when working tree is dirty (non-dry-run)', async () => {
    const binDir = mkdtempSync(join(tmpdir(), 'wf-id-'));
    makeFakeGit(binDir, { dirty: true });
    makeFakeBd(binDir, { id: 'wf-1', title: 'Add intake wrapper', status: 'open' });

    const { exitCode, stderr } = await execa(CLI[0], [...CLI.slice(1), 'action', 'start', 'wf-1'], {
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ''}` },
      reject: false,
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain('Working tree is dirty');
  });

  it('is idempotent when re-run on same issue', async () => {
    const binDir = mkdtempSync(join(tmpdir(), 'wf-id-'));
    const { statePath: gitStatePath } = makeFakeGit(binDir, { dirty: false });
    const { statePath: bdStatePath } = makeFakeBd(binDir, { id: 'wf-1', title: 'Add intake wrapper', status: 'open' });

    const env = { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ''}` };

    const first = await execa(CLI[0], [...CLI.slice(1), 'action', 'start', 'wf-1'], { env });
    expect(first.exitCode).toBe(0);

    const second = await execa(CLI[0], [...CLI.slice(1), 'action', 'start', 'wf-1'], { env });
    expect(second.exitCode).toBe(0);

    const gitState = readJson<FakeGitState>(gitStatePath);
    expect(gitState.createCount).toBe(1);
    expect(gitState.checkoutCount).toBe(1);

    const bdState = readJson<{ issue: any; externalRef: string; comments: { text: string }[] }>(bdStatePath);
    expect(bdState.issue.status).toBe('in_progress');
    expect(bdState.externalRef).toBe('branch:bd-wf-1/add-intake-wrapper');
    expect(bdState.comments).toHaveLength(1);
    expect(bdState.comments[0].text).toBe('Branch created: bd-wf-1/add-intake-wrapper (local)');
  });

  it('does not overwrite an existing external_ref', async () => {
    const binDir = mkdtempSync(join(tmpdir(), 'wf-id-'));
    makeFakeGit(binDir, { dirty: false });
    const { statePath: bdStatePath } = makeFakeBd(binDir, {
      id: 'wf-1',
      title: 'Add intake wrapper',
      status: 'open',
      external_ref: 'branch:already-set',
    });

    const env = { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ''}` };
    const res = await execa(CLI[0], [...CLI.slice(1), 'action', 'start', 'wf-1'], { env });
    expect(res.exitCode).toBe(0);

    const bdState = readJson<{ issue: any; externalRef: string; comments: { text: string }[] }>(bdStatePath);
    expect(bdState.externalRef).toBe('branch:already-set');
  });

  it('reuses an existing local branch instead of creating one', async () => {
    const binDir = mkdtempSync(join(tmpdir(), 'wf-id-'));
    const branch = 'bd-wf-1/add-intake-wrapper';
    const { statePath: gitStatePath } = makeFakeGit(binDir, { dirty: false, existingBranches: [branch] });
    makeFakeBd(binDir, { id: 'wf-1', title: 'Add intake wrapper', status: 'open' });

    const env = { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ''}` };
    const res = await execa(CLI[0], [...CLI.slice(1), 'action', 'start', 'wf-1'], { env });
    expect(res.exitCode).toBe(0);

    const gitState = readJson<FakeGitState>(gitStatePath);
    expect(gitState.createCount).toBe(0);
    expect(gitState.checkoutCount).toBe(1);
  });
});
