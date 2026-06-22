import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { encryptAesEcb, aesEcbPaddedSize } from './crypto.js';
import { fetchWithTimeout } from './cdn.js';
import { WeChatApi } from './api.js';
import { UploadMediaType } from './types.js';
import { CDN_BASE_URL } from '../constants.js';
import { logger } from '../logger.js';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico']);

export interface UploadedMedia {
  mediaType: 'image' | 'file';
  encryptQueryParam: string;
  aesKeyHex: string;
  fileName: string;
  fileSize: number;
  rawSize: number;
}

export function isImageFile(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(extname(filePath).toLowerCase());
}

export async function uploadFile(
  api: WeChatApi,
  toUserId: string,
  filePath: string,
): Promise<UploadedMedia> {
  const stat = statSync(filePath);
  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(`文件过大 (${(stat.size / 1024 / 1024).toFixed(1)}MB)，最大支持 25MB`);
  }

  const fileName = basename(filePath);
  const isImage = isImageFile(filePath);
  const mediaType = isImage ? UploadMediaType.IMAGE : UploadMediaType.FILE;

  const plaintext = readFileSync(filePath);
  const rawSize = plaintext.length;
  const rawFileMd5 = createHash('md5').update(plaintext).digest('hex');
  const fileSize = aesEcbPaddedSize(rawSize);
  const fileKey = randomBytes(16).toString('hex');
  const aesKey = randomBytes(16);
  const aesKeyHex = aesKey.toString('hex');

  logger.info('Requesting upload URL', { fileName, rawSize, mediaType, toUserId });

  const uploadResp = await api.getUploadUrl({
    filekey: fileKey,
    media_type: mediaType,
    to_user_id: toUserId,
    rawsize: rawSize,
    rawfilemd5: rawFileMd5,
    filesize: fileSize,
    no_need_thumb: true,
    aeskey: aesKeyHex,
    base_info: {
      channel_version: '2.0.0',
      bot_agent: 'wechat-mimocode',
    },
  });

  logger.info('Upload URL response', { uploadResp });

  if (!uploadResp.upload_full_url && !uploadResp.upload_param) {
    throw new Error(`获取上传地址失败: ${JSON.stringify(uploadResp)}`);
  }

  const encrypted = encryptAesEcb(aesKey, plaintext);

  const uploadUrl = uploadResp.upload_full_url
    ?? `${CDN_BASE_URL}/upload?encrypted_query_param=${encodeURIComponent(uploadResp.upload_param!)}&filekey=${fileKey}`;

  logger.info('Uploading to CDN', { uploadUrl, encryptedSize: encrypted.length });

  const res = await fetchWithTimeout(
    uploadUrl,
    {
      method: 'POST',
      body: new Uint8Array(encrypted),
      headers: { 'Content-Type': 'application/octet-stream' },
    },
    { timeoutMs: 60_000, retries: 3 },
  );

  if (res.status >= 400) {
    const text = await res.text();
    throw new Error(`CDN 上传失败 (${res.status}): ${text.slice(0, 200)}`);
  }

  const encryptQueryParam = res.headers.get('x-encrypted-param');
  if (!encryptQueryParam) {
    throw new Error('CDN 上传成功但未返回 x-encrypted-param');
  }

  logger.info('CDN upload succeeded', { fileName });

  return {
    mediaType: isImage ? 'image' : 'file',
    encryptQueryParam,
    aesKeyHex,
    fileName,
    fileSize,
    rawSize,
  };
}
