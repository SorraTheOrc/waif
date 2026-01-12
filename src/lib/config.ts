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
  const errors: ValidationError[] = [];

  if (!ok) {
    errors.push(...(((validate.errors ?? []) as ErrorObject[]).map((err) => formatAjvError(err, obj))));
  }

  if (obj && typeof obj === 'object' && Array.isArray((obj as Config).jobs)) {
    (obj as Config).jobs.forEach((job, idx) => {
      const jobId = (job as Job | undefined)?.id;

      const schedule = (job as Job | undefined)?.schedule;
      if (typeof schedule !== 'string' || schedule.trim() === '') {
        const path = jobId ? `jobs[${idx}] (id:${jobId}).schedule` : `jobs[${idx}].schedule`;
        errors.push({ path, message: 'schedule is required' });
      }

      const command = (job as Job | undefined)?.command;
      if (typeof command !== 'string' || command.trim() === '') {
        const path = jobId ? `jobs[${idx}] (id:${jobId}).command` : `jobs[${idx}].command`;
        errors.push({ path, message: 'command is required' });
      }

      const name = (job as Job | undefined)?.name;
      if (typeof name !== 'string' || name.trim() === '') {
        const path = jobId ? `jobs[${idx}] (id:${jobId}).name` : `jobs[${idx}].name`;
        errors.push({ path, message: 'name is required' });
      }
    });
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true };
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
  const parseCron = (() => {
    const anyParser = cronParser as any;
    if (typeof anyParser?.parse === 'function') return (expr: string) => anyParser.parse(expr, { strict: false });
    if (typeof anyParser?.parseExpression === 'function') return anyParser.parseExpression.bind(anyParser);
    if (typeof anyParser?.default?.parse === 'function') return (expr: string) => anyParser.default.parse(expr, { strict: false });
    if (typeof anyParser?.default?.parseExpression === 'function') return anyParser.default.parseExpression.bind(anyParser.default);
    if (typeof anyParser === 'function') {
      return (expr: string) => {
        try {
          return anyParser(expr);
        } catch (callErr: any) {
          const msg = String(callErr?.message || '');
          if (msg.includes("cannot be invoked without 'new'") || msg.includes('Class constructor')) {
            // eslint-disable-next-line new-cap
            return new anyParser(expr);
          }
          throw callErr;
        }
      };
    }
    return null;
  })();

  config.jobs.forEach((job, idx) => {
    try {
      if (!parseCron) throw new Error('cron-parser parse function not found in runtime');
      if (!job.schedule || typeof job.schedule !== 'string' || job.schedule.trim() === '') {
        throw new Error('schedule is required');
      }
      parseCron(job.schedule);
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
