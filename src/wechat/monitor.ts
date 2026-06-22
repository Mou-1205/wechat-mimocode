import { WeChatApi } from './api.js';
import { loadSyncBuf, saveSyncBuf } from './sync-buf.js';
import { logger } from '../logger.js';
import type { WeixinMessage, GetUpdatesResp } from './types.js';

const SESSION_EXPIRED_ERRCODE = -14;
const SESSION_EXPIRED_PAUSE_MS = 60 * 60 * 1000;
const MAX_RECENT_IDS = 1000;
const EVICT_TO = 500;

const BACKOFF_BASE_MS = 3_000;
const BACKOFF_MAX_MS = 60_000;
const BACKOFF_ESCALATE_AFTER = 3;

export interface MonitorCallbacks {
  onMessage: (msg: WeixinMessage) => Promise<void>;
  onSessionExpired: () => void;
}

export function createMonitor(api: WeChatApi, callbacks: MonitorCallbacks) {
  const controller = new AbortController();
  const recentIds = new Set<number>();

  async function run(): Promise<void> {
    let failures = 0;

    while (!controller.signal.aborted) {
      try {
        const resp = await pollOnce();
        failures = 0;
        if (resp) processMessages(resp);
      } catch (err) {
        if (controller.signal.aborted) break;
        failures++;
        logger.error('Monitor error', {
          error: errorMessage(err),
          consecutiveFailures: failures,
        });
        await backoffSleep(failures);
      }
    }

    logger.info('Monitor stopped');
  }

  async function pollOnce(): Promise<GetUpdatesResp | null> {
    const buf = loadSyncBuf();
    logger.debug('Polling for messages', { hasBuf: buf.length > 0 });

    const resp = await api.getUpdates(buf || undefined);

    if (resp.get_updates_buf) {
      saveSyncBuf(resp.get_updates_buf);
    }

    if (resp.ret === SESSION_EXPIRED_ERRCODE) {
      logger.warn('Session expired, pausing for 1 hour');
      callbacks.onSessionExpired();
      await sleep(SESSION_EXPIRED_PAUSE_MS, controller.signal);
      return null;
    }

    if (resp.ret !== undefined && resp.ret !== 0) {
      logger.warn('getUpdates returned error', { ret: resp.ret, retmsg: resp.retmsg });
    }

    return resp;
  }

  function processMessages(resp: GetUpdatesResp): void {
    const messages = resp.msgs;
    if (!messages?.length) return;

    logger.info('Received messages', { count: messages.length });

    for (const msg of messages) {
      if (isDuplicate(msg.message_id)) continue;
      callbacks.onMessage(msg).catch((err) => {
        logger.error('Error processing message', {
          error: errorMessage(err),
          messageId: msg.message_id,
        });
      });
    }
  }

  function isDuplicate(id: number | undefined): boolean {
    if (id === undefined) return false;
    if (recentIds.has(id)) return true;

    recentIds.add(id);
    if (recentIds.size > MAX_RECENT_IDS) evictOldIds();
    return false;
  }

  function evictOldIds(): void {
    const iter = recentIds.values();
    let removed = 0;
    const target = MAX_RECENT_IDS - EVICT_TO;
    while (removed < target) {
      const { value, done } = iter.next();
      if (done) break;
      recentIds.delete(value);
      removed++;
    }
  }

  async function backoffSleep(failures: number): Promise<void> {
    const exponent = Math.min(failures, 8);
    const base = failures >= BACKOFF_ESCALATE_AFTER
      ? BACKOFF_BASE_MS * Math.pow(2, exponent - BACKOFF_ESCALATE_AFTER + 1)
      : BACKOFF_BASE_MS;
    const ms = Math.min(base, BACKOFF_MAX_MS) + Math.random() * 1000;
    logger.info(`Backing off ${Math.round(ms)}ms`, { consecutiveFailures: failures });
    await sleep(ms, controller.signal);
  }

  function stop(): void {
    if (!controller.signal.aborted) {
      logger.info('Stopping monitor...');
      controller.abort();
    }
  }

  return { run, stop };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) { resolve(); return; }

    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}
