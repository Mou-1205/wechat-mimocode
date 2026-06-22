import { decryptAesEcb } from './crypto.js';
import { logger } from '../logger.js';
import { CDN_BASE_URL } from '../constants.js';

/**
 * Parse a base64-encoded AES key that may be either raw 16 bytes
 * or a hex string of 32 characters (also base64-encoded).
 */
export function parseAesKey(aesKeyBase64: string): Buffer {
  const raw = Buffer.from(aesKeyBase64, 'base64');
  if (raw.length === 16) return raw;
  return Buffer.from(raw.toString('utf-8'), 'hex');
}

/**
 * Fetch a URL with timeout and retry support.
 * Only retries on 5xx responses; 4xx and network errors throw immediately.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  opts: { timeoutMs?: number; retries?: number } = {},
): Promise<Response> {
  const { timeoutMs = 30_000, retries = 1 } = opts;

  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...init, signal: controller.signal });

      if (res.status >= 500 && attempt < retries - 1) {
        logger.warn('Request 5xx, retrying', { status: res.status, attempt });
        continue;
      }

      return res;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('Request timed out');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error('Request failed after retries');
}

export function buildCdnDownloadUrl(encryptQueryParam: string): string {
  if (!/^[A-Za-z0-9%=&+._~\-/]+$/.test(encryptQueryParam)) {
    throw new Error('Invalid CDN query parameter');
  }
  return `${CDN_BASE_URL}/download?encrypted_query_param=${encodeURIComponent(encryptQueryParam)}`;
}

export async function downloadAndDecrypt(
  encryptQueryParam: string,
  aesKeyBase64: string,
): Promise<Buffer> {
  const url = buildCdnDownloadUrl(encryptQueryParam);
  const response = await fetchWithTimeout(url, {}, { timeoutMs: 30_000 });

  if (!response.ok) {
    throw new Error(`CDN download failed: ${response.status} ${response.statusText}`);
  }

  const encrypted = Buffer.from(await response.arrayBuffer());
  const aesKey = parseAesKey(aesKeyBase64);
  const decrypted = decryptAesEcb(aesKey, encrypted);
  logger.info('CDN download and decrypt succeeded', { size: decrypted.length });

  return decrypted;
}
