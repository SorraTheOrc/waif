import { readFileSync } from 'fs';
import { resolve } from 'path';

let client: any | undefined;

function readYaml(path: string): any | undefined {
  try {
    // minimal YAML parsing without adding deps: only simple key: value and mappings
    const txt = readFileSync(path, 'utf8');
    const lines = txt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const out: any = {};
    for (const line of lines) {
      if (line.includes(':')) {
        const [k, ...rest] = line.split(':');
        const v = rest.join(':').trim().replace(/^"|"$/g, '');
        out[k.trim()] = v;
      }
    }
    return out;
  } catch (e) {
    return undefined;
  }
}

export function isEnabled() {
  // Default: enabled unless explicitly disabled
  const env = process.env.OPENCODE_ENABLED;
  if (typeof env === 'string') {
    const v = env.toLowerCase();
    if (v === '0' || v === 'false') return false;
    return Boolean(v);
  }

  // fallback to config file
  const cfg = readYaml(resolve('.opencode/server.yaml'))?.server;
  if (cfg && typeof cfg.enable !== 'undefined') {
    return String(cfg.enable).toLowerCase() === 'true' || String(cfg.enable) === '1';
  }

  return true;
}

async function checkPort(host: string, port: number, timeout = 500): Promise<boolean> {
  const net = await import('node:net');
  return new Promise((resolveCheck) => {
    const socket = new (net as any).Socket();
    let done = false;
    socket.setTimeout(timeout);
    socket.on('connect', () => {
      done = true;
      socket.destroy();
      resolveCheck(true);
    });
    socket.on('error', () => {
      if (!done) {
        done = true;
        resolveCheck(false);
      }
    });
    socket.on('timeout', () => {
      if (!done) {
        done = true;
        resolveCheck(false);
      }
    });
    // Note: connect signature differs between node versions; use host/port
    try { socket.connect(port, host); } catch (e) { resolveCheck(false); }
  });
}
export async function ensureClient(): Promise<any | undefined> {
  if (client) return client;
  if (!isEnabled()) return undefined;

  // Read config
  const cfg = readYaml(resolve('.opencode/server.yaml')) || {};
  const serverCfg = cfg.server || {};
  const host = process.env.OPENCODE_HOST || serverCfg.host || '127.0.0.1';
  const port = Number(process.env.OPENCODE_PORT || serverCfg.port || 4096);
  const defaultAgent = process.env.OPENCODE_DEFAULT_AGENT || serverCfg.defaultAgent || 'map';
  const defaultProvider = process.env.OPENCODE_PROVIDER || serverCfg.provider || 'github-copilot';
  const defaultModel = process.env.OPENCODE_MODEL || serverCfg.model || 'gpt-5-mini';

  const running = await checkPort(host, port, 300);

  try {
    const mod = await import('@opencode-ai/sdk');
    const createOpencode = mod?.createOpencode ?? mod?.default?.createOpencode;
    const createOpencodeClient = mod?.createOpencodeClient ?? mod?.default?.createOpencodeClient;

    let sdkClient: any | undefined;

    if (!running) {
      // start both server and client
      if (typeof createOpencode === 'function') {
        const timeoutMs = Number(process.env.OPENCODE_STARTUP_TIMEOUT || 5000);
        const inst = await createOpencode({ hostname: host, port, timeout: timeoutMs });
        sdkClient = inst?.client ?? inst;
      }
    } else {
      // connect to existing server as client only
      if (typeof createOpencodeClient === 'function') {
        sdkClient = await createOpencodeClient({ baseUrl: `http://${host}:${port}` });
      }
    }

    if (!sdkClient) {
      throw new Error('Failed to create OpenCode client');
    }

    // attempt to list agents and write cache
    try {
      if (sdkClient.app && typeof sdkClient.app.agents === 'function') {
        const agentsRes = await sdkClient.app.agents();
        const agents = Array.isArray(agentsRes?.data) ? agentsRes.data : agentsRes;
        if (Array.isArray(agents)) {
          const outLines: string[] = [];
          for (const a of agents) {
            const name = (a?.name || a?.title || a?.id || '').toString();
            const id = (a?.id || name).toString();
            if (name) outLines.push(`${name}: ${id}`);
          }
          if (outLines.length > 0) {
            const { writeFileSync, mkdirSync } = await import('fs');
            const { dirname } = await import('path');
            const target = resolve('.opencode/agent_map.yaml');
            mkdirSync(dirname(target), { recursive: true });
            writeFileSync(target, outLines.join('\n') + '\n', 'utf8');
          }
        }
      }
    } catch (e) {
      // ignore agent listing errors
    }

    client = {
      ask: async (agent: string, prompt: string) => {
        // Map agent name -> id with fallbacks
        const map = loadAgentMap();
        const requested = agent || defaultAgent;
        const mapped = map[requested] || requested || defaultAgent;

        // Preferred path: start a session and send a prompt
        if (sdkClient.session && typeof sdkClient.session.create === 'function' && typeof sdkClient.session.prompt === 'function') {
          const session = await sdkClient.session.create({});
          const sessionID = session?.data?.id || session?.id;
          if (!sessionID) throw new Error('Failed to create OpenCode session');

          const res = await sdkClient.session.prompt({
            path: { id: sessionID },
            body: {
              agent: mapped,
              model: { providerID: defaultProvider, modelID: defaultModel },
              parts: [{ type: 'text', text: prompt }],
            },
          });

          // Try to read assistant text from the created message
          const message = res?.data?.info;
          const parts = res?.data?.parts;
          const textPart = Array.isArray(parts) ? parts.find((p: any) => p?.type === 'text') : undefined;
          if (textPart?.text) return { markdown: String(textPart.text) };

          if (typeof message?.content === 'string') return { markdown: message.content };

          if (message?.error?.data?.message) {
            return { markdown: `OpenCode error: ${message.error.data.message}` };
          }

          // Fallback: fetch messages for the session and pick last assistant text part
          try {
            const msgs = await sdkClient.session.messages({ path: { id: sessionID }, query: { limit: 5 } });
            const list = Array.isArray(msgs?.data) ? msgs.data : [];
            for (let i = list.length - 1; i >= 0; i -= 1) {
              const m = list[i];
              if (m?.info?.role === 'assistant' && Array.isArray(m?.parts)) {
                const tp = m.parts.find((p: any) => p?.type === 'text' && p?.text);
                if (tp) return { markdown: String(tp.text) };
              }
            }
          } catch (e) {
            // ignore fetch errors
          }

          return { markdown: JSON.stringify(res ?? {}) };
        }

        throw new Error('OpenCode client has no supported ask method');
      },
      _sdk: sdkClient,
      _defaultAgent: defaultAgent,
    };

    // ensure agent_map exists (create empty cache if missing)
    try {
      const { writeFileSync, existsSync, mkdirSync } = await import('fs');
      const target = resolve('.opencode/agent_map.yaml');
      if (!existsSync(target)) {
        mkdirSync(resolve('.opencode'), { recursive: true });
        writeFileSync(target, '# Auto-generated agent map\n', 'utf8');
      }
    } catch (e) {
      // ignore
    }

    return client;
  } catch (e) {
    process.stderr.write(`[warn] OpenCode SDK unavailable or failed: ${e instanceof Error ? e.message : String(e)}\n`);
    return undefined;
  }
}

