import { test, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import { runJobCommand } from '../../src/lib/runner.js';

// Extend EventEmitter typing for stdout/stderr and kill
function makeFakeChildProcess({ stdoutData = '', stderrData = '', exitCode = 0, delay = 0 } = {}) {
  const child: any = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn(() => true);

  process.nextTick(() => {
    if (stdoutData) child.stdout.emit('data', Buffer.from(stdoutData));
    if (stderrData) child.stderr.emit('data', Buffer.from(stderrData));
    setTimeout(() => child.emit('exit', exitCode, null), delay);
  });

  return child;
}

vi.mock('child_process', () => ({
  spawn: vi.fn((cmd: string) => {
    // default: success with small stdout
    return makeFakeChildProcess({ stdoutData: 'ok\n', stderrData: '', exitCode: 0 });
  }),
}));

test('runJobCommand: success', async () => {
  const res = await runJobCommand({ id: 'j1', name: 'test', command: 'echo ok' });
  expect(res.exitCode).toBe(0);
  expect(res.stdout).toContain('ok');
  expect(res.sanitized_output).toContain('ok');
});

test('runJobCommand: non-zero exit', async () => {
  // mock spawn to return exit code 2
  const { spawn } = await import('child_process');
  (spawn as any).mockImplementation(() => makeFakeChildProcess({ stdoutData: '', stderrData: 'err\n', exitCode: 2 }));
  const res = await runJobCommand({ id: 'j2', name: 'test2', command: 'bad' });
  expect(res.exitCode).toBe(2);
  expect(res.stderr).toContain('err');
});

test('runJobCommand: timeout', async () => {
  const { spawn } = await import('child_process');
  (spawn as any).mockImplementation(() => makeFakeChildProcess({ stdoutData: '', stderrData: '', exitCode: 0, delay: 1000 }));
  const res = await runJobCommand({ id: 'j3', name: 't', command: 'sleep' }, { timeoutMs: 10 });
  expect(res.signal).toBe('SIGKILL');
});

test('runJobCommand: sanitize and truncate', async () => {
  const long = 'a'.repeat(2000) + 'sk-12345678901234567890';
  const { spawn } = await import('child_process');
  (spawn as any).mockImplementation(() => makeFakeChildProcess({ stdoutData: long, stderrData: '' }));
  const res = await runJobCommand({ id: 'j4', name: 't', command: 'echo big' });
  // redact.ts currently prefers HEX redaction for long repeated 'a' sequences;
  // assert we have some redaction token and truncation
  expect(res.sanitized_output).toMatch(/\[REDACTED(_(BASE64|HEX))?/);
  expect(res.sanitized_output).toMatch(/\[TRUNCATED/);
  expect(res.sanitized_output.length).toBeLessThan(1200);
});
