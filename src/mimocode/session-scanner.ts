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

export function tagSessionAsWeChat(sessionId: string): void {
  try {
    const db = new Database(DB_PATH);
    try {
      const row = db.prepare('SELECT title FROM session WHERE id = ?').get(sessionId) as { title: string } | undefined;
      if (row && !row.title.startsWith(WECHAT_PREFIX)) {
        db.prepare('UPDATE session SET title = ? WHERE id = ?').run(`${WECHAT_PREFIX}${row.title}`, sessionId);
      }
    } finally {
      db.close();
    }
  } catch (err) {
    logger.warn('Failed to tag session as WeChat', { sessionId, error: err instanceof Error ? err.message : String(err) });
  }
}

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
    `).all(`${WECHAT_PREFIX}%`, limit) as Array<{ id: string; title: string; time_updated: number; msg_count: number }>;

    return rows.map(row => {
      let title = row.title.startsWith(WECHAT_PREFIX) ? row.title.slice(WECHAT_PREFIX.length) : row.title;
      if (!title) {
        const d = new Date(row.time_updated);
        title = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
      }
      return { sessionId: row.id, title, lastUpdated: row.time_updated, messageCount: row.msg_count };
    });
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
    `).all(`${WECHAT_PREFIX}%`, `%${keyword}%`) as Array<{ id: string; title: string; time_updated: number; msg_count: number }>;

    return rows.map(row => {
      let title = row.title.startsWith(WECHAT_PREFIX) ? row.title.slice(WECHAT_PREFIX.length) : row.title;
      if (!title) {
        const d = new Date(row.time_updated);
        title = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
      }
      return { sessionId: row.id, title, lastUpdated: row.time_updated, messageCount: row.msg_count };
    });
  } finally {
    db.close();
  }
}
