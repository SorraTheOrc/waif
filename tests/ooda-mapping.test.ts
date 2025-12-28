import { describe, it, expect } from 'vitest';
import { __test__ } from '../src/commands/ooda.js';

const { eventsToRows } = __test__;

describe('ooda OpenCode event mapping', () => {
  it('maps agent.start events to Busy rows with agent name', () => {
    const events = [{ type: 'agent.started', properties: { agent: 'map' } }];
    expect(eventsToRows(events)).toEqual([{ pane: 'map', title: 'agent.started', status: 'Busy', reason: 'opencode-event' }]);
  });

  it('maps agent.stop events to Free rows', () => {
    const events = [{ type: 'agent.stopped', properties: { name: 'forge' } }];
    expect(eventsToRows(events)).toEqual([{ pane: 'forge', title: 'agent.stopped', status: 'Free', reason: 'opencode-event' }]);
  });

  it('falls back to unknown when no agent identifiers are present', () => {
    const events = [{ type: 'agent.started', properties: { foo: 'bar' } }];
    expect(eventsToRows(events)).toEqual([{ pane: 'unknown', title: 'agent.started', status: 'Busy', reason: 'opencode-event' }]);
  });
});
