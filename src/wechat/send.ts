import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { WeChatApi } from './api.js';
import { MessageItemType, MessageType, MessageState, TypingStatus, type MessageItem, type OutboundMessage } from './types.js';
import { uploadFile, type UploadedMedia } from './upload.js';
import { logger } from '../logger.js';

const TYPING_KEEPALIVE_MS = 5_000;
const TICKET_TTL_MS = 24 * 60 * 60 * 1000;

interface TypingTicketCache {
  ticket: string;
  fetchedAt: number;
}

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function createSender(api: WeChatApi, botAccountId: string) {
  let clientCounter = 0;
  const typingTicketCache = new Map<string, TypingTicketCache>();

  function generateClientId(): string {
    return `wcc-${Date.now()}-${++clientCounter}`;
  }

  function buildMessage(toUserId: string, contextToken: string, items: MessageItem[]): OutboundMessage {
    return {
      from_user_id: botAccountId,
      to_user_id: toUserId,
      client_id: generateClientId(),
      message_type: MessageType.BOT,
      message_state: MessageState.FINISH,
      context_token: contextToken,
      item_list: items,
    };
  }

  async function getTypingTicket(userId: string, contextToken?: string): Promise<string> {
    const cached = typingTicketCache.get(userId);
    if (cached && Date.now() - cached.fetchedAt < TICKET_TTL_MS) {
      return cached.ticket;
    }
    try {
      const resp = await api.getConfig(userId, contextToken);
      if (resp.ret === 0 && resp.typing_ticket) {
        typingTicketCache.set(userId, { ticket: resp.typing_ticket, fetchedAt: Date.now() });
        return resp.typing_ticket;
      }
      logger.warn('getConfig returned no typing_ticket', { ret: resp.ret });
    } catch (err) {
      logger.warn('getConfig failed', { err: formatError(err) });
    }
    return '';
  }

  function sendTypingStatus(toUserId: string, ticket: string, status: number): Promise<void> {
    return api.sendTyping({
      ilink_user_id: toUserId,
      typing_ticket: ticket,
      status,
    });
  }

  function startTyping(toUserId: string, contextToken: string): () => void {
    let cancelled = false;

    (async () => {
      const ticket = await getTypingTicket(toUserId, contextToken);
      if (!ticket || cancelled) return;

      try {
        await sendTypingStatus(toUserId, ticket, TypingStatus.TYPING);
      } catch (err) {
        logger.debug('sendTyping start failed', { err: formatError(err) });
        return;
      }

      while (!cancelled) {
        await new Promise(r => setTimeout(r, TYPING_KEEPALIVE_MS));
        if (cancelled) break;
        try {
          await sendTypingStatus(toUserId, ticket, TypingStatus.TYPING);
        } catch {
          break;
        }
      }

      try {
        await sendTypingStatus(toUserId, ticket, TypingStatus.CANCEL);
      } catch {
        // best-effort cancel
      }
    })();

    return () => {
      cancelled = true;
    };
  }

  async function sendText(toUserId: string, contextToken: string, text: string): Promise<void> {
    const items: MessageItem[] = [{ type: MessageItemType.TEXT, text_item: { text } }];
    const msg = buildMessage(toUserId, contextToken, items);

    logger.info('Sending text message', { toUserId, clientId: msg.client_id, textLength: text.length });
    await api.sendMessage({ msg });
    logger.info('Text message sent', { toUserId, clientId: msg.client_id });
  }

  function buildFileItem(media: UploadedMedia): MessageItem {
    const aesKeyBase64 = Buffer.from(media.aesKeyHex).toString('base64');
    const mediaObj = {
      encrypt_query_param: media.encryptQueryParam,
      aes_key: aesKeyBase64,
      encrypt_type: 1,
    };

    if (media.mediaType === 'image') {
      return { type: MessageItemType.IMAGE, image_item: { media: mediaObj, mid_size: media.fileSize } };
    }
    return {
      type: MessageItemType.FILE,
      file_item: { media: mediaObj, file_name: media.fileName, len: String(media.rawSize) },
    };
  }

  async function sendFile(toUserId: string, contextToken: string, filePath: string): Promise<void> {
    const resolved = resolve(filePath.replace(/^~/, homedir()));
    if (!existsSync(resolved)) {
      await sendText(toUserId, contextToken, `文件不存在: ${resolved}`);
      return;
    }

    try {
      const media = await uploadFile(api, toUserId, resolved);
      const item = buildFileItem(media);
      const msg = buildMessage(toUserId, contextToken, [item]);

      logger.info('Sending file message', { toUserId, clientId: msg.client_id, fileName: media.fileName, mediaType: media.mediaType });
      await api.sendMessage({ msg });
      logger.info('File message sent', { toUserId, clientId: msg.client_id, fileName: media.fileName });
    } catch (err) {
      const errMsg = formatError(err);
      logger.error('Failed to send file', { filePath: resolved, error: errMsg });
      if (!errMsg.includes('rate-limited')) {
        await sendText(toUserId, contextToken, `发送文件失败: ${errMsg}`);
      }
      throw err;
    }
  }

  return { sendText, startTyping, sendFile };
}