export function loadAgentMap(): Record<string, string> {
  try {
    const txt = readFileSync(resolve('.opencode/agent_map.yaml'), 'utf8');
    const lines = txt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const map: Record<string, string> = {};
    for (const line of lines) {
      if (line.includes(':')) {
        const [k, ...rest] = line.split(':');
        map[k.trim()] = rest.join(':').trim();
      }
    }
    return map;
  } catch (e) {
    return {};
  }
}

export default { ensureClient, loadAgentMap, log };

// Simple rotation-aware logger for .opencode/logs/events.jsonl
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const DEFAULT_TARGET = resolve('.opencode', 'logs', 'events.jsonl');
const DEFAULT_ROTATED = `${DEFAULT_TARGET}.1`;

type StreamMeta = {
  stream: import('node:fs').WriteStream;
  size: number;
};

const streamMap: Map<string, StreamMeta> = new Map();
let mkdirCalled = false;

async function ensureDirForTarget(target: string) {
  if (mkdirCalled) return;
  const { dirname } = await import('path');
  const { mkdir } = await import('node:fs/promises');
  const dir = dirname(target);
  try {
    await mkdir(dir, { recursive: true });
    mkdirCalled = true;
  } catch (e) {
    // ignore
  }
}

async function openStreamForTarget(target: string): Promise<StreamMeta> {
  if (streamMap.has(target)) return streamMap.get(target)!;
  const { stat } = await import('node:fs/promises');
  const { createWriteStream } = await import('node:fs');
  let size = 0;
  try {
    const st = await stat(target);
    size = st.size;
  } catch (e) {
    size = 0;
  }
  const stream = createWriteStream(target, { flags: 'a' });
  stream.on('error', (err: any) => {
    // Avoid blowing up host process for logging failures
    try {
      process.stderr.write(`[warn] opencode.log stream error: ${err instanceof Error ? err.message : String(err)}\n`);
    } catch (e) {}
  });
  const meta = { stream, size };
  streamMap.set(target, meta);
  return meta;
}

