import { readFile } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import Ajv, { type ErrorObject, type Options as AjvOptions, type ValidateFunction } from 'ajv';
import cronParser from 'cron-parser';
import schema from './schemas/ooda-scheduler.schema.json' with { type: 'json' };
import { redactSecrets } from './redact.js';

export interface Job {
  id: string;
  name: string;
  command: string;
  schedule: string;
  cwd?: string;
  env?: Record<string, string>;
  capture?: Array<'stdout' | 'stderr'>;
  redact?: boolean;
  timeout_seconds?: number;
  retention?: {
    keep_last?: number;
  };
}

export interface Config {
  jobs: Job[];
}

type ValidationError = { path: string; message: string };

// Ajv constructor cast workaround
const AjvClass = Ajv as unknown as { new(options?: AjvOptions): any };
const ajv = new AjvClass({ allErrors: true, strict: true, allowUnionTypes: true });
const validate = ajv.compile(schema) as ValidateFunction<Config>;

export function validateConfig(obj: unknown): { valid: boolean; errors?: ValidationError[] } {
  const ok = validate(obj);
  if (ok) return { valid: true };

  const errors = ((validate.errors ?? []) as ErrorObject[]).map((err) => formatAjvError(err, obj));
  return { valid: false, errors };
}

function formatAjvError(err: ErrorObject, root: unknown): ValidationError {
  const pathStr = buildPath(err.instancePath, root);
  const message = redactSecrets(err.message ?? 'invalid configuration');
  return { path: pathStr, message };
}

function buildPath(instancePath: string | undefined, root: unknown): string {
  const parts = instancePath ? instancePath.split('/').filter(Boolean) : [];
  if (parts[0] === 'jobs' && parts.length >= 2) {
    const idx = Number(parts[1]);
    const rest = parts.slice(2).join('.') || '<root>';
    const jobId = getJobId(root, idx);
    const base = jobId ? `jobs[${idx}] (id:${jobId})` : `jobs[${idx}]`;
    return rest === '<root>' ? base : `${base}.${rest}`;
  }
  return parts.length ? parts.join('.') : '<root>';
}

function getJobId(root: unknown, idx: number): string | undefined {
  if (!root || typeof root !== 'object') return undefined;
  const jobs = (root as { jobs?: unknown }).jobs;
  if (!Array.isArray(jobs)) return undefined;
  const job = jobs[idx];
  if (job && typeof (job as { id?: unknown }).id === 'string') return (job as { id: string }).id;
  return undefined;
}

function formatCronError(job: Job, idx: number, err: unknown): ValidationError {
  const message = err instanceof Error ? err.message : 'invalid cron expression';
  const safeMsg = redactSecrets(message);
  const jobId = job.id || `job-${idx}`;
  return { path: `jobs[${idx}] (id:${jobId}).schedule`, message: safeMsg };
}

function validateCronExpressions(config: Config): ValidationError[] {
  const cronErrors: ValidationError[] = [];
  // Resolve parse function robustly to handle ESM/CJS interop variations in test runtimes
  const tryParse = (() => {
    const anyParser = cronParser as any;
    if (typeof anyParser.parseExpression === 'function') return anyParser.parseExpression.bind(anyParser);
    if (anyParser && typeof anyParser.default === 'function') return anyParser.default;
    if (anyParser && typeof anyParser.default?.parseExpression === 'function') return anyParser.default.parseExpression.bind(anyParser.default);
    if (typeof anyParser === 'function') return anyParser;
    return null;
  })();

  config.jobs.forEach((job, idx) => {
    try {
      if (!tryParse) throw new Error('cron-parser parse function not found in runtime');
      // call the resolved parser; some runtimes export a class that must be constructed with `new`
      try {
        // First attempt: call as a function
        tryParse(job.schedule);
      } catch (callErr: any) {
        // If callErr indicates the export is a class, try constructing
        const msg = String(callErr?.message || '');
        if (msg.includes("cannot be invoked without 'new'") || msg.includes('Class constructor')) {
          // try construct
          try {
            // eslint-disable-next-line new-cap
            new (tryParse as any)(job.schedule);
          } catch (newErr) {
            throw newErr;
          }
        } else {
          throw callErr;
        }
      }
    } catch (e) {
      cronErrors.push(formatCronError(job, idx, e));
    }
  });
  return cronErrors;
}

export async function loadConfig(configPath = path.resolve('.waif/ooda-scheduler.yaml')): Promise<Config> {
  const file = await readFile(configPath, 'utf8');
  const parsed = yaml.load(file);
  const { valid, errors } = validateConfig(parsed);

  let cronErrors: ValidationError[] = [];
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Config).jobs)) {
    cronErrors = validateCronExpressions(parsed as Config);
  }

  const allErrors = [...(errors ?? []), ...cronErrors];
  if (allErrors.length > 0) {
    const msg = allErrors.map((e) => `${e.path}: ${e.message}`).join('\n');
    throw new Error(msg);
  }

  if (!valid) {
    throw new Error('invalid configuration');
  }

  return parsed as Config;
}
