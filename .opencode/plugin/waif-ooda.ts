// OpenCode plugin for waif OODA
// Logs every OpenCode event as raw JSON to .opencode/logs/events.jsonl (delegates rotation to centralized logger).
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import type { Session, Message, Part } from "@opencode-ai/sdk"
import { log as opencodeLog } from "../../src/lib/opencode.js";

type OpencodeClient = PluginInput["client"];

const LOG_DIR_NAME = path.join(".opencode", "logs");
const LOG_FILE_NAME = "events.jsonl";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB simple size cap for rotation

async function ensureLogDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

/**
 * Get the current model/agent context for a session by querying messages.
 *
 * Mirrors OpenCode's internal lastModel() logic to find the most recent
 * user message. Used during event handling when we don't have direct access
 * to the current user message's context.
 */
async function getSessionContext(
  client: OpencodeClient,
  sessionID: string
): Promise<
  { model?: { providerID: string; modelID: string }; agent?: string } | undefined
> {
  try {
    const response = await client.session.messages({
      path: { id: sessionID },
      query: { limit: 50 },
    });

    if (response.data) {
      for (const msg of response.data) {
        if (msg.info.role === "user" && "model" in msg.info && msg.info.model) {
          return { model: msg.info.model, agent: msg.info.agent };
        }
      }
    }
  } catch {
    // On error, return undefined (let opencode use its default)
  }

  return undefined;
}

export const WaifOodaPlugin: Plugin = async (context) => {
  // Prefer project directory/worktree when provided by OpenCode; fall back to CWD.
  const baseDir = context?.directory ?? context?.worktree ?? process.cwd();
  const logDir = path.join(baseDir, LOG_DIR_NAME);
  const logFile = path.join(logDir, LOG_FILE_NAME);

  await ensureLogDir(logDir);

  // Track the last logged line for simple deduplication.
  // If the new line is byte-for-byte identical to the most recently
  // logged line, skip writing it to reduce log spam.
  let lastLoggedLine: string | undefined;

  async function maybeLog(line: string) {
    if (line === lastLoggedLine) return;
    lastLoggedLine = line;
    await opencodeLog(line, undefined, { target: logFile, maxBytes: MAX_BYTES });
  }

  return {
    "chat.message": async (input, output) => {
      const sessionID = output.message.sessionID;
      const agent = output.message.agent;
      const role = output.message.role;
      const parts = output.parts
      const line = `${JSON.stringify({ sessionID, agent, role, parts })}\n`;

      await maybeLog(line);
    },

    "permission.ask": async (input, output) => {
      const type = input.type;
      const pattern = input.pattern;
      const status = output.status;
      const line = `${JSON.stringify({ type, pattern, status })}\n`;

      await maybeLog(line);
    },

    event: async (input) => {
      if (input.event.type === "session.created") {
        const title = input.event.properties.info.title;

        const line = `${JSON.stringify({ eventType: input.event.type, title })}\n`;

        await maybeLog(line);
      }
      else if (input.event.type === "message.updated") {
        const summary = input.event.properties.info.summary;
        // summary can be a boolean (false) or an object with optional title/body.
        // Ensure it's an object and has a title before proceeding.
        if (typeof summary !== "object" || summary === null || summary.title === undefined) {
          return;
        }
        const line = `${JSON.stringify({ eventType: input.event.type, title: summary.title })}\n`;

        await maybeLog(line);
      }
    },
  };
};

export default WaifOodaPlugin;
