import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { expect, test, beforeEach, afterEach, vi } from 'vitest';
import { run } from '../src/index.js';
import * as askCmd from '../src/commands/ask.js';

const originalEnv = { ...process.env };

// Helper to assert tmux-removed behavior when runtime tmux calls are not mocked
async function expectTmuxRemovedExit(argv: string[]) {
  // capture stderr by spying on process.stderr.write
  const writes: string[] = [];
  const origWrite = process.stderr.write;
  // @ts-ignore
  process.stderr.write = (chunk: any) => { writes.push(String(chunk)); return true; };
  try {
    const code = await run(argv);
    expect(code).not.toBe(0);
    const joined = writes.join('');
    expect(joined).toContain('TMUX integration has been removed');
  } finally {
    // @ts-ignore
    process.stderr.write = origWrite;
  }
}


beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = { ...originalEnv };
});

test('ask command errors when tmux integration is invoked', async () => {
  const logDir = mkdtempSync(join(tmpdir(), 'waif-ask-log-'));
  process.env.WAIF_LOG_DIR = logDir;
  // No provider injected: runtime should surface the tmux-removed error if it attempts to use tmux.
  // We assert the CLI exits non-zero and does not write a log.
  const code = await run(['ask', 'Hello world']);
  expect(code).not.toBe(0);
  // Ensure no log file created
  const logPath = join(logDir, 'ask.log');
  expect(() => readFileSync(logPath, 'utf8')).toThrow();
  rmSync(logDir, { recursive: true, force: true });
});

test('ask errors when tmux integration is invoked after agent parsing', async () => {
  const logDir = mkdtempSync(join(tmpdir(), 'waif-ask-log-'));
  process.env.WAIF_LOG_DIR = logDir;
  // No provider injected: runtime should surface the tmux-removed error even after parsing agent name.
  const code = await run(['ask', 'map', 'to', 'hello', 'world']);
  expect(code).not.toBe(0);
  // Ensure no log file created
  const logPath = join(logDir, 'ask.log');
  expect(() => readFileSync(logPath, 'utf8')).toThrow();
  rmSync(logDir, { recursive: true, force: true });
});

test('ask errors when no agent name provided and tmux would be used', async () => {
  const logDir = mkdtempSync(join(tmpdir(), 'waif-ask-log-'));
  process.env.WAIF_LOG_DIR = logDir;
  // No provider injected: runtime should surface the tmux-removed error
  const code = await run(['ask', 'to', 'be', 'or', 'not', 'to', 'be']);
  expect(code).not.toBe(0);
  const logPath = join(logDir, 'ask.log');
  expect(() => readFileSync(logPath, 'utf8')).toThrow();
  rmSync(logDir, { recursive: true, force: true });
});

test('ask errors when tmux integration would be used for other word patterns', async () => {
  const logDir = mkdtempSync(join(tmpdir(), 'waif-ask-log-'));
  process.env.WAIF_LOG_DIR = logDir;
  // No provider injected: runtime should surface the tmux-removed error
  const code = await run(['ask', 'map', 'hello', 'world']);
  expect(code).not.toBe(0);
  const logPath = join(logDir, 'ask.log');
  expect(() => readFileSync(logPath, 'utf8')).toThrow();
  rmSync(logDir, { recursive: true, force: true });
});

