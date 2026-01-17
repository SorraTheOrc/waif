import { mkdtempSync, readFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { expect, test, beforeEach, afterEach } from 'vitest';
import { run } from '../src/index.js';

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

  const code = await run(['ask', 'map', 'to', 'hello', 'world']);
  expect(code).toBeGreaterThan(0);
  const logPath = join(logDir, 'ask.log');
  expect(existsSync(logPath)).toBe(false);
  rmSync(logDir, { recursive: true, force: true });
});

test('ask errors when no agent name provided and tmux would be used', async () => {
  const logDir = mkdtempSync(join(tmpdir(), 'waif-ask-log-'));
  process.env.WAIF_LOG_DIR = logDir;

  const code = await run(['ask', 'to', 'be', 'or', 'not', 'to', 'be']);
  expect(code).toBeGreaterThan(0);
  const logPath = join(logDir, 'ask.log');
  expect(existsSync(logPath)).toBe(false);
  rmSync(logDir, { recursive: true, force: true });
});

test('ask errors when tmux integration would be used for other word patterns', async () => {
  const logDir = mkdtempSync(join(tmpdir(), 'waif-ask-log-'));
  process.env.WAIF_LOG_DIR = logDir;

  const code = await run(['ask', 'map', 'hello', 'world']);
  expect(code).toBeGreaterThan(0);
  const logPath = join(logDir, 'ask.log');
  expect(existsSync(logPath)).toBe(false);
  rmSync(logDir, { recursive: true, force: true });
});
