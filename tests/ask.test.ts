import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { expect, test, beforeEach, afterEach } from 'vitest';
import { run } from '../src/index.js';
import { setTmuxProvider } from '../src/lib/tmux-provider.js';

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = { ...originalEnv };
});

test('ask command sends prompt to mapped tmux pane and logs', async () => {
  const logDir = mkdtempSync(join(tmpdir(), 'waif-ask-log-'));
  process.env.WAIF_LOG_DIR = logDir;
  // Use provider mock instead of env shim
  setTmuxProvider({
    listPanes: () => [{ id: 'waif-workflow:core.0', title: 'Map (PM)', session: 'waif-workflow', window: 'core' }],
    findPaneForAgent: (_a: any) => 'waif-workflow:core.0',
    sendKeysToPane: (_paneId: string, _prompt: string, _agentName: string) => undefined,
  });
  // ensure agent resolution uses default map -> Map (PM)
  const code = await run(['ask', 'Hello world']);
  expect(code).toBe(0);
  const logPath = join(logDir, 'ask.log');
  const log = readFileSync(logPath, 'utf8');
  expect(log).toContain('Hello world');
  rmSync(logDir, { recursive: true, force: true });
});

test('ask removes "to" after agent name', async () => {
  const logDir = mkdtempSync(join(tmpdir(), 'waif-ask-log-'));
  process.env.WAIF_LOG_DIR = logDir;
  setTmuxProvider({
    listPanes: () => [{ id: 'waif-workflow:core.0', title: 'Map (PM)', session: 'waif-workflow', window: 'core' }],
    findPaneForAgent: (_a: any) => 'waif-workflow:core.0',
    sendKeysToPane: (_paneId: string, _prompt: string, _agentName: string) => undefined,
  });

  // "map to hello world" -> agent: map, prompt: "hello world"
  const code = await run(['ask', 'map', 'to', 'hello', 'world']);
  expect(code).toBe(0);
  
  const logPath = join(logDir, 'ask.log');
  const log = readFileSync(logPath, 'utf8');
  const entry = JSON.parse(log);
  expect(entry.agent).toBe('map');
  expect(entry.prompt).toBe('hello world');
  
  rmSync(logDir, { recursive: true, force: true });
});

test('ask does not remove "to" if no agent name provided', async () => {
  const logDir = mkdtempSync(join(tmpdir(), 'waif-ask-log-'));
  process.env.WAIF_LOG_DIR = logDir;
  setTmuxProvider({
    listPanes: () => [{ id: 'waif-workflow:core.0', title: 'Map (PM)', session: 'waif-workflow', window: 'core' }],
    findPaneForAgent: (_a: any) => 'waif-workflow:core.0',
    sendKeysToPane: (_paneId: string, _prompt: string, _agentName: string) => undefined,
  });

  // "to be or not to be" -> agent: map (default), prompt: "to be or not to be"
  const code = await run(['ask', 'to', 'be', 'or', 'not', 'to', 'be']);
  expect(code).toBe(0);
  
  const logPath = join(logDir, 'ask.log');
  const log = readFileSync(logPath, 'utf8');
  const entry = JSON.parse(log);
  expect(entry.agent).toBe('map');
  expect(entry.prompt).toBe('to be or not to be');
  
  rmSync(logDir, { recursive: true, force: true });
});

test('ask does not remove other words after agent name', async () => {
  const logDir = mkdtempSync(join(tmpdir(), 'waif-ask-log-'));
  process.env.WAIF_LOG_DIR = logDir;
  setTmuxProvider({
    listPanes: () => [{ id: 'waif-workflow:core.0', title: 'Map (PM)', session: 'waif-workflow', window: 'core' }],
    findPaneForAgent: (_a: any) => 'waif-workflow:core.0',
    sendKeysToPane: (_paneId: string, _prompt: string, _agentName: string) => undefined,
  });

  // "map hello world" -> agent: map, prompt: "hello world"
  const code = await run(['ask', 'map', 'hello', 'world']);
  expect(code).toBe(0);
  
  const logPath = join(logDir, 'ask.log');
  const log = readFileSync(logPath, 'utf8');
  const entry = JSON.parse(log);
  expect(entry.agent).toBe('map');
  expect(entry.prompt).toBe('hello world');
  
  rmSync(logDir, { recursive: true, force: true });
});
