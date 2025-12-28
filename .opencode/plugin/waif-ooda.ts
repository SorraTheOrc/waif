// Minimal OpenCode plugin for waif OODA
// Logs every OpenCode event as raw JSON to .opencode/logs/events.jsonl.
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "@opencode-ai/plugin";

const LOG_DIR_NAME = path.join(".opencode", "logs");
const LOG_FILE_NAME = "events.jsonl";

export const WaifOodaPlugin: Plugin = async (ctx) => {
  // Prefer project directory/worktree when provided by OpenCode; fall back to CWD.
  const baseDir = ctx?.directory ?? ctx?.worktree ?? process.cwd();
  const logDir = path.join(baseDir, LOG_DIR_NAME);
  const logFile = path.join(logDir, LOG_FILE_NAME);

  return {
    event: async ({ event }) => {
      if (
        event?.type === "file.watcher.updated" &&
        typeof event?.properties?.file === "string" &&
        event.properties.file.includes(`${path.sep}.git${path.sep}`)
      ) {
        return;
      }

      const line = `${JSON.stringify(event)}\n`;

      // Append to .opencode/logs/events.jsonl (best-effort)
      try {
        await mkdir(logDir, { recursive: true });
        await appendFile(logFile, line, "utf8");
      } catch (error) {
        console.error("WaifOodaPlugin: failed to write event log", error);
      }
    },
  };
};

export default WaifOodaPlugin;
