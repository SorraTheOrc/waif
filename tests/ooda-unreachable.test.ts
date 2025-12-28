import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const originalFetch = globalThis.fetch;

describe('opencode connectivity failures', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    delete (process as any).env.OPENCODE_HOST;
    delete (process as any).env.OPENCODE_PORT;
  });

  it('throws when event source lacks subscribe', async () => {
    const bogusSource = { stream: { write: () => {} } } as any;
    const { subscribeToOpencodeEvents } = await import('../src/lib/opencode.js');
    await expect(subscribeToOpencodeEvents(['agent.started'], () => {}, { source: bogusSource, debug: true })).rejects.toThrow(
      /events API not available/i,
    );
  });

  it('propagates subscribe errors when source rejects', async () => {
    const source = {
      subscribe: vi.fn().mockRejectedValue(new Error('ECONNREFUSED connect')),
    } as any;

    const { subscribeToOpencodeEvents } = await import('../src/lib/opencode.js');

    await expect(subscribeToOpencodeEvents(['agent.started'], () => {}, { source })).rejects.toThrow(/ECONNREFUSED/i);
  });

  it('fails fast when client cannot reach OpenCode server', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:4096')) as any;

    vi.mock('@opencode-ai/sdk', () => {
      const createOpencodeClient = vi.fn().mockResolvedValue({
        app: {
          agents: vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:4096')),
        },
      });
      return { createOpencodeClient };
    });

    const { ensureClient } = await import('../src/lib/opencode.js');

    await expect(ensureClient()).rejects.toThrow(/Unable to reach OpenCode server|ECONNREFUSED/i);
  });
});
