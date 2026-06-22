import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import {
  CONFIG_DIR,
  CONFIG_PATH,
  DEFAULT_WORKING_DIR,
  DEFAULT_MODEL,
} from "./constants.js";

export interface Config {
  workingDirectory: string;
  model: string;
  systemPrompt?: string;
}

const DEFAULT_CONFIG: Config = {
  workingDirectory: DEFAULT_WORKING_DIR,
  model: DEFAULT_MODEL,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateConfig(raw: Record<string, unknown>): Config {
  const workingDirectory =
    typeof raw.workingDirectory === "string" && raw.workingDirectory.trim()
      ? raw.workingDirectory.trim()
      : DEFAULT_CONFIG.workingDirectory;

  const model =
    typeof raw.model === "string" && raw.model.trim()
      ? raw.model.trim()
      : DEFAULT_CONFIG.model;

  const systemPrompt =
    typeof raw.systemPrompt === "string" && raw.systemPrompt.trim()
      ? raw.systemPrompt.trim()
      : undefined;

  return { workingDirectory, model, systemPrompt };
}

export function loadConfig(): Config {
  let config: Config;
  try {
    const content = readFileSync(CONFIG_PATH, "utf-8");
    const parsed: unknown = JSON.parse(content);
    config = isRecord(parsed) ? validateConfig(parsed) : { ...DEFAULT_CONFIG };
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[config] Failed to read ${CONFIG_PATH}, using defaults:`, err.message);
    }
    config = { ...DEFAULT_CONFIG };
  }

  mkdirSync(config.workingDirectory, { recursive: true });
  return config;
}

export function saveConfig(config: Config): void {
  mkdirSync(CONFIG_DIR, { recursive: true });

  const data: Record<string, string> = {
    workingDirectory: config.workingDirectory,
  };
  if (config.model !== DEFAULT_CONFIG.model) data.model = config.model;
  if (config.systemPrompt) data.systemPrompt = config.systemPrompt;

  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2) + "\n", "utf-8");
    if (process.platform !== "win32") {
      chmodSync(CONFIG_PATH, 0o600);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[config] Failed to save config to ${CONFIG_PATH}:`, message);
  }
}
