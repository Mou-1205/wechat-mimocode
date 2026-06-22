import { loadJson, saveJson, validateAccountId } from './store.js';
import { mkdirSync } from 'node:fs';
import { DATA_DIR, DEFAULT_WORKING_DIR } from './constants.js';
import { join } from 'node:path';

const SESSIONS_DIR = join(DATA_DIR, 'sessions');

const DEFAULT_MAX_HISTORY = 100;
const VALID_ROLES: ReadonlySet<string> = new Set(['user', 'assistant']);

export type SessionState = 'idle' | 'processing';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface Session {
  sdkSessionId?: string;
  previousSdkSessionId?: string;
  workingDirectory: string;
  model?: string;
  state: SessionState;
  chatHistory: ChatMessage[];
  maxHistoryLength?: number;
}

export type SessionStore = ReturnType<typeof createSessionStore>;

function getMaxHistory(session: Session): number {
  return session.maxHistoryLength || DEFAULT_MAX_HISTORY;
}

function trimHistory(session: Session): void {
  const max = getMaxHistory(session);
  if (session.chatHistory.length > max) {
    session.chatHistory = session.chatHistory.slice(-max);
  }
}

function normalizeSession(session: Session): Session {
  session.chatHistory ??= [];
  session.maxHistoryLength ??= DEFAULT_MAX_HISTORY;
  return session;
}

export function createSessionStore() {
  function getSessionPath(accountId: string): string {
    validateAccountId(accountId);
    return join(SESSIONS_DIR, `${accountId}.json`);
  }

  function load(accountId: string): Session {
    validateAccountId(accountId);
    const session = loadJson<Session>(getSessionPath(accountId), {
      workingDirectory: DEFAULT_WORKING_DIR,
      state: 'idle',
      chatHistory: [],
      maxHistoryLength: DEFAULT_MAX_HISTORY,
    });
    return normalizeSession(session);
  }

  function save(accountId: string, session: Session): void {
    validateAccountId(accountId);
    mkdirSync(SESSIONS_DIR, { recursive: true });
    trimHistory(session);
    saveJson(getSessionPath(accountId), session);
  }

  function clear(accountId: string, currentSession?: Session): Session {
    const session: Session = {
      sdkSessionId: undefined,
      previousSdkSessionId: undefined,
      workingDirectory: currentSession?.workingDirectory ?? DEFAULT_WORKING_DIR,
      model: currentSession?.model,
      state: 'idle',
      chatHistory: [],
      maxHistoryLength: currentSession?.maxHistoryLength || DEFAULT_MAX_HISTORY,
    };
    save(accountId, session);
    return session;
  }

  function addChatMessage(session: Session, role: 'user' | 'assistant', content: string): void {
    if (!VALID_ROLES.has(role)) {
      throw new Error(`Invalid role: "${role}". Expected "user" or "assistant".`);
    }
    if (typeof content !== 'string' || content.length === 0) {
      throw new Error('Chat message content must be a non-empty string.');
    }
    session.chatHistory ??= [];
    session.chatHistory.push({ role, content, timestamp: Date.now() });
    trimHistory(session);
  }

  function getChatHistoryText(session: Session, limit?: number): string {
    const history = session.chatHistory ?? [];
    const messages = limit != null && limit > 0 ? history.slice(-limit) : history;

    if (messages.length === 0) {
      return '暂无对话记录';
    }

    const lines: string[] = [];
    for (const msg of messages) {
      const time = new Date(msg.timestamp).toLocaleString('zh-CN');
      const label = msg.role === 'user' ? '用户' : 'MiMoCode';
      lines.push(`[${time}] ${label}:`);
      lines.push(msg.content);
      lines.push('');
    }

    return lines.join('\n');
  }

  return { load, save, clear, addChatMessage, getChatHistoryText };
}
