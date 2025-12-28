// OpenCode plugin for waif OODA
// Logs every OpenCode event as raw JSON to .opencode/logs/events.jsonl (with simple rotation and write-stream).
import { mkdir, stat, rename } from "node:fs/promises";
import { createWriteStream, WriteStream } from "node:fs";
import path from "node:path";
import type { Plugin } from "@opencode-ai/plugin";

const LOG_DIR_NAME = path.join(".opencode", "logs");
const LOG_FILE_NAME = "events.jsonl";
const ROTATED_LOG_FILE_NAME = "events.jsonl.1";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB simple size cap for rotation

async function ensureLogDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

// Singleton stream support: ensures multiple plugin initializations share one WriteStream
let _sharedStream: WriteStream | undefined = undefined;
let _sharedStartSize = 0;
let _sharedPath: string | undefined = undefined;

async function openLogStream(filePath: string): Promise<{ stream: WriteStream; startSize: number }> {
  // If a stream for this path is already open, reuse it
  if (_sharedStream && _sharedPath === filePath) {
    return { stream: _sharedStream, startSize: _sharedStartSize };
  }

  let size = 0;
  try {
    const st = await stat(filePath);
    size = st.size;
  } catch (e) {
    size = 0; // file likely does not exist yet
  }
  const stream = createWriteStream(filePath, { flags: "a" });
  // Save as shared so future inits reuse the same descriptor
  _sharedStream = stream;
  _sharedStartSize = size;
  _sharedPath = filePath;
  // Ensure the stream is in non-blocking mode; handle errors to avoid crashing the host process.
  stream.on("error", (err) => {
    console.error("WaifOodaPlugin: stream error", err);
  });
  return { stream, startSize: size };
}

async function rotate(logFile: string, rotatedFile: string, stream: WriteStream): Promise<WriteStream> {
  await new Promise((resolve) => stream.end(resolve));
  // Clear shared stream if we rotated the currently-shared file
  if (_sharedPath === logFile) {
    _sharedStream = undefined;
    _sharedStartSize = 0;
    _sharedPath = undefined;
  }
  try {
    await rename(logFile, rotatedFile);
  } catch (e) {
    // If rename fails (e.g., file missing), continue with fresh file
  }
  const newStream = createWriteStream(logFile, { flags: "a" });
  _sharedStream = newStream;
  _sharedStartSize = 0;
  _sharedPath = logFile;
  return newStream;
}

export const WaifOodaPlugin: Plugin = async (ctx) => {
  // Prefer project directory/worktree when provided by OpenCode; fall back to CWD.
  const baseDir = ctx?.directory ?? ctx?.worktree ?? process.cwd();
  const logDir = path.join(baseDir, LOG_DIR_NAME);
  const logFile = path.join(logDir, LOG_FILE_NAME);
  const rotatedLogFile = path.join(logDir, ROTATED_LOG_FILE_NAME);

  await ensureLogDir(logDir);
  let { stream, startSize } = await openLogStream(logFile);
  let currentSize = startSize;

  return {
    "chat.message": async (_input, output) => {
      const sessionID = output.message.sessionID;
      const agent = output.message.agent;
      const role = output.message.role;
      const line = `${JSON.stringify({ sessionID, agent, role, message: output.message })}\n`;

      try {
        // Simple size-based rotation
        if (currentSize + line.length > MAX_BYTES) {
          stream = await rotate(logFile, rotatedLogFile, stream);
          currentSize = 0;
        }

        const ok = stream.write(line, "utf8");
        currentSize += line.length;
        if (!ok) {
          await new Promise<void>((resolve) => stream.once("drain", resolve));
        }
      } catch (error) {
        console.error("WaifOodaPlugin: failed to write event log", error);
      }
    },
  };
};

export default WaifOodaPlugin;
