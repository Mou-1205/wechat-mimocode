import { loadJson, saveJson } from '../store.js';
import { DATA_DIR } from '../constants.js';
import { join } from 'node:path';

/** File path for the persisted getUpdates sync cursor. */
const SYNC_BUF_PATH = join(DATA_DIR, 'get_updates_buf');

/**
 * Load the last persisted sync cursor.
 * Returns an empty string when no cursor has been saved yet.
 */
export function loadSyncBuf(): string {
  return loadJson<string>(SYNC_BUF_PATH, '');
}

/** Persist the sync cursor to disk so the next poll resumes where we left off. */
export function saveSyncBuf(buf: string): void {
  saveJson(SYNC_BUF_PATH, buf);
}
