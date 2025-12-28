import { describe, it, expect } from 'vitest';
import { __test__ } from '../src/commands/ooda.js';

const { latestEventsByAgent, eventsToRows } = __test__;

describe('latestEventsByAgent', () => {
  it('returns the last event per agent when multiple events are present', () => {
    const events = [
      { type: 'agent.started', properties: { agent: 'map' } },
      { type: 'agent.started', properties: { agent: 'forge' } },
      { type: 'agent.stopped', properties: { agent: 'map' } },
    ];
    const latest = latestEventsByAgent(events);
    // Expect two entries: forge (started) and map (stopped)
    expect(latest.length).toBe(2);
    const agents = latest.map((e) => (e?.properties?.agent || e?.properties?.name || e?.properties?.id || 'unknown'));
    expect(agents.sort()).toEqual(['forge', 'map']);
    // Ensure the map entry is the stopped event
    const mapEvent = latest.find((e) => (e?.properties?.agent || e?.properties?.name) === 'map');
    expect(mapEvent?.type).toBe('agent.stopped');
  });

  it('works end-to-end with eventsToRows to produce one row per agent', () => {
    const events = [
      { type: 'agent.started', properties: { agent: 'map' } },
      { type: 'agent.stopped', properties: { name: 'forge' } },
      { type: 'agent.stopped', properties: { agent: 'map' } },
    ];
    const rows = eventsToRows(latestEventsByAgent(events));
    // Should have two rows, one for forge (Free) and one for map (Free)
    expect(rows.length).toBe(2);
    const rowMap = Object.fromEntries(rows.map((r) => [r.pane, r]));
    expect(rowMap.forge.status).toBe('Free');
    expect(rowMap.map.status).toBe('Free');
  });
});
