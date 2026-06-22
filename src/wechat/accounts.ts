import { join } from 'node:path';
import { homedir } from 'node:os';
import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { loadJson, saveJson, validateAccountId } from '../store.js';
import { logger } from '../logger.js';

export const DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AccountData {
  botToken: string;
  accountId: string;
  baseUrl: string;
  userId: string;
  createdAt: string;
}

export class AccountError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_ID' | 'NOT_FOUND' | 'STORAGE_ERROR',
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'AccountError';
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const ACCOUNTS_DIR = join(homedir(), '.wechat-mimocode', 'accounts');

function accountPath(accountId: string): string {
  validateAccountId(accountId);
  return join(ACCOUNTS_DIR, `${accountId}.json`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Persist account credentials to disk. */
export function saveAccount(data: AccountData): void {
  const filePath = accountPath(data.accountId);
  saveJson(filePath, data);
  logger.info('Account saved', { accountId: data.accountId });
}

/** Load account credentials by ID. Returns null if not found. */
export function loadAccount(accountId: string): AccountData | null {
  const filePath = accountPath(accountId);
  const data = loadJson<AccountData | null>(filePath, null);
  if (data) {
    logger.info('Account loaded', { accountId });
  }
  return data;
}

/** Delete an account by ID. Returns true if deleted, false if not found. */
export function deleteAccount(accountId: string): boolean {
  const filePath = accountPath(accountId);
  try {
    unlinkSync(filePath);
    logger.info('Account deleted', { accountId });
    return true;
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return false;
    throw new AccountError(`Failed to delete account "${accountId}"`, 'STORAGE_ERROR', err);
  }
}

/** List all saved account IDs. */
export function listAccounts(): string[] {
  try {
    return readdirSync(ACCOUNTS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''));
  } catch {
    return [];
  }
}

/** Load the most recently modified account. Returns null if none exist. */
export function loadLatestAccount(): AccountData | null {
  try {
    const files = readdirSync(ACCOUNTS_DIR).filter((f) => f.endsWith('.json'));
    if (files.length === 0) return null;

    let latestFile = files[0];
    let latestMtime = 0;

    for (const file of files) {
      const mtime = statSync(join(ACCOUNTS_DIR, file)).mtimeMs;
      if (mtime > latestMtime) {
        latestMtime = mtime;
        latestFile = file;
      }
    }

    const accountId = latestFile.replace(/\.json$/, '');
    return loadAccount(accountId);
  } catch {
    return null;
  }
}
