import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import type { MessageItem, ImageItem, FileItem } from './types.js';
import { MessageItemType } from './types.js';
import { downloadAndDecrypt } from './cdn.js';
import { logger } from '../logger.js';

function detectMimeType(data: Buffer): string {
  if (data[0] === 0x89 && data[1] === 0x50) return 'image/png';
  if (data[0] === 0xFF && data[1] === 0xD8) return 'image/jpeg';
  if (data[0] === 0x47 && data[1] === 0x49) return 'image/gif';
  if (data[0] === 0x52 && data[1] === 0x49) return 'image/webp';
  if (data[0] === 0x42 && data[1] === 0x4D) return 'image/bmp';
  return 'image/jpeg';
}

interface CdnData {
  aesKey: string;
  encryptQueryParam: string;
}

function extractCdnData(item: ImageItem | FileItem): CdnData | null {
  const cdnMedia = item.cdn_media;
  const media = item.media;

  // Prefer cdn_media (older API format)
  if (cdnMedia?.aes_key && cdnMedia?.encrypt_query_param) {
    return { aesKey: cdnMedia.aes_key, encryptQueryParam: cdnMedia.encrypt_query_param };
  }

  // Fall back to media (newer API format)
  if (media?.encrypt_query_param) {
    const aesKey = media.aes_key ?? ('aeskey' in item ? (item as ImageItem).aeskey : undefined);
    if (aesKey) {
      return { aesKey, encryptQueryParam: media.encrypt_query_param };
    }
  }

  logger.warn('Item has no usable CDN data', {
    hasCdnMedia: !!cdnMedia,
    hasMedia: !!media,
  });
  return null;
}

export async function downloadImage(item: MessageItem): Promise<string | null> {
  const imageItem = item.image_item;
  if (!imageItem) return null;

  const cdnData = extractCdnData(imageItem);
  if (!cdnData) return null;

  try {
    const decrypted = await downloadAndDecrypt(cdnData.encryptQueryParam, cdnData.aesKey);
    const mimeType = detectMimeType(decrypted);
    const dataUri = `data:${mimeType};base64,${decrypted.toString('base64')}`;
    logger.info('Image downloaded and decrypted', { size: decrypted.length });
    return dataUri;
  } catch (err) {
    logger.warn('Failed to download image', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export function extractText(item: MessageItem): string {
  if (item.text_item?.text) return item.text_item.text;
  if (item.voice_item?.text) return item.voice_item.text;
  if (item.file_item?.file_name) return `[用户发送了文件: ${item.file_item.file_name}]`;
  if (item.type === MessageItemType.VIDEO) return '[用户发送了视频]';
  return '';
}

export function extractFirstImageUrl(items?: MessageItem[]): MessageItem | undefined {
  return items?.find((item) => item.type === MessageItemType.IMAGE);
}

export function extractFirstFileItem(items?: MessageItem[]): MessageItem | undefined {
  return items?.find((item) => item.type === MessageItemType.FILE);
}

export async function downloadFile(item: MessageItem): Promise<string | null> {
  const fileItem = item.file_item;
  if (!fileItem) return null;

  const cdnData = extractCdnData(fileItem);
  if (!cdnData) return null;

  try {
    const decrypted = await downloadAndDecrypt(cdnData.encryptQueryParam, cdnData.aesKey);
    const tmpDir = path.join(os.tmpdir(), 'wechat-mimocode');
    fs.mkdirSync(tmpDir, { recursive: true });
    const fileName = fileItem.file_name || `file-${Date.now()}.bin`;
    const filePath = path.join(tmpDir, fileName);
    fs.writeFileSync(filePath, decrypted);
    logger.info('File downloaded and saved', { path: filePath, size: decrypted.length, name: fileName });
    return filePath;
  } catch (err) {
    logger.warn('Failed to download file', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
