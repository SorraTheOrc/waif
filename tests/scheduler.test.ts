import { describe, it, expect } from 'vitest';
import { nextRun, Scheduler } from '../src/lib/scheduler.js';

describe('scheduler nextRun', () => {
  it('computes next run for simple cron', () => {
    const base = new Date('2026-01-01T00:00:00Z');
    const nr = nextRun('*/5 * * * * *', base); // every 5 seconds
    expect(nr.getTime()).toBeGreaterThan(base.getTime());
  });
});

describe('Scheduler emits run events', () => {
  it('emits run for a job scheduled immediately', async () => {
    const job = { id: 'j1', schedule: '* * * * * *' };
    const sched = new Scheduler([job], { checkIntervalMs: 50 });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        sched.dispose();
        reject(new Error('timed out waiting for run event'));
      }, 3000);

      sched.on('run', (j) => {
        try {
          expect((j as any).id).toBe('j1');
          clearTimeout(timeout);
          sched.dispose();
          resolve();
        } catch (e) {
          clearTimeout(timeout);
          sched.dispose();
          reject(e);
        }
      });

      sched.start();
    });
  });

  it('schedules newly added jobs after start', async () => {
    const initialJob = { id: 'j1', schedule: '0 0 1 1 *' }; // far in future
    const newJob = { id: 'j2', schedule: '* * * * * *' };
    const sched = new Scheduler([initialJob], { checkIntervalMs: 50 });

    const gotRun = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        sched.dispose();
        reject(new Error('timed out waiting for run event'));
      }, 3000);

      sched.on('run', (j) => {
        if ((j as any).id !== 'j2') return;
        try {
          clearTimeout(timeout);
          sched.dispose();
          resolve();
        } catch (e) {
          clearTimeout(timeout);
          sched.dispose();
          reject(e);
        }
      });
    });

    sched.start();
    sched.add(newJob);

    await gotRun;
  });
});
