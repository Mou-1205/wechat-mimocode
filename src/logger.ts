import { mkdirSync, appendFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const LOG_DIR = join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "wechat-mimocode", "logs");
const MAX_LOG_FILES = 30;

// ─── Log Level ───────────────────────────────────────────────────────────────

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 } as const;
type Level = keyof typeof LEVELS;

let minLevel: Level = (process.env.LOG_LEVEL?.toUpperCase() as Level) ?? "INFO";

export function setLogLevel(level: Level): void {
  minLevel = level;
}

function shouldLog(level: Level): boolean {
  return LEVELS[level] >= LEVELS[minLevel];
}

// ─── Redaction ───────────────────────────────────────────────────────────────

const SENSITIVE_KEY_RE =
  /(?:(?:[\w]+_)?[Tt]oken|(?:[\w]+_)?[Ss]ecret|(?:[\w]+_)?[Pp]assword|(?:[\w]+_)?[Kk]ey|(?:[\w]+_)?[Cc]ookie|(?:[\w]+_)?[Cc]redential|(?:[\w]+_)?[Aa]uthorization|(?:[\w]+_)?api_?key)/i;

const PATTERNS: [RegExp, string][] = [
  [/Bearer\s+[^\s"\\]+/gi, "Bearer ***"],
  [/\b\d{11,13}\b/g, "***phone***"],
  [/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/gi, "***email***"],
  [/sk-[A-Za-z0-9]{8,}/g, "sk-***"],
];

function redactString(s: string): string {
  let out = s;
  for (const [re, replacement] of PATTERNS) {
    out = out.replace(re, replacement);
  }
  return out;
}

function redactValue(value: unknown, depth: number): unknown {
  if (depth > 8) return "***";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((v) => redactValue(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY_RE.test(k) ? "***" : redactValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Redact sensitive data from any value. Returns a JSON string. */
export function redact(obj: unknown): string {
  if (obj === null || obj === undefined) return String(obj);
  return JSON.stringify(redactValue(obj, 0));
}

// ─── File helpers ────────────────────────────────────────────────────────────

function cleanupOldLogs(): void {
  try {
    const files = readdirSync(LOG_DIR)
      .filter((f) => f.startsWith("bridge-") && f.endsWith(".log"))
      .sort();
    while (files.length > MAX_LOG_FILES) {
      unlinkSync(join(LOG_DIR, files.shift()!));
    }
  } catch {
    // directory may not exist yet
  }
}

function ensureLogDir(): void {
  mkdirSync(LOG_DIR, { recursive: true });
  cleanupOldLogs();
}

function getLogFilePath(): string {
  const date = new Date().toISOString().slice(0, 10);
  return join(LOG_DIR, `bridge-${date}.log`);
}

function localTimestamp(): string {
  const d = new Date();
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const hh = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
  const mm = String(Math.abs(offset) % 60).padStart(2, "0");
  return d.toISOString().replace("Z", `${sign}${hh}:${mm}`);
}

// ─── Structured log line ─────────────────────────────────────────────────────

interface LogEntry {
  ts: string;
  level: Level;
  msg: string;
  ctx?: Record<string, unknown>;
}

function writeLogLine(
  level: Level,
  message: string,
  contextOrData?: unknown,
): void {
  if (!shouldLog(level)) return;
  ensureLogDir();

  const entry: LogEntry = { ts: localTimestamp(), level, msg: message };

  if (contextOrData !== undefined) {
    if (
      typeof contextOrData === "object" &&
      contextOrData !== null &&
      !Array.isArray(contextOrData)
    ) {
      entry.ctx = redactValue(contextOrData, 0) as Record<string, unknown>;
    } else {
      entry.ctx = { data: redactValue(contextOrData, 0) };
    }
  }

  const line = JSON.stringify(entry) + "\n";
  appendFileSync(getLogFilePath(), line, "utf-8");
}

// ─── Public API ──────────────────────────────────────────────────────────────

export const logger = {
  info(message: string, contextOrData?: unknown): void {
    writeLogLine("INFO", message, contextOrData);
  },
  warn(message: string, contextOrData?: unknown): void {
    writeLogLine("WARN", message, contextOrData);
  },
  error(message: string, contextOrData?: unknown): void {
    writeLogLine("ERROR", message, contextOrData);
  },
  debug(message: string, contextOrData?: unknown): void {
    writeLogLine("DEBUG", message, contextOrData);
  },
} as const;
