import { Command } from 'commander';
import { readFileSync, createReadStream, appendFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import path from 'node:path';
import cronParser from 'cron-parser';
import { emitJson, logStdout } from '../lib/io.js';
import { loadConfig, type Job } from '../lib/config.js';
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

export const __test__ = { readOpencodeEvents, eventsToRows, latestEventsByAgent, runJobCommand, writeJobSnapshot, enforceRetention };

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

type SnapshotStatus = 'success' | 'failure' | 'timeout';
const DEFAULT_TIMEOUT_MS = 60_000;

export async function runJobCommand(job: Job): Promise<{ code: number | null; stdout?: string; stderr?: string; timedOut?: boolean }> {
  const captureStdout = (job.capture ?? []).includes('stdout');
  const captureStderr = (job.capture ?? []).includes('stderr');
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let timedOut = false;

  const child = spawn(job.command, {
    shell: true,
    cwd: job.cwd || process.cwd(),
    env: { ...process.env, ...(job.env ?? {}) },
    stdio: ["ignore", captureStdout ? "pipe" : "ignore", captureStderr ? "pipe" : "ignore"],
  });

  if (captureStdout && child.stdout) child.stdout.on('data', (c: Buffer) => stdoutChunks.push(c));
  if (captureStderr && child.stderr) child.stderr.on('data', (c: Buffer) => stderrChunks.push(c));

  const timeoutMs = Math.max(1, Math.floor((job.timeout_seconds ?? DEFAULT_TIMEOUT_MS / 1000) * 1000));

  const toOutput = (chunks: Buffer[], redact?: boolean) => {
    if (chunks.length === 0) return undefined;
    const text = Buffer.concat(chunks).toString('utf8');
    return redact ? redactSecrets(text) : text;
  };

  return await new Promise((resolve) => {
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
    }, timeoutMs);

    child.on('error', () => {
      clearTimeout(timer);
      resolve({ code: null, stdout: captureStdout ? toOutput(stdoutChunks, job.redact) : undefined, stderr: captureStderr ? toOutput(stderrChunks, job.redact) : undefined, timedOut });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        code: typeof code === 'number' ? code : null,
        stdout: captureStdout ? toOutput(stdoutChunks, job.redact) : undefined,
        stderr: captureStderr ? toOutput(stderrChunks, job.redact) : undefined,
        timedOut,
      });
    });
  });
}

export function writeJobSnapshot(
  filePath: string,
  job: Job,
  status: SnapshotStatus,
  code: number | null,
  stdout?: string,
  stderr?: string,
  redact = false,
) {
  if (!filePath) return;
  try {
    const dir = path.dirname(filePath);
    if (dir && dir !== '.') mkdirSync(dir, { recursive: true });
    const time = new Date().toISOString();
    const sanitize = (val?: string) => (val && redact ? redactSecrets(val) : val);
    const snapshot: Record<string, unknown> = {
      time,
      job_id: job.id,
      name: job.name,
      command: job.command,
      status,
      exit_code: code,
    };
    if (typeof stdout === 'string') snapshot.stdout = sanitize(stdout);
    if (typeof stderr === 'string') snapshot.stderr = sanitize(stderr);
    appendFileSync(filePath, JSON.stringify(snapshot) + '\n', 'utf8');
  } catch (e) {
    // best-effort
  }
}

export function enforceRetention(filePath: string, keepLast?: number) {
  if (!filePath || !keepLast || keepLast <= 0) return;
  try {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const trimmed = lines.slice(Math.max(0, lines.length - keepLast));
    const dir = path.dirname(filePath);
    if (dir && dir !== '.') mkdirSync(dir, { recursive: true });
    require('node:fs').writeFileSync(filePath, trimmed.map((l) => `${l}\n`).join(''), 'utf8');
  } catch (e) {
    // best-effort
  }
}

