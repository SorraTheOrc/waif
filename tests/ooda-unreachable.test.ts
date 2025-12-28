import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const originalFetch = globalThis.fetch;

describe('opencode connectivity (basic)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    delete (process as any).env.OPENCODE_HOST;
    delete (process as any).env.OPENCODE_PORT;
  });

  it('gracefully returns undefined when OpenCode client cannot be created', async () => {
    // Simulate network failure
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:4096')) as any;

    vi.mock('@opencode-ai/sdk', () => {
      const createOpencodeClient = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:4096'));
      return { createOpencodeClient };
    });

    const { ensureClient } = await import('../src/lib/opencode.js');

    await expect(ensureClient()).resolves.toBeUndefined();
  });
});