async function rotateTarget(target: string, rotated: string) {
  const meta = streamMap.get(target);
  if (meta) {
    await new Promise<void>((res) => meta.stream.end(res));
    streamMap.delete(target);
  }
  try {
    const { rename } = await import('node:fs/promises');
    await rename(target, rotated);
  } catch (e) {
    // ignore rename errors
  }
  // open a fresh stream and track it
  await openStreamForTarget(target);
}

export async function log(line: string, stream?: NodeJS.WritableStream, opts?: { target?: string; maxBytes?: number }): Promise<void> {
  const target = opts?.target ? resolve(opts.target) : DEFAULT_TARGET;
  const rotated = opts?.target ? `${resolve(opts.target)}.1` : DEFAULT_ROTATED;
  const maxBytes = (opts?.maxBytes ?? Number(process.env.OPENCODE_LOG_MAX_BYTES)) || DEFAULT_MAX_BYTES;

  const text = line.endsWith('\n') ? line : line + '\n';

  // If caller provided a writable stream, use it directly (no rotation performed on external streams)
  if (stream && typeof (stream as any).write === 'function') {
    await new Promise<void>((resolveP, rejectP) => {
      (stream as any).write(text, (err?: Error | null) => {
        if (err) rejectP(err); else resolveP();
      });
    });
    return;
  }

  // Ensure directory exists for the default target
  await ensureDirForTarget(target);

  // Open or reuse stream for target
  const meta = await openStreamForTarget(target);

  // Rotation check
  if (meta.size + text.length > maxBytes) {
    await rotateTarget(target, rotated);
    // reopen stream meta
    const newMeta = await openStreamForTarget(target);
    newMeta.size = 0;
    // write below using newMeta
    try {
      const ok = newMeta.stream.write(text, 'utf8');
      newMeta.size += text.length;
      if (!ok) await new Promise<void>((res) => newMeta.stream.once('drain', res));
      return;
    } catch (e) {
      // fallback to appendFile
    }
  }

  // Write to stream and update size
  try {
    const ok = meta.stream.write(text, 'utf8');
    meta.size += text.length;
    if (!ok) await new Promise<void>((res) => meta.stream.once('drain', res));
    return;
  } catch (e) {
    // fallback to appendFile
  }

  try {
    const { appendFile } = await import('node:fs/promises');
    await appendFile(target, text, 'utf8');
  } catch (e) {
    // as last resort, write to stderr
    try { process.stderr.write(`[warn] opencode.log fallback write failed: ${e instanceof Error ? e.message : String(e)}\n`); } catch (er) {}
  }
}

