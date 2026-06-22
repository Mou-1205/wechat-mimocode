import { readFileSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, normalize } from "node:path";
import { logger } from "./logger.js";

export class StoreError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly filePath?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "StoreError";
  }
}

export function validateAccountId(accountId: string): void {
  if (!/^[a-zA-Z0-9_.@=-]+$/.test(accountId)) {
    throw new StoreError(
      `Invalid accountId: "${accountId}"`,
      "INVALID_ACCOUNT_ID"
    );
  }
}

export function validatePath(filePath: string): void {
  if (!filePath || typeof filePath !== "string") {
    throw new StoreError(
      "File path must be a non-empty string",
      "INVALID_PATH",
      filePath
    );
  }
  const normalized = normalize(filePath);
  if (!isAbsolute(normalized)) {
    throw new StoreError(
      `File path must be absolute: "${filePath}"`,
      "INVALID_PATH",
      filePath
    );
  }
}

interface FileOperationOptions {
  readonly logErrors?: boolean;
}

const DEFAULT_OPTIONS: FileOperationOptions = {
  logErrors: true,
};

function executeFileOperation<T>(
  operation: string,
  filePath: string,
  fn: () => T,
  options: FileOperationOptions = DEFAULT_OPTIONS
): T {
  try {
    validatePath(filePath);
    return fn();
  } catch (err) {
    const storeErr =
      err instanceof StoreError
        ? err
        : new StoreError(
            `${operation} failed for "${filePath}"`,
            "FILE_OPERATION_FAILED",
            filePath,
            err instanceof Error ? err : undefined
          );
    if (options.logErrors) {
      logger.warn(storeErr.message, {
        code: storeErr.code,
        filePath: storeErr.filePath,
        error: storeErr.cause?.message,
      });
    }
    throw storeErr;
  }
}

export function loadJson<T>(filePath: string, fallback: T): T {
  try {
    return executeFileOperation("loadJson", filePath, () => {
      const raw = readFileSync(filePath, "utf-8");
      return JSON.parse(raw) as T;
    });
  } catch (err) {
    if (err instanceof StoreError && err.cause) {
      const code = (err.cause as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return fallback;
      }
    }
    if (err instanceof StoreError) {
      logger.warn("loadJson failed, using fallback", {
        filePath,
        code: err.code,
        error: err.cause?.message ?? err.message,
      });
      return fallback;
    }
    throw err;
  }
}

export function saveJson<T>(filePath: string, data: T): void {
  executeFileOperation("saveJson", filePath, () => {
    mkdirSync(dirname(filePath), { recursive: true });
    const raw = JSON.stringify(data, null, 2) + "\n";
    writeFileSync(filePath, raw, "utf-8");
    if (process.platform !== "win32") {
      chmodSync(filePath, 0o600);
    }
  });
}
