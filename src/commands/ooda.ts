import { Command } from 'commander';
import { readFileSync, createReadStream, appendFileSync, mkdirSync } from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import { emitJson, logStdout } from '../lib/io.js';
import { redactSecrets } from '../lib/redact.js';

interface PaneRow {
  pane: string;
  title: string;
  status: 'Busy' | 'Free' | 'Waiting';
  reason: string;
}

interface OpencodeAgentEvent {
  type?: string;
  properties?: Record<string, any>;
}

export function classify(title: string, stat?: string, pcpu?: string): { status: 'Busy' | 'Free'; reason: string } {
  const lower = title.toLowerCase();
  if (
    lower.includes('busy') ||
    lower.includes('in_progress') ||
    lower.includes('running') ||
    lower.includes('agent') ||
    /[a-z]+-[a-z0-9.]+/.test(lower)
  ) {
    return { status: 'Busy', reason: 'keyword' };
  }
  if (!lower.trim() || lower.includes('idle')) {
    return { status: 'Free', reason: 'idle-title' };
  }
  if (stat || pcpu) {
    const cpuInt = pcpu ? parseInt(pcpu.split('.')[0], 10) || 0 : 0;
    if (cpuInt > 0) return { status: 'Busy', reason: 'process-cpu' };
    if (stat && stat[0] && stat[0] !== 'S' && stat[0] !== 'I') return { status: 'Busy', reason: 'process-state' };
    return { status: 'Free', reason: 'process-idle' };
  }
  return { status: 'Free', reason: 'fallback' };
}

function computeWidths(rows: PaneRow[]): { agent: number; status: number; title: number } {
  const headerAgent = 'Agent';
  const headerStatus = 'Status';
  const headerTitle = 'Title';
  let agent = headerAgent.length;
  let status = headerStatus.length;
  let title = headerTitle.length;

  for (const r of rows) {
    agent = Math.max(agent, r.pane.length);
    status = Math.max(status, r.status.length);
    title = Math.max(title, r.title.length);
  }

  const termCols = process.stdout.isTTY && typeof process.stdout.columns === 'number' ? process.stdout.columns : Number(process.env.COLUMNS || 0) || 120;
  const padding = 6;
  const computedTitle = termCols - agent - status - padding;
  if (computedTitle > title) title = computedTitle;
  if (title < 10) title = 10;

  return { agent, status, title };
}

function truncateField(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  if (maxLen <= 1) return text.slice(0, maxLen);
  return `${text.slice(0, maxLen - 1)}…`;
}

function renderTable(rows: PaneRow[]): string {
  const widths = computeWidths(rows);
  const header = `${'Agent'.padEnd(widths.agent)} | ${'Status'.padEnd(widths.status)} | ${'Title'.padEnd(widths.title)}`;
  const sep = `${'-'.repeat(widths.agent)}-+-${'-'.repeat(widths.status)}-+-${'-'.repeat(widths.title)}`;
  const body = rows
    .map((r) => `${r.pane.padEnd(widths.agent)} | ${r.status.padEnd(widths.status)} | ${truncateField(r.title, widths.title).padEnd(widths.title)}`)
    .join('\n');
  return `${header}\n${sep}\n${body}`;
}

function sampleRows(): PaneRow[] {
  return [
    { pane: 'map', title: 'sample started', status: 'Busy', reason: 'sample' },
    { pane: 'forge', title: 'sample idle', status: 'Free', reason: 'sample' },
  ];
}

