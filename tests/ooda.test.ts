import { describe, expect, it } from 'vitest';
import { classify, __test__, writeSnapshots } from '../src/commands/ooda.js';

const { readOpencodeEvents } = __test__;

describe('ooda classify', () => {
  it('marks busy for keywords and bd ids', () => {
    expect(classify('Map busy wf-cvz')).toEqual({ status: 'Busy', reason: 'keyword' });
    expect(classify('agent running')).toEqual({ status: 'Busy', reason: 'keyword' });
    expect(classify('map-wf-cvz.1')).toEqual({ status: 'Busy', reason: 'keyword' });
  });

  it('marks free for idle/empty titles', () => {
    expect(classify('idle')).toEqual({ status: 'Free', reason: 'idle-title' });
    expect(classify('   ')).toEqual({ status: 'Free', reason: 'idle-title' });
  });

  it('uses process signals when no keywords', () => {
    expect(classify('doing stuff', 'R', '0.0')).toEqual({ status: 'Busy', reason: 'process-state' });
    expect(classify('doing stuff', 'S', '1.2')).toEqual({ status: 'Busy', reason: 'process-cpu' });
    expect(classify('doing stuff', 'S', '0.0')).toEqual({ status: 'Free', reason: 'process-idle' });
  });

  it('falls back to free', () => {
    expect(classify('unknown title')).toEqual({ status: 'Free', reason: 'fallback' });
  });
});

describe('ooda readOpencodeEvents', () => {
  it('returns empty array for missing file', async () => {
    expect(await readOpencodeEvents('/tmp/does-not-exist.jsonl')).toEqual([]);
  });

  it('keeps only the latest per agent while parsing and skips invalid', async () => {
    const tmp = `/tmp/ooda-test-${Date.now()}.jsonl`;
    const lines = [
      '{"type":"start","properties":{"agent":"a","seq":1}}',
      'not json',
      '{"type":"start","properties":{"agent":"b","seq":1}}',
      '{"type":"update","properties":{"agent":"a","seq":2}}',
      '{"type":"update","properties":{"agent":"b","seq":2}}',
    ];
    require('fs').writeFileSync(tmp, lines.join('\n'), 'utf8');
    const result = await readOpencodeEvents(tmp);
    expect(result).toHaveLength(2);
    const agents = result.map((r) => r?.properties?.agent).sort();
    expect(agents).toEqual(['a', 'b']);
    const a = result.find((r) => r?.properties?.agent === 'a');
    const b = result.find((r) => r?.properties?.agent === 'b');
    expect(a).toEqual({ type: 'update', properties: { agent: 'a', seq: 2 } });
    expect(b).toEqual({ type: 'update', properties: { agent: 'b', seq: 2 } });
    require('fs').unlinkSync(tmp);
  });
});

// New test for snapshot logging and redaction
describe('ooda snapshots', () => {
  it('writes sanitized snapshot lines to log', () => {
    /* writeSnapshots imported above */
    const tmp = `/tmp/ooda-snap-${Date.now()}.jsonl`;
    // ensure file does not exist
    try { require('fs').unlinkSync(tmp); } catch (e) {}
    const rows = [
      { pane: 'agent-a', title: 'doing secret run sk-abcdef1234567890', status: 'Busy', reason: 'opencode-event' },
      { pane: 'agent-b', title: 'idle', status: 'Free', reason: 'opencode-event' },
    ];
    writeSnapshots(tmp, rows);
    const content = require('fs').readFileSync(tmp, 'utf8').trim().split('\n');
    expect(content.length).toBe(2);
    const parsed0 = JSON.parse(content[0]);
    expect(parsed0.agent).toBe('agent-a');
    expect(parsed0.title).toContain('sk-');
    // the redact helper replaces sk- keys with sk-[REDACTED]
    expect(parsed0.title).not.toMatch(/sk-[A-Za-z0-9]{8,}/);
    require('fs').unlinkSync(tmp);
  });
});
