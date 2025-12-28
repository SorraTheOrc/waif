import { describe, expect, it } from 'vitest';
import { classify, __test__ } from '../src/commands/ooda.js';

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
