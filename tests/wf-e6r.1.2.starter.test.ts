import { describe, it, expect } from 'vitest';
import { Scheduler, nextRun } from '../src/lib/scheduler.js';

describe('wf-e6r.1.2 starter', () => {
  it('computes a next run after the base time', () => {
    const base = new Date('2026-01-01T00:00:00Z');
    const nr = nextRun('*/5 * * * * *', base);
    expect(nr.getTime()).toBeGreaterThan(base.getTime());
  });

  it('emits run for job added after start', async () => {
    const sched = new Scheduler([], { checkIntervalMs: 50 });

    const gotRun = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        sched.dispose();
        reject(new Error('timed out waiting for run event'));
      }, 2000);

      sched.on('run', (job) => {
        try {
          expect((job as any).id).toBe('late');
          clearTimeout(timeout);
          sched.dispose();
          resolve();
        } catch (err) {
          clearTimeout(timeout);
          sched.dispose();
          reject(err);
        }
      });
    });

    sched.start();
    sched.add({ id: 'late', schedule: '* * * * * *' });

    await gotRun;
  });
});
