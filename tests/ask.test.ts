import { mkdtempSync, readFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { expect, test, beforeEach, afterEach } from 'vitest';
import { run } from '../src/index.js';
import { setTmuxProvider } from '../src/lib/tmux-provider.js';

// Tests expect the tmux runtime to be removed. These tests assert that invoking
// commands that would previously use tmux now surface a user-facing error and
// return a non-zero exit code. We keep the tests minimal and hermetic.

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = { ...originalEnv };
});

test('ask command errors when tmux integration is invoked', async () => {
  const logDir = mkdtempSync(join(tmpdir(), 'waif-ask-log-'));
  process.env.WAIF_LOG_DIR = logDir;
<<<<<<< HEAD

  // No provider injected: runtime should surface the tmux-removed error if it
  // attempts to use tmux. We assert the CLI exits non-zero and does not write a log.
=======
  // Use provider mock instead of env shim
  setTmuxProvider({
    listPanes: () => [{ id: 'waif-workflow:core.0', title: 'Map (PM)', session: 'waif-workflow', window: 'core' }],
    findPaneForAgent: (_a: any) => 'waif-workflow:core.0',
    sendKeysToPane: (_paneId: string, _prompt: string, _agentName: string) => undefined,
  });
  // ensure agent resolution uses default map -> Map (PM)
>>>>>>> origin/wf-b6fz.1/add-tmux-provider
  const code = await run(['ask', 'Hello world']);
  // tmux integration has been removed; command should return non-zero
  expect(code).toBeGreaterThan(0);
  const logPath = join(logDir, 'ask.log');
  expect(existsSync(logPath)).toBe(false);
  rmSync(logDir, { recursive: true, force: true });
});

test('ask errors when tmux integration is invoked after agent parsing', async () => {
  const logDir = mkdtempSync(join(tmpdir(), 'waif-ask-log-'));
  process.env.WAIF_LOG_DIR = logDir;
<<<<<<< HEAD

=======
  setTmuxProvider({
    listPanes: () => [{ id: 'waif-workflow:core.0', title: 'Map (PM)', session: 'waif-workflow', window: 'core' }],
    findPaneForAgent: (_a: any) => 'waif-workflow:core.0',
    sendKeysToPane: (_paneId: string, _prompt: string, _agentName: string) => undefined,
  });

  // "map to hello world" -> agent: map, prompt: "hello world"
>>>>>>> origin/wf-b6fz.1/add-tmux-provider
  const code = await run(['ask', 'map', 'to', 'hello', 'world']);
  expect(code).toBeGreaterThan(0);
  const logPath = join(logDir, 'ask.log');
  expect(existsSync(logPath)).toBe(false);
  rmSync(logDir, { recursive: true, force: true });
});

test('ask errors when no agent name provided and tmux would be used', async () => {
  const logDir = mkdtempSync(join(tmpdir(), 'waif-ask-log-'));
  process.env.WAIF_LOG_DIR = logDir;
<<<<<<< HEAD

=======
  setTmuxProvider({
    listPanes: () => [{ id: 'waif-workflow:core.0', title: 'Map (PM)', session: 'waif-workflow', window: 'core' }],
    findPaneForAgent: (_a: any) => 'waif-workflow:core.0',
    sendKeysToPane: (_paneId: string, _prompt: string, _agentName: string) => undefined,
  });

  // "to be or not to be" -> agent: map (default), prompt: "to be or not to be"
>>>>>>> origin/wf-b6fz.1/add-tmux-provider
  const code = await run(['ask', 'to', 'be', 'or', 'not', 'to', 'be']);
  expect(code).toBeGreaterThan(0);
  const logPath = join(logDir, 'ask.log');
  expect(existsSync(logPath)).toBe(false);
  rmSync(logDir, { recursive: true, force: true });
});

test('ask errors when tmux integration would be used for other word patterns', async () => {
  const logDir = mkdtempSync(join(tmpdir(), 'waif-ask-log-'));
  process.env.WAIF_LOG_DIR = logDir;
<<<<<<< HEAD

=======
  setTmuxProvider({
    listPanes: () => [{ id: 'waif-workflow:core.0', title: 'Map (PM)', session: 'waif-workflow', window: 'core' }],
    findPaneForAgent: (_a: any) => 'waif-workflow:core.0',
    sendKeysToPane: (_paneId: string, _prompt: string, _agentName: string) => undefined,
  });

  // "map hello world" -> agent: map, prompt: "hello world"
>>>>>>> origin/wf-b6fz.1/add-tmux-provider
  const code = await run(['ask', 'map', 'hello', 'world']);
  expect(code).toBeGreaterThan(0);
  const logPath = join(logDir, 'ask.log');
  expect(existsSync(logPath)).toBe(false);
  rmSync(logDir, { recursive: true, force: true });
});
