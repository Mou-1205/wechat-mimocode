import type { AccountData } from './accounts.js';
import { DEFAULT_BASE_URL, saveAccount } from './accounts.js';
import { logger } from '../logger.js';

const QR_CODE_URL = `${DEFAULT_BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=3`;
const QR_STATUS_URL = `${DEFAULT_BASE_URL}/ilink/bot/get_qrcode_status`;
const POLL_INTERVAL_MS = 3_000;
const REQUEST_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export class LoginError extends Error {
  constructor(
    message: string,
    public readonly code: LoginErrorCode,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'LoginError';
  }
}

export type LoginErrorCode =
  | 'QR_REQUEST_FAILED'
  | 'QR_STATUS_FAILED'
  | 'QR_EXPIRED'
  | 'QR_CONFIRMED_MISSING_FIELDS'
  | 'QR_SCAN_FAILED';

interface QrCodeResponse {
  ret: number;
  qrcode?: string;
  qrcode_img_content?: string;
}

interface QrStatusResponse {
  ret: number;
  status: string;
  retmsg?: string;
  bot_token?: string;
  ilink_bot_id?: string;
  baseurl?: string;
  ilink_user_id?: string;
}

type QrStatus = 'wait' | 'scaned' | 'confirmed' | 'expired';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAILURE_STATUS_PATTERNS = ['not_support', 'version', 'forbid', 'reject', 'cancel'] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (e: unknown) {
    const err = e as Error & { code?: string };
    if (err.name === 'AbortError' || err.code === 'ETIMEDOUT') {
      throw new LoginError('Request timed out', 'QR_STATUS_FAILED', err);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function isFailureStatus(status: string): boolean {
  return FAILURE_STATUS_PATTERNS.some((pattern) => status.includes(pattern));
}

function buildAccountData(data: QrStatusResponse): AccountData {
  if (!data.bot_token || !data.ilink_bot_id || !data.ilink_user_id) {
    throw new LoginError(
      'QR confirmed but missing required fields in response',
      'QR_CONFIRMED_MISSING_FIELDS',
    );
  }
  return {
    botToken: data.bot_token,
    accountId: data.ilink_bot_id,
    baseUrl: data.baseurl || DEFAULT_BASE_URL,
    userId: data.ilink_user_id,
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Phase 1: Request a QR code for login. Returns the URL and ID. */
export async function startQrLogin(): Promise<{ qrcodeUrl: string; qrcodeId: string }> {
  logger.info('Requesting QR code');

  const res = await fetch(QR_CODE_URL);
  if (!res.ok) {
    throw new LoginError(`Failed to get QR code: HTTP ${res.status}`, 'QR_REQUEST_FAILED');
  }

  const data = (await res.json()) as QrCodeResponse;

  if (data.ret !== 0 || !data.qrcode_img_content || !data.qrcode) {
    throw new LoginError(`Failed to get QR code (ret=${data.ret})`, 'QR_REQUEST_FAILED');
  }

  logger.info('QR code obtained', { qrcodeId: data.qrcode });

  return {
    qrcodeUrl: data.qrcode_img_content,
    qrcodeId: data.qrcode,
  };
}

/**
 * Phase 2: Wait for the user to scan and confirm the QR code.
 * Throws LoginError with code 'QR_EXPIRED' on expiry so the caller can regenerate.
 * Returns the full AccountData on success.
 */
export async function waitForQrScan(qrcodeId: string): Promise<AccountData> {
  let currentQrcodeId = qrcodeId;

  while (true) {
    const url = `${QR_STATUS_URL}?qrcode=${encodeURIComponent(currentQrcodeId)}`;
    logger.debug('Polling QR status', { qrcodeId: currentQrcodeId });

    let res: Response;
    try {
      res = await fetchWithTimeout(url, REQUEST_TIMEOUT_MS);
    } catch (e: unknown) {
      if (e instanceof LoginError && e.code === 'QR_STATUS_FAILED') {
        logger.info('QR poll timed out, retrying');
        continue;
      }
      throw e;
    }

    if (!res.ok) {
      throw new LoginError(`Failed to check QR status: HTTP ${res.status}`, 'QR_STATUS_FAILED');
    }

    const data = (await res.json()) as QrStatusResponse;
    logger.debug('QR status response', { status: data.status });

    const status = data.status as QrStatus;

    switch (status) {
      case 'wait':
      case 'scaned':
        break;

      case 'confirmed': {
        const accountData = buildAccountData(data);
        saveAccount(accountData);
        logger.info('QR login successful', { accountId: accountData.accountId });
        return accountData;
      }

      case 'expired':
        logger.info('QR code expired');
        throw new LoginError('QR code expired', 'QR_EXPIRED');

      default: {
        const rawStatus = data.status ?? '';
        logger.warn('Unknown QR status', { status: rawStatus, retmsg: data.retmsg });
        if (isFailureStatus(rawStatus) || data.retmsg) {
          throw new LoginError(
            `二维码扫描失败: ${data.retmsg || rawStatus}`,
            'QR_SCAN_FAILED',
          );
        }
      }
    }

    await sleep(POLL_INTERVAL_MS);
  }
}
