import Database from 'better-sqlite3';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { WECHAT_SESSION_PREFIX } from '../constants.js';

export interface SessionInfo {
  sessionId: string;
  title: string;
  lastUpdated: number;
  messageCount: number;
}

const DB_PATH = join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'mimocode', 'mimocode.db');

export function scanSessions(limit: number = 20): SessionInfo[] {
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const rows = db.prepare(`
      SELECT
        s.id,
        s.title,
        s.time_updated,
        COUNT(m.id) as msg_count
      FROM session s
      LEFT JOIN message m ON m.session_id = s.id
      WHERE s.time_archived IS NULL AND s.title LIKE ?
      GROUP BY s.id
      ORDER BY s.time_updated DESC
      LIMIT ?
    `).all(`${WECHAT_SESSION_PREFIX}%`, limit) as Array<{ id: string; title: string; time_updated: number; msg_count: number }>;

    return rows.map(row => ({
      sessionId: row.id,
      title: row.title.startsWith(WECHAT_SESSION_PREFIX) ? row.title.slice(WECHAT_SESSION_PREFIX.length) : (row.title || '(无标题)'),
      lastUpdated: row.time_updated,
      messageCount: row.msg_count,
    }));
  } finally {
    db.close();
  }
}

export function searchSessions(keyword: string): SessionInfo[] {
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const rows = db.prepare(`
      SELECT
        s.id,
        s.title,
        s.time_updated,
        COUNT(m.id) as msg_count
      FROM session s
      LEFT JOIN message m ON m.session_id = s.id
      WHERE s.title LIKE ? AND s.title LIKE ? AND s.time_archived IS NULL
      GROUP BY s.id
      ORDER BY s.time_updated DESC
      LIMIT 20
    `).all(`${WECHAT_SESSION_PREFIX}%`, `%${keyword}%`) as Array<{ id: string; title: string; time_updated: number; msg_count: number }>;

    return rows.map(row => ({
      sessionId: row.id,
      title: row.title.startsWith(WECHAT_SESSION_PREFIX) ? row.title.slice(WECHAT_SESSION_PREFIX.length) : (row.title || '(无标题)'),
      lastUpdated: row.time_updated,
      messageCount: row.msg_count,
    }));
  } finally {
    db.close();
  }
}
