import Database from 'better-sqlite3';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { logger } from '../logger.js';

export interface SessionInfo {
  sessionId: string;
  title: string;
  lastUpdated: number;
  messageCount: number;
}

const DB_PATH = join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'mimocode', 'mimocode.db');
const WECHAT_PREFIX = '[WeChat]';

interface SessionRow {
  id: string;
  title: string;
  time_updated: number;
  msg_count: number;
}

function withDb<T>(readonly: boolean, fn: (db: Database.Database) => T): T {
  const db = new Database(DB_PATH, readonly ? { readonly: true } : undefined);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function formatTitle(row: SessionRow): string {
  let title = row.title.startsWith(WECHAT_PREFIX) ? row.title.slice(WECHAT_PREFIX.length) : row.title;
  if (!title) {
    const d = new Date(row.time_updated);
    title = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return title;
}

function mapRow(row: SessionRow): SessionInfo {
  return { sessionId: row.id, title: formatTitle(row), lastUpdated: row.time_updated, messageCount: row.msg_count };
}

const SESSION_QUERY = `
  SELECT s.id, s.title, s.time_updated, COUNT(m.id) as msg_count
  FROM session s
  LEFT JOIN message m ON m.session_id = s.id
  WHERE s.time_archived IS NULL
`;

export function tagSessionAsWeChat(sessionId: string): void {
  try {
    withDb(false, (db) => {
      const row = db.prepare('SELECT title FROM session WHERE id = ?').get(sessionId) as { title: string } | undefined;
      if (row && !row.title.startsWith(WECHAT_PREFIX)) {
        db.prepare('UPDATE session SET title = ? WHERE id = ?').run(`${WECHAT_PREFIX}${row.title}`, sessionId);
      }
    });
  } catch (err) {
    logger.warn('Failed to tag session as WeChat', { sessionId, error: err instanceof Error ? err.message : String(err) });
  }
}

export function scanSessions(limit: number = 20): SessionInfo[] {
  try {
    return withDb(true, (db) => {
      const rows = db.prepare(
        `${SESSION_QUERY} AND s.title LIKE ? ESCAPE '\\' GROUP BY s.id ORDER BY s.time_updated DESC LIMIT ?`
      ).all(`\\${WECHAT_PREFIX}%`, limit) as SessionRow[];
      return rows.map(mapRow);
    });
  } catch (err) {
    logger.warn('Failed to scan sessions', { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

export function searchSessions(keyword: string): SessionInfo[] {
  try {
    return withDb(true, (db) => {
      const rows = db.prepare(
        `${SESSION_QUERY} AND s.title LIKE ? ESCAPE '\\' AND s.title LIKE ? ESCAPE '\\' GROUP BY s.id ORDER BY s.time_updated DESC LIMIT 20`
      ).all(`\\${WECHAT_PREFIX}%`, `%${keyword}%`) as SessionRow[];
      return rows.map(mapRow);
    });
  } catch (err) {
    logger.warn('Failed to search sessions', { keyword, error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}