export function createOodaCommand() {
  const cmd = new Command('ooda');
  cmd.description('OODA scheduler and job runner (cron-based)');

  // helper to print captured output to console in non-json runs
  function printJobResult(job: Job, result: { stdout?: string; stderr?: string; timedOut?: boolean }, jsonOutput: boolean) {
    if (jsonOutput) return;
    try {
      if ((job.capture ?? []).includes('stdout') && result.stdout) {
        // preserve raw newlines
        process.stdout.write(String(result.stdout));
      }
      if ((job.capture ?? []).includes('stderr') && result.stderr) {
        process.stderr.write(String(result.stderr));
      }
    } catch (e) {
      // best-effort: do not throw while printing
    }
  }

  cmd
    .command('scheduler')
    .description('Run the OODA scheduler loop')
    .option('--config <path>', 'Path to ooda scheduler config', '.waif/ooda-scheduler.yaml')
    .option('--interval <seconds>', 'Poll interval in seconds', (v) => parseInt(v, 10), 30)
    .option('--log <path>', 'Snapshot log path (default history/ooda_snapshot_<ts>.jsonl)')
    .action(async (options, command) => {
      const jsonOutput = Boolean(options.json ?? command.parent?.parent?.getOptionValue('json'));
      const configPath = path.resolve(options.config ?? '.waif/ooda-scheduler.yaml');
      const interval = Number(options.interval ?? 30) || 30;
      const cfg = await loadConfig(configPath);

      // expose helper for tests: print captured output to console in non-json runs
      (cmd as any).__internals = (cmd as any).__internals || {};
      (cmd as any).__internals.printJobResult = printJobResult;

      const parseCron = (expr: string) => {
        const anyParser = cronParser as any;
        if (typeof anyParser?.parseExpression === 'function') return anyParser.parseExpression(expr, { strict: false });
        if (typeof anyParser?.parse === 'function') return anyParser.parse(expr, { strict: false });
        if (typeof anyParser?.default?.parseExpression === 'function') return anyParser.default.parseExpression(expr, { strict: false });
        if (typeof anyParser?.default?.parse === 'function') return anyParser.default.parse(expr, { strict: false });
        throw new Error('cron-parser parse function not found');
      };

      const scheduleEntries = cfg.jobs.map((job) => {
        const iter = parseCron(job.schedule);
        const next = iter.next().toDate();
        return { job, iter, next };
      });

      const snapshotPath = options.log === false ? null : typeof options.log === 'string' ? options.log : path.join('history', `ooda_snapshot_${Date.now()}.jsonl`);

      const runJob = async (job: Job) => {
        const result = await runJobCommand(job);
        const status: SnapshotStatus = result.timedOut ? 'timeout' : result.code === 0 ? 'success' : 'failure';
        // print captured output to console when not in json mode
        printJobResult(job, result, jsonOutput);
        if (snapshotPath) {
          writeJobSnapshot(snapshotPath, job, status, result.code, result.stdout, result.stderr, Boolean(job.redact));
          enforceRetention(snapshotPath, job.retention?.keep_last);
        }
        if (jsonOutput) {
          emitJson({ jobId: job.id, status, code: result.code, stdout: result.stdout, stderr: result.stderr });
        }
      };

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const now = new Date();
        for (const entry of scheduleEntries) {
          try {
            if (now >= entry.next) {
              await runJob(entry.job);
              entry.next = entry.iter.next().toDate();
            }
          } catch {
            // ignore per-loop errors to keep scheduler alive
          }
        }
        await new Promise((resolve) => setTimeout(resolve, interval * 1000));
      }
    });



  cmd
    .command('run-job')
    .description('Run a configured job once by id (debug)')
    .option('--config <path>', 'Path to ooda scheduler config', '.waif/ooda-scheduler.yaml')
    .requiredOption('--job <id>', 'Job id to run')
    .option('--log <path>', 'Snapshot log path (default history/ooda_snapshot_<ts>.jsonl)')
    .action(async (options, command) => {
      const jsonOutput = Boolean(options.json ?? command.parent?.parent?.getOptionValue('json'));
      const configPath = path.resolve(options.config ?? '.waif/ooda-scheduler.yaml');
      const cfg = await loadConfig(configPath);
      const job = cfg.jobs.find((j) => j.id === options.job);
      if (!job) throw new Error(`job not found: ${options.job}`);
      const result = await runJobCommand(job);
      const status: SnapshotStatus = result.timedOut ? 'timeout' : result.code === 0 ? 'success' : 'failure';
      // print captured output to console when not in json mode
      printJobResult(job, result, jsonOutput);
      const snapshotPath = options.log === false ? null : typeof options.log === 'string' ? options.log : path.join('history', `ooda_snapshot_${Date.now()}.jsonl`);
      if (snapshotPath) {
        writeJobSnapshot(snapshotPath, job, status, result.code, result.stdout, result.stderr, Boolean(job.redact));
        enforceRetention(snapshotPath, job.retention?.keep_last);
      }
      if (jsonOutput) emitJson({ jobId: job.id, status, code: result.code, stdout: result.stdout, stderr: result.stderr });
    });

  return cmd;
}

