import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';

import WaifOodaPlugin, { subscribe } from '../.opencode/plugin/waif-ooda.ts';

describe('waif-ooda plugin subscription API', () => {
  it('invokes subscribed handlers when an event is logged and stops invoking after unsubscribe', async () => {
    const tmpDir = path.join('/tmp', `waif-ooda-subscribe-${Date.now()}`);
    // create plugin instance with custom base dir so it writes outside the repo
    const plugin = await WaifOodaPlugin({ directory: tmpDir } as any);

    const received: any[] = [];
    const handler = (obj: any) => {
      received.push(obj);
    };

    // subscribe and ensure the returned unsubscribe function works
    const unsub = subscribe(handler);

    // trigger an event via the generic event handler
    await plugin.event({ event: { type: 'test.event', properties: { agent: 't1', info: { title: 't1-run' } } } });

    expect(received.length).toBeGreaterThan(0);
    expect(received[0].type).toBe('test.event');
    expect(received[0].properties).toBeDefined();

    // now unsubscribe
    unsub();

    // clear and trigger again
    received.length = 0;
    await plugin.event({ event: { type: 'test.event2', properties: { agent: 't2' } } });
    // handler should not be invoked
    expect(received.length).toBe(0);

    // cleanup: attempt to remove temp log dir if present
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (e) {
      // ignore
    }
  });
});
