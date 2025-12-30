// OpenCode plugin for waif OODA — canonical event emitter
// This plugin normalizes incoming OpenCode events to a canonical waif schema
// and writes one JSONL line per logical event to .opencode/logs/events.jsonl

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { log as opencodeLog } from '../../src/lib/opencode.js';

// Use loose any typing for compatibility with various OpenCode SDK shapes
type OpencodeClient = any;

const LOG_DIR_NAME = path.join('.opencode', 'logs');
const LOG_FILE_NAME = 'events.jsonl';
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB simple size cap for rotation

// Types of OpenCode events that are noisy and should be ignored by default.
// Add more types here if needed (configurable in future iterations).
const IGNORE_EVENT_TYPES = new Set(["session.diff", "file.watcher.updated", "message.updated", "message.part.updated", "permission.updated", "session.status"]);

async function ensureLogDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

// Helper to produce a short human title from parts or summary
function titleFromParts(parts: any[] | undefined, summary: any | undefined, fallback: string) {
  if (typeof summary === 'string' && summary.trim()) return summary.trim();
  if (Array.isArray(parts) && parts.length > 0) {
    try {
      const texts = parts
        .filter((p) => p && (p.type === 'text' || typeof p.text === 'string'))
        .map((p) => (typeof p.text === 'string' ? p.text.trim() : ''))
        .filter(Boolean);
      const joined = texts.join(' ');
      if (joined) return joined.length > 240 ? joined.slice(0, 240) + '...[TRUNCATED]' : joined;
    } catch {
      // ignore
    }
  }
  if (typeof fallback === 'string' && fallback) return fallback;
  return 'event';
}

// Query the session messages to infer an agent if none is present on the event
async function getSessionAgent(client: OpencodeClient | undefined, sessionID: string | undefined) {
  if (!client || !sessionID) return undefined;
  try {
    const resp = await client.session.messages({ path: { id: sessionID }, query: { limit: 50 } });
    if (!resp?.data || !Array.isArray(resp.data)) return undefined;
    // scan for the most recent user message that contains an agent hint
    for (const msg of resp.data) {
      if (msg?.info && msg.info.agent) return msg.info.agent;
    }
  } catch {
    // ignore errors; best-effort
  }
  return undefined;
}

// In-process subscribers will be called with the parsed canonical object
const subscribers = new Set<(obj: any) => void>();

export function subscribe(handler: (obj: any) => void) {
  subscribers.add(handler);
  return () => unsubscribe(handler);
}

export function unsubscribe(handler: (obj: any) => void) {
  subscribers.delete(handler);
}

export const WaifOodaPlugin: Plugin = async (context) => {
  const baseDir = context?.directory ?? context?.worktree ?? process.cwd();
  const logDir = path.join(baseDir, LOG_DIR_NAME);
  const logFile = path.join(logDir, LOG_FILE_NAME);

  await ensureLogDir(logDir);

  let lastLoggedLine: string | undefined;
  let seq = 0;

  // In-process subscribers will be called with the parsed canonical object
  const subscribers = new Set<(obj: any) => void>();

  export function subscribe(handler: (obj: any) => void) {
    subscribers.add(handler);
    return () => unsubscribe(handler);
  }

  export function unsubscribe(handler: (obj: any) => void) {
    subscribers.delete(handler);
  }

  async function maybeLog(line: string) {
    if (line === lastLoggedLine) return;
    lastLoggedLine = line;
    await opencodeLog(line, undefined, { target: logFile, maxBytes: MAX_BYTES });
    // Notify subscribers with the parsed object (best-effort). Keep file logging as the source-of-record.
    try {
      const parsed = JSON.parse(line);
      for (const s of Array.from(subscribers)) {
        try {
          s(parsed);
        } catch (e) {
          // swallow subscriber errors to avoid breaking plugin behavior
        }
      }
    } catch (e) {
      // ignore parse errors
    }
  }

  // Build canonical event object
  function buildCanonical(fields: {
    type: string;
    agent?: string;
    title?: string;
    sessionID?: string;
    properties?: Record<string, any>;
  }) {
    seq += 1;
    return {
      time: new Date().toISOString(),
      type: fields.type,
      agent: fields.agent || undefined,
      title: fields.title || undefined,
      seq,
      sessionID: fields.sessionID || undefined,
      properties: fields.properties || {},
    };
  }

  return {
    // Chat messages: contain sessionID, agent, role, parts
    'chat.message': async (input: any, output: any) => {
      const sessionID = output?.message?.sessionID;
      const agent = output?.message?.agent;
      const parts = output?.parts;
      const title = titleFromParts(parts, undefined, undefined);

      let canonicalAgent = agent;
      if (!canonicalAgent) canonicalAgent = await getSessionAgent((context as any)?.client, sessionID);

      const obj = buildCanonical({ type: 'message', agent: canonicalAgent, title, sessionID, properties: { role: output?.message?.role, parts: parts ? parts.map((p: any) => ({ type: p.type, text: p.text })) : undefined } });
      await maybeLog(JSON.stringify(obj) + '\n');
    },

    // Permission asks
    'permission.ask': async (input: any, output: any) => {
      const type = input?.type;
      const pattern = input?.pattern;
      const status = output?.status;
      const title = `permission:${type}`;
      const obj = buildCanonical({ type: 'permission.ask', title, properties: { pattern, status } });
      await maybeLog(JSON.stringify(obj) + '\n');
    },

    // Generic events
    event: async (input: any) => {
      try {
        const ev = input.event as any;
        const etype = ev?.type || 'event';

        // Filter noisy event types early to avoid writing diffs or watcher noise
        if (IGNORE_EVENT_TYPES.has(etype)) return;
        const sessionID = ev?.properties?.sessionID || ev?.properties?.info?.sessionID || ev?.properties?.sessionID || undefined;
        // Attempt to compute a human title
        const summary = ev?.properties?.info?.summary;
        const title = titleFromParts(undefined, summary && summary.title ? summary.title : ev?.properties?.info?.title || ev?.properties?.title, ev?.type || etype);

        // Attempt to find an agent in various spots
        let agent = ev?.properties?.agent || ev?.properties?.info?.actor || ev?.actor || undefined;
        if (!agent && sessionID) agent = await getSessionAgent((context as any)?.client, sessionID);

        const obj = buildCanonical({ type: etype, agent, title, sessionID, properties: ev?.properties || {} });
        await maybeLog(JSON.stringify(obj) + '\n');
      } catch (e) {
        // best-effort, ignore
      }
    },
  };
};

export default WaifOodaPlugin;
