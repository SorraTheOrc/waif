import EventEmitter from 'node:events';
import cronParser from 'cron-parser';

export interface SimpleJob {
  id: string;
  name?: string;
  schedule: string;
  [k: string]: unknown;
}

function resolveParser() {
  const anyParser = cronParser as any;
  if (typeof anyParser?.parse === 'function') return (expr: string, opts: any) => anyParser.parse(expr, opts);
  if (typeof anyParser?.parseExpression === 'function') return anyParser.parseExpression.bind(anyParser);
  if (typeof anyParser?.default?.parse === 'function') return (expr: string, opts: any) => anyParser.default.parse(expr, opts);
  if (typeof anyParser?.default?.parseExpression === 'function') return anyParser.default.parseExpression.bind(anyParser.default);
  if (typeof anyParser === 'function') {
    return (expr: string, opts: any) => {
      try {
        return anyParser(expr, opts);
      } catch (callErr: any) {
        const msg = String(callErr?.message || '');
        if (msg.includes("cannot be invoked without 'new'") || msg.includes('Class constructor')) {
          // eslint-disable-next-line new-cap
          return new anyParser(expr, opts);
        }
        throw callErr;
      }
    };
  }
  return null;
}

const parser = resolveParser();

export function nextRun(schedule: string, fromDate = new Date()): Date {
  if (!parser) throw new Error('cron-parser parse function not found in runtime');
  const expr = parser(schedule, { currentDate: fromDate, strict: false });
  // cron-parser iterator/expr.next() shapes vary between versions; handle common forms
  const maybeNext = expr.next ? expr.next() : null;
  if (!maybeNext) throw new Error('failed to compute next run');

  // many shapes return an object with toDate() or a Date directly
  if (typeof maybeNext.toDate === 'function') return maybeNext.toDate();
  if (maybeNext instanceof Date) return maybeNext;
  if (maybeNext.value && typeof maybeNext.value.toDate === 'function') return maybeNext.value.toDate();
  if (maybeNext.value && maybeNext.value instanceof Date) return maybeNext.value;

  // fallback: try calling toString -> Date
  try {
    return new Date(String(maybeNext));
  } catch (e) {
    throw new Error('unable to interpret next run result');
  }
}

export class Scheduler extends EventEmitter {
  private jobs: SimpleJob[];
  private nextRuns: Map<string, Date>;
  private interval?: NodeJS.Timeout;
  private checkIntervalMs: number;

  constructor(jobs: SimpleJob[] = [], opts?: { checkIntervalMs?: number }) {
    super();
    this.jobs = jobs.slice();
    this.nextRuns = new Map();
    this.checkIntervalMs = opts?.checkIntervalMs ?? 1000;
  }

  public add(job: SimpleJob) {
    this.jobs.push(job);
    this.nextRuns.delete(job.id);
    if (this.interval) {
      try {
        this.nextRuns.set(job.id, nextRun(job.schedule, new Date()));
      } catch (e) {
        // ignore parse errors; caller should validate schedule
      }
    }
  }

  public start() {
    // initialize next runs
    const now = new Date();
    for (const j of this.jobs) {
      try {
        const nr = nextRun(j.schedule, now);
        this.nextRuns.set(j.id, nr);
      } catch (e) {
        // ignore schedule parse failures here; callers should validate configs first
      }
    }

    if (this.interval) return;
    this.interval = setInterval(() => {
      const nowTick = new Date();
      for (const j of this.jobs) {
        const nr = this.nextRuns.get(j.id);
        if (!nr) continue;
        if (nr.getTime() <= nowTick.getTime()) {
          // emit run and schedule next
          try {
            this.emit('run', j);
          } finally {
            try {
              const nextAfter = nextRun(j.schedule, new Date(nowTick.getTime() + 1));
              this.nextRuns.set(j.id, nextAfter);
            } catch (err) {
              // if computing next fails, remove job from schedule
              this.nextRuns.delete(j.id);
            }
          }
        }
      }
    }, this.checkIntervalMs);
  }

  public stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  public dispose() {
    this.stop();
    this.removeAllListeners();
  }
}
