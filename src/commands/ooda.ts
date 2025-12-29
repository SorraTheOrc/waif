import { Command } from 'commander';
import { readFileSync, createReadStream, appendFileSync, mkdirSync } from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import { emitJson, logStdout } from '../lib/io.js';
import { redactSecrets } from '../lib/redact.js';

interface PaneRow {
  pane: string;
  title: string;
  status: 'Busy' | 'Free';
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
  // Streaming JSONL parser: read line-by-line and keep only the latest event per agent to avoid full in-memory materialization.
  try {
    const stream = createReadStream(logPath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    const latestMap: Record<string, OpencodeAgentEvent> = {};
    for await (const line of rl) {
      if (!line || !line.trim()) continue;
      let parsed: OpencodeAgentEvent | undefined;
      try {
        parsed = JSON.parse(line) as OpencodeAgentEvent;
      } catch (e) {
        // skip malformed lines
        continue;
      }
      const agent =
        (parsed?.properties?.agent as string) ||
        (parsed?.properties?.name as string) ||
        (parsed?.properties?.id as string) ||
        'unknown';
      latestMap[agent] = parsed;
    }
    return Object.keys(latestMap).map((k) => latestMap[k]);
  } catch (e) {
    return [];
  }
}

function latestEventsByAgent(events: OpencodeAgentEvent[]): OpencodeAgentEvent[] {
  if (!Array.isArray(events) || events.length === 0) return [];
  const map: Record<string, OpencodeAgentEvent> = {};
  for (const ev of events) {
    const agent =
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
    const agent =
      (ev?.properties?.agent as string) ||
      (ev?.properties?.name as string) ||
      (ev?.properties?.id as string) ||
      'unknown';
    const title = ev?.type || 'event';
    const status = title.includes('stopped') || title.includes('stop') ? 'Free' : 'Busy';
    return { pane: agent, title, status, reason: 'opencode-event' };
  });
}

export const __test__ = { readOpencodeEvents, eventsToRows, latestEventsByAgent };

export function writeSnapshots(logPath: string, rows: PaneRow[]) {
  if (!logPath || !Array.isArray(rows)) return;
  try {
    const dir = path.dirname(logPath);
    if (dir && dir !== '.' ) mkdirSync(dir, { recursive: true });
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
          logStdout(table);
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
