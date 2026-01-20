import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import YAML from 'js-yaml';

import { execFileOrThrow, ensureCliAvailable, requireCleanWorkingTree } from './wrappers.js';
import { runBdSync } from './bd.js';
import { CliError } from '../types.js';

export type ActionStep =
  | { type: 'shell'; cmd: string }
  | { type: 'bd'; cmd: string }
  | { type: 'noop' };

export type Action = {
  name: string;
  description?: string;
  requires?: string[];
  safety?: { require_clean_worktree?: boolean; dry_run_support?: boolean };
  inputs?: Record<string, { required?: boolean; description?: string; default?: any }>;
  runs: ActionStep[];
};

import AjvPkg from 'ajv';
const Ajv = (AjvPkg as any).default ?? AjvPkg;
const ajv = new (Ajv as any)();
// minimal runtime schema
const schema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    requires: { type: 'array', items: { type: 'string' } },
    safety: {
      type: 'object',
      properties: { require_clean_worktree: { type: 'boolean' }, dry_run_support: { type: 'boolean' } },
      additionalProperties: false,
    },
    inputs: { type: 'object' },
    runs: { type: 'array' },
  },
  required: ['name', 'runs'],
  additionalProperties: false,
};
const validate = ajv.compile(schema as any);

export function loadActionFromFile(filePath: string): Action {
  const raw = readFileSync(filePath, { encoding: 'utf8' });
  const parsed = YAML.load(raw) as any;
  if (!validate(parsed)) {
    throw new CliError(`Action file ${filePath} failed validation: ${JSON.stringify(validate.errors)}`, 1);
  }
  return parsed as Action;
}

export function discoverRepoActions(dir = '.waif/actions') {
  const root = resolve(dir);
  try {
    const files = readdirSync(root);
    return files
      .map((f) => join(root, f))
      .filter((p) => {
        try {
          return statSync(p).isFile() && (p.endsWith('.yml') || p.endsWith('.yaml'));
        } catch (e) {
          return false;
        }
      })
      .map((p) => ({ path: p, action: loadActionFromFile(p) }));
  } catch (e) {
    return [];
  }
}

export function findActionByName(name: string): { action: Action; source: string } | null {
  // 1) bundledActions - none for prototype
  // 2) repo-local
  const repo = discoverRepoActions();
  for (const r of repo) {
    if (r.action.name === name) return { action: r.action, source: r.path };
  }
  // 3) user-global
  const homeDir = process.env.HOME ? join(process.env.HOME, '.waif', 'actions') : null;
  if (homeDir) {
    try {
      const files = readdirSync(homeDir);
      for (const f of files) {
        const p = join(homeDir, f);
        if (f.endsWith('.yml') || f.endsWith('.yaml')) {
          const a = loadActionFromFile(p);
          if (a.name === name) return { action: a, source: p };
        }
      }
    } catch {}
  }

  return null;
}

function renderTemplate(s: string, ctx: { inputs: Record<string, string>; positional: string[] }) {
  return s.replace(/\$\{inputs\.([a-zA-Z0-9_\-]+)\}/g, (_m, key) => String(ctx.inputs[key] ?? '')).replace(/\$\{positional\[([0-9]+)\]\}/g, (_m, idx) => ctx.positional[Number(idx)] ?? '');
}

export function runAction(action: Action, positional: string[], inputs: Record<string, string>, dryRun = false) {
  // requires checks
  for (const r of action.requires ?? []) {
    ensureCliAvailable(r, `Install ${r} and ensure it is on PATH.`);
  }

  // safety checks
  if (action.safety?.require_clean_worktree) {
    if (!dryRun) requireCleanWorkingTree();
  }

  if (dryRun && action.safety?.dry_run_support === false) {
    throw new CliError('Action does not support --dry-run', 1);
  }

  const ctx = { inputs, positional };

  for (const step of action.runs) {
    if (dryRun) {
      // print what would run
      console.log('[dry-run] step:', JSON.stringify(step));
      continue;
    }

    if (step.type === 'shell') {
      const cmd = renderTemplate(step.cmd, ctx);
      execFileOrThrow('sh', ['-c', cmd]);
      continue;
    }

    if (step.type === 'bd') {
      const cmd = renderTemplate(step.cmd, ctx);
      // naive split
      const args = cmd.split(/\s+/).filter(Boolean);
      runBdSync(args);
      continue;
    }

    // noop or unknown
  }
}
