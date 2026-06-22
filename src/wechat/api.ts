import type {
  GetUpdatesResp,
  SendMessageReq,
  GetUploadUrlResp,
  SendTypingReq,
  GetConfigResp,
  GetUploadUrlReq,
} from './types.js';
import { logger } from '../logger.js';

const DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com';
const ALLOWED_HOSTS = ['weixin.qq.com', 'wechat.com'];
const MIN_SEND_INTERVAL_MS = 2500;

interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY: RetryOptions = {
  maxRetries: 2,
  baseDelayMs: 3000,
  maxDelayMs: 15000,
};

export class WeChatApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retCode?: number,
  ) {
    super(message);
    this.name = 'WeChatApiError';
  }
}

function generateUin(): string {
  const buf = new Uint8Array(4);
  crypto.getRandomValues(buf);
  return Buffer.from(buf).toString('base64');
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

class RateLimiter {
  private readonly nextReady = new Map<string, number>();

  constructor(private readonly minIntervalMs: number) {}

  async wait(key: string): Promise<void> {
    const now = Date.now();
    const readyAt = Math.max(now, this.nextReady.get(key) ?? 0);
    this.nextReady.set(key, readyAt + this.minIntervalMs);
    const waitMs = readyAt - now;
    if (waitMs > 0) {
      logger.debug('Rate limiter waiting', { key, waitMs });
      await sleep(waitMs);
    }
  }

  delay(key: string, extraMs: number): void {
    this.nextReady.set(key, Date.now() + extraMs);
  }
}

export class WeChatApi {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly uin: string;
  private readonly sendLimiter = new RateLimiter(MIN_SEND_INTERVAL_MS);

  constructor(token: string, baseUrl: string = DEFAULT_BASE_URL) {
    this.baseUrl = WeChatApi.validateBaseUrl(baseUrl);
    this.token = token;
    this.uin = generateUin();
  }

  private static validateBaseUrl(raw: string): string {
    if (!raw) return DEFAULT_BASE_URL;
    try {
      const url = new URL(raw);
      const trusted = ALLOWED_HOSTS.some(
        h => url.hostname === h || url.hostname.endsWith(`.${h}`),
      );
      if (url.protocol !== 'https:' || !trusted) {
        logger.warn('Untrusted baseUrl, using default', { baseUrl: raw });
        return DEFAULT_BASE_URL;
      }
      return raw.replace(/\/+$/, '');
    } catch {
      logger.warn('Invalid baseUrl, using default', { baseUrl: raw });
      return DEFAULT_BASE_URL;
    }
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
      AuthorizationType: 'ilink_bot_token',
      'X-WECHAT-UIN': this.uin,
    };
  }

  private async request<T>(path: string, body: unknown, timeoutMs = 15_000): Promise<T> {
    const url = `${this.baseUrl}/${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    logger.debug('API request', { url, body });

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new WeChatApiError(`HTTP ${res.status}: ${text}`, res.status);
      }

      const json = (await res.json()) as T;
      logger.debug('API response', json);
      return json;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new WeChatApiError(`Request to ${url} timed out after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private async requestWithRetry<T extends { ret?: number }>(
    path: string,
    body: unknown,
    isRetryable: (res: T) => boolean,
    onRetry: (attempt: number, delayMs: number) => void,
    retry: RetryOptions = DEFAULT_RETRY,
    timeoutMs = 15_000,
  ): Promise<T> {
    let delayMs = retry.baseDelayMs;
    for (let attempt = 0; attempt <= retry.maxRetries; attempt++) {
      const res = await this.request<T>(path, body, timeoutMs);
      if (!isRetryable(res)) return res;
      if (attempt === retry.maxRetries) break;
      onRetry(attempt, delayMs);
      await sleep(delayMs);
      delayMs = Math.min(delayMs * 2, retry.maxDelayMs);
    }
    throw new WeChatApiError(
      `${path} failed after ${retry.maxRetries} retries`,
      undefined,
      -2,
    );
  }

  async getUpdates(buf?: string): Promise<GetUpdatesResp> {
    return this.request<GetUpdatesResp>(
      'ilink/bot/getupdates',
      buf ? { get_updates_buf: buf } : {},
      35_000,
    );
  }

  async sendMessage(req: SendMessageReq): Promise<void> {
    const userId = req.msg?.to_user_id;
    if (userId) {
      await this.sendLimiter.wait(userId);
    }

    await this.requestWithRetry<{ ret?: number }>(
      'ilink/bot/sendmessage',
      req,
      res => res.ret === -2,
      (attempt, delayMs) => {
        logger.warn('sendMessage rate-limited (ret:-2), retrying', { attempt, delayMs });
        if (userId) this.sendLimiter.delay(userId, delayMs + MIN_SEND_INTERVAL_MS);
      },
    );
  }

  async getConfig(ilinkUserId: string, contextToken?: string): Promise<GetConfigResp> {
    return this.request<GetConfigResp>(
      'ilink/bot/getconfig',
      { ilink_user_id: ilinkUserId, context_token: contextToken },
      10_000,
    );
  }

  async sendTyping(req: SendTypingReq): Promise<void> {
    await this.request('ilink/bot/sendtyping', req, 10_000);
  }

  async getUploadUrl(req: GetUploadUrlReq): Promise<GetUploadUrlResp> {
    return this.request<GetUploadUrlResp>('ilink/bot/getuploadurl', req);
  }
}
