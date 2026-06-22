// WeChat Work (企业微信) protocol type definitions
// Extracted from the ClawBot WeChat plugin API

// ── Enums ──────────────────────────────────────────────────────────────────

/** Whether a message was sent by a human user or the bot. */
export enum MessageType {
  USER = 1,
  BOT = 2,
}

/** Content type of a single item inside a message. */
export enum MessageItemType {
  TEXT = 1,
  IMAGE = 2,
  VOICE = 3,
  FILE = 4,
  VIDEO = 5,
}

/** Delivery state of a message in the streaming pipeline. */
export enum MessageState {
  NEW = 0,
  GENERATING = 1,
  FINISH = 2,
}

// ── Media ──────────────────────────────────────────────────────────────────

/** Encrypted CDN resource descriptor used for downloading media. */
export interface CDNMedia {
  /** AES decryption key (hex-encoded). */
  aes_key: string;
  /** Signed query string appended to the CDN download URL. */
  encrypt_query_param: string;
  /** Direct CDN URL when the API returns one. */
  cdn_url?: string;
}

// ── Message Items ───────────────────────────────────────────────────────────

/** Plain-text payload. */
export interface TextItem {
  text: string;
}

/** Image payload with multiple possible representations across API versions. */
export interface ImageItem {
  cdn_media?: CDNMedia;
  /** Alternative field name used by some API versions. */
  aeskey?: string;
  /** Inline media descriptor (alternative to `cdn_media`). */
  media?: { encrypt_query_param: string; aes_key?: string; encrypt_type?: number };
  /** Direct download URL when available. */
  url?: string;
  /** Size in bytes of the medium-resolution variant. */
  mid_size?: number;
  /** Size in bytes of the high-definition variant. */
  hd_size?: number;
}

/** Voice message payload. */
export interface VoiceItem {
  media?: CDNMedia;
  /** Speech-to-text transcript, when available. */
  text?: string;
}

/** File attachment payload. */
export interface FileItem {
  cdn_media?: CDNMedia;
  /** Inline media descriptor (alternative to `cdn_media`). */
  media?: { encrypt_query_param: string; aes_key?: string; encrypt_type?: number };
  /** Original file name. */
  file_name?: string;
  /** File size as a string (raw byte count). */
  len?: string;
}

/** Video message payload. */
export interface VideoItem {
  cdn_media: CDNMedia;
}

/** A single content item within a WeChat message. */
export interface MessageItem {
  type: MessageItemType;
  text_item?: TextItem;
  image_item?: ImageItem;
  voice_item?: VoiceItem;
  file_item?: FileItem;
  video_item?: VideoItem;
}

// ── Weixin Message ──────────────────────────────────────────────────────────

/**
 * A message received from (or sent to) a WeChat conversation.
 * Fields are optional because partial payloads appear in various API responses.
 */
export interface WeixinMessage {
  /** Sequence number within the current sync window. */
  seq?: number;
  /** Globally unique message identifier. */
  message_id?: number;
  /** Sender's user ID. */
  from_user_id?: string;
  /** Recipient's user ID. */
  to_user_id?: string;
  /** Message creation time in milliseconds since epoch. */
  create_time_ms?: number;
  message_type?: MessageType;
  message_state?: MessageState;
  /** Ordered list of content items in this message. */
  item_list?: MessageItem[];
  /** Opaque token echoed back when replying. */
  context_token?: string;
}

// ── GetUpdates API ──────────────────────────────────────────────────────────

/** Request body for the long-polling getUpdates endpoint. */
export interface GetUpdatesReq {
  /** Opaque sync cursor returned by the previous call. */
  get_updates_buf?: string;
}

/** Response from the getUpdates long-polling endpoint. */
export interface GetUpdatesResp {
  /** Numeric result code (0 = success). */
  ret?: number;
  /** Human-readable error message, present when `ret !== 0`. */
  retmsg?: string;
  /** Persistent sync cursor — pass to the next call. */
  sync_buf: string;
  /** Ephemeral poll cursor — pass as `get_updates_buf` on next call. */
  get_updates_buf: string;
  /** New or updated messages since the last poll, if any. */
  msgs?: WeixinMessage[];
}

// ── SendMessage API ─────────────────────────────────────────────────────────

/** A message ready to be sent via the sendMessage endpoint. */
export interface OutboundMessage {
  from_user_id: string;
  to_user_id: string;
  /** Client-generated unique ID for deduplication. */
  client_id: string;
  message_type: MessageType;
  message_state: MessageState;
  /** Token from the inbound message being replied to. */
  context_token: string;
  item_list: MessageItem[];
}

/** Request wrapper for the sendMessage endpoint. */
export interface SendMessageReq {
  msg: OutboundMessage;
}

// ── Typing API ──────────────────────────────────────────────────────────────

/** Typing indicator statuses understood by the server. */
export const TypingStatus = {
  TYPING: 1,
  CANCEL: 2,
} as const;

/** Request body for the sendTyping endpoint. */
export interface SendTypingReq {
  ilink_user_id: string;
  typing_ticket: string;
  status: number;
}

/** Response from the getConfig endpoint (provides a typing ticket). */
export interface GetConfigResp {
  /** Numeric result code (0 = success). */
  ret?: number;
  /** Human-readable error message. */
  errmsg?: string;
  /** One-time ticket required by subsequent sendTyping calls. */
  typing_ticket?: string;
}

// ── GetUploadUrl API ────────────────────────────────────────────────────────

/** Media types accepted by the upload endpoint. */
export const UploadMediaType = {
  IMAGE: 1,
  VIDEO: 2,
  FILE: 3,
  VOICE: 4,
} as const;

/** Request body for the getUploadUrl endpoint. */
export interface GetUploadUrlReq {
  /** Unique key identifying the file on the CDN. */
  filekey: string;
  media_type: number;
  to_user_id: string;
  /** Original file size in bytes. */
  rawsize: number;
  /** MD5 hex digest of the original file. */
  rawfilemd5: string;
  /** Encrypted/transcoded file size in bytes. */
  filesize: number;
  no_need_thumb: boolean;
  aeskey: string;
  base_info: {
    channel_version: string;
    bot_agent: string;
  };
}

/** Response from the getUploadUrl endpoint. */
export interface GetUploadUrlResp {
  /** Numeric result code (0 = success). */
  ret?: number;
  /** Opaque parameter string to include in the upload request. */
  upload_param?: string;
  /** Fully-qualified URL to POST the file to. */
  upload_full_url?: string;
}