async function readOpencodeEvents(logPath: string): Promise<OpencodeAgentEvent[]> {
  // Streaming JSONL parser: read line-by-line and keep recent events per agent.
  try {
    const stream = createReadStream(logPath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    const sessionAgentMap: Record<string, string> = {};
    // keep arrays of events per session so we can correlate no-session events (permission.ask)
    const sessionEventsById: Record<string, OpencodeAgentEvent[]> = {};
    const noSessionEvents: OpencodeAgentEvent[] = [];

    // tolerate JSONL entries that may be split across multiple physical lines
    let buf = '';
    for await (const line of rl) {
      if (!line || !line.trim()) continue;

      let parsed: OpencodeAgentEvent | undefined;

      // Fast path: if buffer empty and line looks like a single-line JSON object/array, try parse directly
      const trimmed = line.trim();
      if (!buf && (trimmed[0] !== '{' && trimmed[0] !== '[')) {
        // line doesn't start like JSON — attempt to parse directly and skip on failure
        try {
          parsed = JSON.parse(trimmed) as OpencodeAgentEvent;
        } catch {
          // not JSON — skip this noisy line
          continue;
        }
      } else {
        // Accumulate into buffer and try parsing (supports multi-line JSON)
        buf += line;
        try {
          parsed = JSON.parse(buf) as OpencodeAgentEvent;
          buf = '';
        } catch (e) {
          // Not yet a complete JSON object — continue reading lines into buffer
          // Protect against runaway buffers
          if (buf.length > 200000) buf = '';
          continue;
        }
      }

      // Prefer explicit agent fields when present
      let agent =
        (parsed?.properties?.agent as string) ||
        (parsed as any).agent ||
        (parsed?.properties?.name as string) ||
        (parsed?.properties?.id as string);

      // Resolve sessionID from multiple possible locations
      const sessionID =
        parsed?.properties?.sessionID ||
        (parsed as any).sessionID ||
        parsed?.properties?.info?.sessionID ||
        parsed?.properties?.info?.id;

      // If we see an agent for this session, remember it
      if (agent && sessionID) sessionAgentMap[sessionID] = agent;

      // If no agent but we have a sessionID, try to resolve from previous mapping
      if (!agent && sessionID && sessionAgentMap[sessionID]) {
        agent = sessionAgentMap[sessionID];
      }

      // Keep resolved agent in local variable for downstream logic; avoid mutating
      // the parsed object to preserve original shape (tests expect top-level 'agent' absent).
      const resolvedAgent = agent || undefined;

      if (sessionID) {
        sessionEventsById[sessionID] = sessionEventsById[sessionID] || [];
        sessionEventsById[sessionID].push(parsed);
        const evAgent = (parsed as any).agent || parsed?.properties?.agent;
        if (evAgent) sessionAgentMap[sessionID] = evAgent as string;
      } else {
        // otherwise keep the event for later correlation attempts
        noSessionEvents.push(parsed);
      }
    }

    // Compose final latest map by agent, preferring session-backed events
    const agentLatest: Record<string, OpencodeAgentEvent> = {};
    // pick the last session-backed event per session (latest) to represent current state
    // Prefer the most recent event that contains a human-friendly title if available.
    for (const sid of Object.keys(sessionEventsById)) {
      const list = sessionEventsById[sid];
      if (!list || list.length === 0) continue;
      // find last event that has a title-like property
      let ev: OpencodeAgentEvent | undefined = undefined;
      for (let i = list.length - 1; i >= 0; i--) {
        const candidate = list[i];
        const candTitle = (candidate as any).title || candidate?.properties?.title || candidate?.properties?.info?.title;
        if (candTitle) {
          ev = candidate;
          break;
        }
      }
      if (!ev) ev = list[list.length - 1];
      const agentKey = (ev as any).agent || (ev?.properties?.agent as string) || sessionAgentMap[sid] || 'unknown';
      agentLatest[agentKey] = ev;
    }

    // Try to correlate no-session events (e.g., permission.ask) with any session-backed event
    for (const ns of noSessionEvents) {
      let matched = false;
      try {
        const nsPatterns = ns?.properties?.pattern || ns?.properties?.patterns || ns?.properties?.metadata?.patterns;
        // Look for any session event that shares the same pattern or metadata.patterns
        for (const sid of Object.keys(sessionEventsById)) {
          const sessList = sessionEventsById[sid] || [];
          for (const sess of sessList) {
            const sessPatterns = sess?.properties?.metadata?.patterns || sess?.properties?.pattern || sess?.properties?.patterns;
            if (nsPatterns && sessPatterns) {
              try {
                const a = JSON.stringify(nsPatterns);
                const b = JSON.stringify(sessPatterns);
                if (a === b || a.includes(b) || b.includes(a)) {
                  // correlated; skip adding the no-session event as a separate 'unknown' entry
                  matched = true;
                  break;
                }
              } catch {
                // fallthrough
              }
            }
          }
          if (matched) break;
        }
      } catch {
        // ignore correlation failures
      }

      if (!matched) {
        // If there's only one active session, attribute the no-session event to that session's agent
        const sessionIds = Object.keys(sessionEventsById);
        if (sessionIds.length === 1) {
          const sid = sessionIds[0];
          const sessList = sessionEventsById[sid];
          const evAgent = (sessList && sessList.length) ? ((sessList[sessList.length - 1] as any).agent || sessionAgentMap[sid]) : sessionAgentMap[sid];
          if (evAgent) {
            // If we already have a session-backed event for this agent, prefer
            // keeping that event's title. Merge title into the no-session event
            // so that downstream rendering preserves the session title while
            // reflecting the no-session status (e.g., Waiting).
            const existing = agentLatest[evAgent] as OpencodeAgentEvent | undefined;
            if (existing) {
              const existingTitle = (existing as any).title || existing?.properties?.title || existing?.properties?.info?.title;
              if (existingTitle && !(ns as any).title) (ns as any).title = existingTitle;
            }
            agentLatest[evAgent] = ns;
            matched = true;
          }
        }

        // If still not matched, try nearest-in-time session correlation (within 60s)
        if (!matched && ns && (ns as any).time) {
          try {
            const nsTime = new Date((ns as any).time).getTime();
            let bestSid: string | null = null;
            let bestDelta = Number.POSITIVE_INFINITY;
            for (const sid of Object.keys(sessionEventsById)) {
              const list = sessionEventsById[sid];
              if (!list || list.length === 0) continue;
              const last = list[list.length - 1];
              const lastTime = last && (last as any).time ? new Date((last as any).time).getTime() : 0;
              const delta = Math.abs(nsTime - lastTime);
              if (delta < bestDelta) {
                bestDelta = delta;
                bestSid = sid;
              }
            }
            if (bestSid && bestDelta <= 60000) {
              const agentKey = sessionAgentMap[bestSid] || (sessionEventsById[bestSid]?.[sessionEventsById[bestSid].length - 1] as any)?.agent || 'unknown';
              if (agentKey) {
                const existing = agentLatest[agentKey] as OpencodeAgentEvent | undefined;
                if (existing) {
                  const existingTitle = (existing as any).title || existing?.properties?.title || existing?.properties?.info?.title;
                  if (existingTitle && !(ns as any).title) (ns as any).title = existingTitle;
                }
                agentLatest[agentKey] = ns;
                matched = true;
              }
            }
          } catch {
            // ignore time parse errors
          }
        }

        if (!matched) {
          // As a final heuristic, scan the raw log for a nearby agent entry (helps when some
          // JSON lines are malformed and couldn't be parsed). Look for the last agent before
          // this permission entry in the raw log file.
          try {
            const raw = readFileSync(logPath, 'utf8');
            const needle = '"type":"permission.ask"';
            const p = raw.lastIndexOf(needle);
            if (p !== -1) {
              const prevAgentIdx = raw.lastIndexOf('"agent":"', p);
              if (prevAgentIdx !== -1) {
                const start = prevAgentIdx + '"agent":"'.length;
                const end = raw.indexOf('"', start);
                if (end !== -1) {
                  const agentKey = raw.slice(start, end);
                  if (agentKey) {
                    const existing = agentLatest[agentKey] as OpencodeAgentEvent | undefined;
                    if (existing) {
                      const existingTitle = (existing as any).title || existing?.properties?.title || existing?.properties?.info?.title;
                      if (existingTitle && !(ns as any).title) (ns as any).title = existingTitle;
                    }
                    agentLatest[agentKey] = ns;
                    matched = true;
                  }
                }
              }
            }
          } catch {
            // ignore file read errors
          }

            if (!matched) {
              const key = (ns as any).agent || ns?.properties?.agent || 'unknown';
              // Always keep the latest no-session event per agent (last one wins)
              agentLatest[key] = ns;
            }

        }
      }
    }

    // If we ended up with only an 'unknown' entry, try a final raw-log heuristic to pick a likely agent
    const keys = Object.keys(agentLatest);
    if (keys.length === 1 && keys[0] === 'unknown') {
      try {
        const raw = readFileSync(logPath, 'utf8');
        const prevAgentIdx = raw.lastIndexOf('"agent":"');
        if (prevAgentIdx !== -1) {
          const start = prevAgentIdx + '"agent":"'.length;
          const end = raw.indexOf('"', start);
          if (end !== -1) {
            const agentKey = raw.slice(start, end);
            if (agentKey) {
              agentLatest[agentKey] = agentLatest['unknown'];
              delete agentLatest['unknown'];
            }
          }
        }
      } catch {
        // ignore
      }
    }

    return Object.keys(agentLatest).map((k) => agentLatest[k]);
  } catch (e) {
    return [];
  }
}

function latestEventsByAgent(events: OpencodeAgentEvent[]): OpencodeAgentEvent[] {
  if (!Array.isArray(events) || events.length === 0) return [];
  const map: Record<string, OpencodeAgentEvent> = {};
  for (const ev of events) {
    const agent =
      (ev as any).agent ||
      (ev?.properties?.agent as string) ||
      (ev?.properties?.name as string) ||
      (ev?.properties?.id as string) ||
      'unknown';
    map[agent] = ev; // last one wins
  }
  return Object.keys(map).map((k) => map[k]);
}

function eventsToRows(events: OpencodeAgentEvent[]): PaneRow[] {
  if (!Array.isArray(events) || events.length === 0) return [];
  return events.map((ev) => {
    let agent =
      (ev as any).agent ||
      ev?.properties?.agent ||
      ev?.properties?.name ||
      ev?.properties?.id ||
      'unknown';
    // prefer a short human title from event properties if available
    // If this is a permission event, include requested patterns in the title for clarity
    const patterns =
      ev?.properties?.pattern || ev?.properties?.patterns || ev?.properties?.metadata?.patterns;
    let title =
      (ev as any).title ||
      ev?.properties?.info?.title ||
      ((ev?.properties && (ev.properties.title || ev.properties.summary)) as string) ||
      ev?.type ||
      'event';
    if (patterns) {
      try {
        const p = Array.isArray(patterns) ? patterns.join('; ') : String(patterns);
        title = `${title} (${p})`;
      } catch {
        // ignore pattern formatting errors
      }
    }
    // session.idle or session.status with properties.status.type === 'idle' should map to Free
    const evType = (ev as any).type || '';
    const statusProp = ev?.properties?.status?.type;
    let status: 'Busy' | 'Free' | 'Waiting';
    if (evType === 'permission.ask') {
      // User asked for permission — show as waiting
      status = 'Waiting';
      // If agent is unknown, try a lightweight raw-log heuristic to attribute the ask
      if (agent === 'unknown') {
        try {
          const raw = readFileSync(path.join('.opencode', 'logs', 'events.jsonl'), 'utf8');
          const prevAgentIdx = raw.lastIndexOf('"agent":"');
          if (prevAgentIdx !== -1) {
            const start = prevAgentIdx + '"agent":"'.length;
            const end = raw.indexOf('"', start);
            if (end !== -1) {
              agent = raw.slice(start, end);
            }
          }
        } catch {
          // ignore
        }
      }
    } else if (evType === 'session.idle' || statusProp === 'idle') {
      // Treat explicit idle session signals as waiting for next input/permission
      status = 'Waiting';
      // Prefer to preserve any meaningful session title (e.g., set by a prior
      // session.updated or message event). Only collapse to a blank title when
      // the event itself provides no useful title (e.g., title === ev.type).
      const rawTitle = String(title || '').trim();
      if (!rawTitle || rawTitle === evType || rawTitle.toLowerCase().includes('session.idle')) {
        title = '';
      }
    } else {
      status = String(title).toLowerCase().includes('stopped') || String(title).toLowerCase().includes('stop') ? 'Free' : 'Busy';
    }
    return { pane: agent, title, status, reason: 'opencode-event' };
  });
}

export const __test__ = { readOpencodeEvents, eventsToRows, latestEventsByAgent };

export function writeSnapshots(logPath: string, rows: PaneRow[]) {
  if (!logPath || !Array.isArray(rows)) return;
  try {
    const dir = path.dirname(logPath);
    if (dir && dir !== '.') mkdirSync(dir, { recursive: true });
    const time = new Date().toISOString();
    for (const r of rows) {
      const snapshot = {
        time,
        agent: r.pane,
        status: r.status,
        title: redactSecrets(String(r.title)),
        reason: redactSecrets(String(r.reason)),
      };
      appendFileSync(logPath, JSON.stringify(snapshot) + '\n', 'utf8');
    }
  } catch (e) {
    // best-effort: do not throw from logging
  }
}

export function createOodaCommand() {
  const cmd = new Command('ooda');
  cmd
    .description('Monitor OpenCode events and summarize agent state (tmux-free)')
    .option('--once', 'Run a single probe and exit')
    .option('--interval <seconds>', 'Poll interval in seconds', (v) => parseInt(v, 10), 5)
    .option('--log <path>', 'Log path (default history/ooda_probe_<ts>.txt)')
    .option('--no-log', 'Disable logging (still reads .opencode/logs/events.jsonl)')
    .option('--sample', 'Use built-in sample data (no OpenCode)')
    .action(async (options, command) => {
      const jsonOutput = Boolean(options.json ?? command.parent?.getOptionValue('json'));
      const interval = Number(options.interval ?? 5) || 5;
      const useSample = Boolean(options.sample);
      const once = Boolean(options.once);

      const opencodeLogPath = path.join('.opencode', 'logs', 'events.jsonl');

      // Attach to plugin emission API (if available) so we can forward real-time events to stdout.
      let unsubFromPlugin: (() => void) | undefined;
      async function attachPluginSubscriber(jsonMode: boolean) {
        try {
          // Import plugin JS (built into dist) when available; prefer runtime path so TS build won't choke.
          const pluginPath = '../../.opencode/plugin/waif-ooda.js';
          const mod = await import(pluginPath).catch(() => undefined);
          if (mod && typeof (mod as any).subscribe === 'function') {
            const unsub = (mod as any).subscribe((obj: any) => {
              try {
                // When not in JSON mode, we still emit raw JSON lines for the plugin events
                // so downstream consumers can read the same canonical shape as the file log.
                process.stdout.write(JSON.stringify(obj) + '\n');
              } catch (e) {
                // swallow errors from writing to stdout
              }
            });
            return typeof unsub === 'function' ? unsub as () => void : undefined;
          }
        } catch (e) {
          // plugin not present or failed to load; ignore
        }
        return undefined;
      }

      unsubFromPlugin = await attachPluginSubscriber(jsonOutput);


      let lastPrintedTableLines = 0;
      const runCycle = async () => {
        const latest = useSample ? [] : await readOpencodeEvents(opencodeLogPath);
        const rows = useSample && latest.length === 0 ? sampleRows() : eventsToRows(latest);
        const table = renderTable(rows);
        if (jsonOutput) {
          emitJson({
            rows,
            opencodeEventsRaw: latest,
            opencodeEventsLatest: latest,
          });
        } else {
          // If we're attached to a TTY, move the cursor up to the start of the
          // previously-printed table and clear that region so the table appears
          // to update in-place instead of scrolling. This is less disruptive
          // than clearing the whole screen.
          if (process.stdout.isTTY) {
            try {
              if (lastPrintedTableLines > 0) {
                // Move cursor up by the number of previously printed lines
                process.stdout.write(`\x1b[${lastPrintedTableLines}A`);
                // Clear from cursor to end of screen
                process.stdout.write('\x1b[J');
              }
            } catch {
              // ignore any stdout errors
            }
          }
          logStdout(table);
          // Record how many lines we just printed so we can erase them next time
          try {
            lastPrintedTableLines = table.split('\n').length;
          } catch {
            lastPrintedTableLines = 0;
          }
        }

        // If logging is enabled via --log <path>, append sanitized snapshots
        if (options.log && options.log !== false) {
          const lp = typeof options.log === 'string' ? options.log : path.join('history', `ooda_snapshot_${Date.now()}.jsonl`);
          writeSnapshots(lp, rows);
        }

        return rows;
      };

      if (once) {
        await runCycle();
        return;
      }

      let stableCycles = 0;
      let lastFingerprint = '';
      let currentInterval = interval;
      const maxBackoff = 60;
      const backoffCycles = 12;
      const jitterMax = 1;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const rows = await runCycle();
        const fingerprint = rows.map((r) => `${r.pane}|${r.status}|${r.title}|${r.reason}`).join(';');
        if (fingerprint === lastFingerprint) {
          stableCycles += 1;
          if (stableCycles >= backoffCycles) currentInterval = maxBackoff;
        } else {
          stableCycles = 0;
          currentInterval = interval;
          lastFingerprint = fingerprint;
        }
        const jitter = Math.floor(Math.random() * (jitterMax + 1));
        await new Promise((resolve) => setTimeout(resolve, (currentInterval + jitter) * 1000));
      }
    });
  return cmd;
}
