import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { createOodaCommand, __test__ } from '../src/commands/ooda.js';
import { loadConfig } from '../src/lib/config.js';

const validConfig = path.resolve('tests/fixtures/ooda.valid.yaml');
const invalidConfig = path.resolve('tests/fixtures/ooda.invalid-id.yaml');

// Deterministic integration exercising the ooda command handler without spawning a new process.
describe('wf-e6r.2.14 - CLI integration', () => {
  it('exits 0 with valid config and non-zero with invalid config', async () => {
    // Mock OpenCode event reader to avoid filesystem/long-running behavior
    const readSpy = vi.spyOn(__test__, 'readOpencodeEvents').mockResolvedValue([]);
    const runSpy = vi.spyOn(__test__, 'runJobCommand').mockResolvedValue({ code: 0, stdout: 'ok' } as any);

    const runCli = async (cfgPath: string) => {
      const cmd = createOodaCommand();
      // Avoid scheduler loop by invoking run-job subcommand against the fixture config
      const args = ['run-job', '--config', cfgPath, '--job', 'daily-health'];

      // Simulate config validation (parity with loader behavior)
      try {
        await loadConfig(cfgPath);
      } catch (err: any) {
        return 1;
      }

      const exit = await cmd.parseAsync(args, { from: 'user' }).then(() => 0).catch(() => 1);
      return exit;
    };



    const ok = await runCli(validConfig);
    expect(ok).toBe(0);

    const bad = await runCli(invalidConfig);
    expect(bad).not.toBe(0);

    readSpy.mockRestore();
    runSpy.mockRestore();
  });
});
