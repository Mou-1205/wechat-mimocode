import process from 'node:process';
import { join, basename } from 'node:path';
import { unlinkSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { WeChatApi } from './wechat/api.js';
import { saveAccount, loadLatestAccount, type AccountData } from './wechat/accounts.js';
import { startQrLogin, waitForQrScan } from './wechat/login.js';
import { createMonitor, type MonitorCallbacks } from './wechat/monitor.js';
import { createSender } from './wechat/send.js';
import { downloadImage, extractText, extractFirstImageUrl, extractFirstFileItem, downloadFile } from './wechat/media.js';
import { createSessionStore, type Session } from './session.js';
import { routeCommand, type CommandContext, type CommandResult } from './commands/router.js';
import { mimocodeQuery, mimocodeCompact, type QueryOptions } from './mimocode/provider.js';
import { loadConfig, saveConfig, type Config } from './config.js';
import { logger } from './logger.js';
import { DATA_DIR } from './constants.js';
import { MessageType, type WeixinMessage, type MessageItem } from './wechat/types.js';
import { splitMessage, extractFilePathsFromText, isAutoPushable } from './utils/message-splitter.js';
import { promptUser, openFile } from './utils/system.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HandlerContext {
  account: AccountData;
  session: Session;
  sessionStore: ReturnType<typeof createSessionStore>;
  sender: ReturnType<typeof createSender>;
  config: Config;
  activeControllers: Map<string, AbortController>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractTextFromItems(items: MessageItem[]): string {
  return items.map((item) => extractText(item)).filter(Boolean).join('\n');
}

function resolveCwd(session: Session, config: Config): string {
  return (session.workingDirectory || config.workingDirectory).replace(/^~/, homedir());
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.message.includes('abort'));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

async function runSetup(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true });
  const QR_PATH = join(DATA_DIR, 'qrcode.png');

  console.log('正在设置...\n');

  while (true) {
    const { qrcodeUrl, qrcodeId } = await startQrLogin();

    const isHeadlessLinux = process.platform === 'linux' &&
      !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY;

    if (isHeadlessLinux) {
      try {
        const qrcodeTerminal = await import('qrcode-terminal');
        console.log('请用微信扫描下方二维码：\n');
        qrcodeTerminal.default.generate(qrcodeUrl, { small: true });
        console.log();
        console.log('二维码链接：', qrcodeUrl);
        console.log();
      } catch {
        logger.warn('qrcode-terminal not available, falling back to URL');
        console.log('无法在终端显示二维码，请访问链接：');
        console.log(qrcodeUrl);
        console.log();
      }
    } else {
      const QRCode = await import('qrcode');
      const pngData = await QRCode.toBuffer(qrcodeUrl, { type: 'png', width: 400, margin: 2 });
      writeFileSync(QR_PATH, pngData);

      openFile(QR_PATH);
      console.log('已打开二维码图片，请用微信扫描：');
      console.log(`图片路径: ${QR_PATH}\n`);
    }

    console.log('等待扫码绑定...');

    try {
      await waitForQrScan(qrcodeId);
      console.log('✅ 绑定成功!');
      break;
    } catch (err: unknown) {
      if (errorMessage(err).includes('expired')) {
        console.log('⚠️ 二维码已过期，正在刷新...\n');
        continue;
      }
      throw err;
    }
  }

  try { unlinkSync(QR_PATH); } catch {
    logger.warn('Failed to clean up QR image', { path: QR_PATH });
  }

  const workingDir = await promptUser('请输入工作目录', join(homedir(), 'Documents', 'MiMoCode'));
  const config = loadConfig();
  config.workingDirectory = workingDir;
  saveConfig(config);

  console.log('运行 npm run daemon -- start 启动服务');
}

// ---------------------------------------------------------------------------
// Daemon
// ---------------------------------------------------------------------------

async function runDaemon(): Promise<void> {
  const config = loadConfig();
  const accountOrNull = loadLatestAccount();

  if (!accountOrNull) {
    console.error('未找到账号，请先运行 node dist/main.js setup');
    process.exit(1);
    return;
  }

  const account = accountOrNull;

  const api = new WeChatApi(account.botToken, account.baseUrl);
  const sessionStore = createSessionStore();
  const session: Session = sessionStore.load(account.accountId);

  if (config.workingDirectory && session.workingDirectory === process.cwd()) {
    session.workingDirectory = config.workingDirectory;
    sessionStore.save(account.accountId, session);
  }

  if (session.state !== 'idle') {
    logger.warn('Resetting stale session state on startup', { state: session.state });
    session.state = 'idle';
    sessionStore.save(account.accountId, session);
  }

  const sender = createSender(api, account.accountId);
  const sharedCtx = { lastContextToken: '' };
  const activeControllers = new Map<string, AbortController>();

  const messageQueue: WeixinMessage[] = [];
  let processingQueue = false;

  const ctx: HandlerContext = { account, session, sessionStore, sender, config, activeControllers };

  async function drainQueue(): Promise<void> {
    if (processingQueue) return;
    processingQueue = true;
    while (messageQueue.length > 0) {
      const msg = messageQueue.shift()!;
      await handleMessage(msg, ctx, sharedCtx, messageQueue);
    }
    processingQueue = false;
  }

  function handlePriorityCommand(msg: WeixinMessage): boolean {
    if (msg.message_type !== MessageType.USER || !msg.item_list) return false;
    const text = extractTextFromItems(msg.item_list);
    if (!text.startsWith('/stop') && !text.startsWith('/clear')) return false;
    if (session.state !== 'processing') return false;

    const ctrl = activeControllers.get(account.accountId);
    if (ctrl) { ctrl.abort(); activeControllers.delete(account.accountId); }
    session.state = 'idle';
    sessionStore.save(account.accountId, session);

    if (text.startsWith('/stop')) {
      messageQueue.length = 0;
      sender.sendText(msg.from_user_id!, msg.context_token ?? '', '⏹ 已停止当前对话，排队中的消息已清空。').catch(() => {});
    }
    return true;
  }

  const callbacks: MonitorCallbacks = {
    onMessage: async (msg: WeixinMessage) => {
      if (handlePriorityCommand(msg)) return;
      messageQueue.push(msg);
      drainQueue();
    },
    onSessionExpired: () => {
      logger.warn('Session expired, will keep retrying...');
      console.error('⚠️ 微信会话已过期，请重新运行 setup 扫码绑定');
    },
  };

  const monitor = createMonitor(api, callbacks);

  function shutdown(): void {
    logger.info('Shutting down...');
    monitor.stop();
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  logger.info('Daemon started', { accountId: account.accountId });
  console.log(`已启动 (账号: ${account.accountId})`);

  await monitor.run();
}

// ---------------------------------------------------------------------------
// Message handling
// ---------------------------------------------------------------------------

async function handleMessage(
  msg: WeixinMessage,
  ctx: HandlerContext,
  sharedCtx: { lastContextToken: string },
  messageQueue: WeixinMessage[],
): Promise<void> {
  const { account, session, sessionStore, sender, config, activeControllers } = ctx;

  if (msg.message_type !== MessageType.USER) return;
  if (!msg.from_user_id || !msg.item_list) return;
  if (account.userId && msg.from_user_id !== account.userId) return;

  const contextToken = msg.context_token ?? '';
  const fromUserId = msg.from_user_id;
  sharedCtx.lastContextToken = contextToken;

  const userText = extractTextFromItems(msg.item_list);
  const imageItem = extractFirstImageUrl(msg.item_list);
  const fileItem = extractFirstFileItem(msg.item_list);

  if (session.state === 'processing' && !userText.startsWith('/')) return;

  if (userText.startsWith('/')) {
    const result = handleSlashCommand(userText, ctx, fromUserId, contextToken, imageItem, fileItem);
    if (result !== null) {
      await result;
      return;
    }
  }

  if (!userText && !imageItem && !fileItem) {
    await sender.sendText(fromUserId, contextToken, '暂不支持此类型消息，请发送文字、语音、图片或文件');
    return;
  }

  await sendToMimoCode(userText, imageItem, fileItem, fromUserId, contextToken, ctx);
}

function handleSlashCommand(
  userText: string,
  ctx: HandlerContext,
  fromUserId: string,
  contextToken: string,
  imageItem: MessageItem | undefined,
  fileItem: MessageItem | undefined,
): Promise<void> | null {
  const { account, session, sessionStore, sender, config, activeControllers } = ctx;

  const updateSession = (partial: Partial<Session>) => {
    Object.assign(session, partial);
    sessionStore.save(account.accountId, session);
  };

  const cmdCtx: CommandContext = {
    accountId: account.accountId,
    session,
    updateSession,
    clearSession: () => sessionStore.clear(account.accountId),
    getChatHistoryText: (limit?: number) => sessionStore.getChatHistoryText(session, limit),
    text: userText,
  };

  const result: CommandResult = routeCommand(cmdCtx);

  if (result.handled && result.reply) {
    const send = sender.sendText(fromUserId, contextToken, result.reply);
    if (result.resumeSession) {
      session.sdkSessionId = result.resumeSession;
      sessionStore.save(account.accountId, session);
    }
    return send;
  }

  if (result.handled && result.compactSession) {
    return handleCompactCommand(fromUserId, contextToken, ctx);
  }

  if (result.handled && result.claudePrompt) {
    return sendToMimoCode(result.claudePrompt, imageItem, fileItem, fromUserId, contextToken, ctx);
  }

  if (result.handled && result.sendFile) {
    return sender.sendFile(fromUserId, contextToken, result.sendFile);
  }

  if (result.handled) return Promise.resolve();

  return null;
}

async function handleCompactCommand(
  fromUserId: string,
  contextToken: string,
  ctx: HandlerContext,
): Promise<void> {
  const { session, sender, config } = ctx;
  const cwd = resolveCwd(session, config);

  await sender.sendText(fromUserId, contextToken, '⏳ 正在压缩上下文...');
  const compactResult = await mimocodeCompact(session.sdkSessionId!, cwd);

  if (compactResult.error) {
    logger.error('Compact failed', { error: compactResult.error });
    await sender.sendText(fromUserId, contextToken, `❌ 压缩失败: ${compactResult.error}`);
  } else {
    const reply = compactResult.summary
      ? `✅ 上下文已压缩\n\n${compactResult.summary}`
      : '✅ 上下文已压缩';
    await sender.sendText(fromUserId, contextToken, reply);
  }
}

// ---------------------------------------------------------------------------
// MiMoCode query
// ---------------------------------------------------------------------------

async function sendToMimoCode(
  userText: string,
  imageItem: MessageItem | undefined,
  fileItem: MessageItem | undefined,
  fromUserId: string,
  contextToken: string,
  ctx: HandlerContext,
): Promise<void> {
  const { account, session, sessionStore, sender, config, activeControllers } = ctx;

  session.state = 'processing';
  sessionStore.save(account.accountId, session);

  const abortController = new AbortController();
  activeControllers.set(account.accountId, abortController);

  let flushTimer: ReturnType<typeof setInterval> | undefined;

  sessionStore.addChatMessage(session, 'user', userText || '(图片)');

  const stopTyping = sender.startTyping(fromUserId, contextToken);

  try {
    const images = await prepareImageContext(imageItem);
    const prompt = await prepareFilePrompt(userText, fileItem);
    const flusher = createStreamFlusher(fromUserId, contextToken, sender);

    flushTimer = startSilenceTimer(fromUserId, contextToken, sender, flusher);

    const queryOptions = buildQueryOptions(prompt, session, config, images, abortController, flusher);
    let result = await mimocodeQuery(queryOptions);

    if (result.error && queryOptions.resume) {
      logger.warn('Resume failed, retrying without resume', { error: result.error, sessionId: queryOptions.resume });
      queryOptions.resume = undefined;
      session.sdkSessionId = undefined;
      sessionStore.save(account.accountId, session);
      result = await mimocodeQuery(queryOptions);
    }

    clearInterval(flushTimer);
    await flusher.flush();

    await sendResult(result, flusher.anySent, fromUserId, contextToken, session, sessionStore, sender, config, account);
  } catch (err) {
    if (isAbortError(err)) {
      logger.info('MiMoCode query aborted by new message');
    } else {
      logger.error('Error in sendToMimoCode', { error: errorMessage(err) });
      await sender.sendText(fromUserId, contextToken, '处理消息时出错，请稍后重试。');
    }
    session.state = 'idle';
    sessionStore.save(account.accountId, session);
  } finally {
    clearInterval(flushTimer);
    stopTyping();
    if (activeControllers.get(account.accountId) === abortController) {
      activeControllers.delete(account.accountId);
    }
  }
}

async function prepareImageContext(imageItem: MessageItem | undefined): Promise<QueryOptions['images']> {
  if (!imageItem) return undefined;
  const base64DataUri = await downloadImage(imageItem);
  if (!base64DataUri) return undefined;

  const matches = base64DataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) return undefined;

  return [{
    type: 'image',
    source: { type: 'base64', media_type: matches[1], data: matches[2] },
  }];
}

async function prepareFilePrompt(userText: string, fileItem: MessageItem | undefined): Promise<string> {
  let prompt = userText || '请分析这张图片';
  if (!fileItem) return prompt;

  const filePath = await downloadFile(fileItem);
  if (!filePath) return prompt;

  const fileName = fileItem.file_item?.file_name || basename(filePath);
  return userText
    ? `${userText}\n\n用户发送了文件: ${fileName}\n文件已保存到: ${filePath}\n请先读取这个文件再回答。`
    : `用户发送了文件: ${fileName}\n文件已保存到: ${filePath}\n请读取这个文件并总结其内容。`;
}

interface StreamFlusher {
  flush: () => Promise<void>;
  onText: (delta: string) => Promise<void>;
  onBlockEnd: () => void;
  anySent: boolean;
}

function createStreamFlusher(
  fromUserId: string,
  contextToken: string,
  sender: ReturnType<typeof createSender>,
): StreamFlusher {
  const MIN_BATCH_LEN = 30;
  const SOFT_LIMIT = 3800;

  let textBuffer = '';
  let sent = false;
  let lastSentTime = Date.now();
  let flushChain: Promise<void> = Promise.resolve();

  function endsAtBoundary(text: string): boolean {
    return /\n\n\s*$/.test(text) || /\n[-*_]{3,}\s*$/.test(text);
  }

  function flush(): Promise<void> {
    const captured = textBuffer.trim();
    textBuffer = '';
    if (!captured) return flushChain;

    flushChain = flushChain.then(async () => {
      const chunks = splitMessage(captured);
      for (const chunk of chunks) {
        await sender.sendText(fromUserId, contextToken, chunk);
      }
      sent = true;
      lastSentTime = Date.now();
    }).catch((err) => {
      logger.error('flushText send failed', { error: errorMessage(err) });
    });
    return flushChain;
  }

  return {
    flush,
    get anySent() { return sent; },
    onText: async (delta: string) => {
      textBuffer += delta;
      const shouldFlush =
        (endsAtBoundary(textBuffer) && textBuffer.trim().length >= MIN_BATCH_LEN)
        || textBuffer.length > SOFT_LIMIT;
      if (shouldFlush) await flush();
    },
    onBlockEnd: () => {
      if (textBuffer.trim().length >= MIN_BATCH_LEN || textBuffer.length > SOFT_LIMIT) {
        flush();
      }
    },
  };
}

function startSilenceTimer(
  fromUserId: string,
  contextToken: string,
  sender: ReturnType<typeof createSender>,
  flusher: StreamFlusher,
): ReturnType<typeof setInterval> {
  const SILENCE_MS = 5 * 60 * 1000;
  const MESSAGES = [
    '我还在处理中，这个问题有点复杂，请再稍等一下',
    '正在努力干活中，马上就有结果了，请稍等片刻',
    '有点复杂正在处理，再给我一点时间，很快就好',
    '快好了别着急，正在收尾阶段，马上给你回复',
    '还在跑呢，任务量比较大，不过马上就能出结果了',
    '任务比想象的复杂一些，再等等我，正在全力处理',
    '正在处理中，进展顺利，再等一会儿就好',
    '还没完不过已经快了，再给我一分钟就能搞定',
    '我在认真思考这个问题，请再稍等一会儿',
    '稍微有点棘手，不过已经快解决了，再等我一下',
  ];

  let lastSentTime = Date.now();

  return setInterval(() => {
    if (Date.now() - lastSentTime > SILENCE_MS) {
      const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
      sender.sendText(fromUserId, contextToken, msg).catch(() => {});
      lastSentTime = Date.now();
    }
  }, 2000);
}

function buildQueryOptions(
  prompt: string,
  session: Session,
  config: Config,
  images: QueryOptions['images'],
  abortController: AbortController,
  flusher: StreamFlusher,
): QueryOptions {
  return {
    prompt,
    cwd: resolveCwd(session, config),
    resume: session.sdkSessionId,
    model: session.model || config.model,
    systemPrompt: [
      '你正在通过微信与用户对话，不是在终端里。不要让用户去终端操作。如果用户需要文件，直接输出文件地址就行，会自动识别解析推送文件到用户的微信中。',
      config.systemPrompt,
    ].filter(Boolean).join('\n'),
    abortController,
    images,
    onText: flusher.onText,
    onBlockEnd: flusher.onBlockEnd,
  };
}

async function sendResult(
  result: { text: string; sessionId: string; error?: string },
  streamed: boolean,
  fromUserId: string,
  contextToken: string,
  session: Session,
  sessionStore: ReturnType<typeof createSessionStore>,
  sender: ReturnType<typeof createSender>,
  config: Config,
  account: AccountData,
): Promise<void> {
  if (result.text) {
    if (result.error) {
      logger.warn('MiMoCode query had error but returned text, using text', { error: result.error });
    }
    sessionStore.addChatMessage(session, 'assistant', result.text);
    if (!streamed) {
      const chunks = splitMessage(result.text);
      for (const chunk of chunks) {
        await sender.sendText(fromUserId, contextToken, chunk);
      }
    }
  } else if (result.error) {
    logger.error('MiMoCode query error', { error: result.error });
    await sender.sendText(fromUserId, contextToken, `MiMoCode 处理请求时出错: ${result.error}`);
  } else if (!streamed) {
    await sender.sendText(fromUserId, contextToken, 'MiMoCode 无返回内容（可能因权限被拒而终止）');
  }

  session.sdkSessionId = result.sessionId || undefined;
  session.state = 'idle';
  sessionStore.save(account.accountId, session);

  if (result.text) {
    await autoPushDeliverables(result.text, fromUserId, contextToken, session, config, sender);
  }
}

async function autoPushDeliverables(
  text: string,
  fromUserId: string,
  contextToken: string,
  session: Session,
  config: Config,
  sender: ReturnType<typeof createSender>,
): Promise<void> {
  const cwd = resolveCwd(session, config);
  const detectedPaths = extractFilePathsFromText(text, cwd);
  const pushable = detectedPaths.filter(f => isAutoPushable(f) && existsSync(f));
  if (pushable.length === 0) return;

  let failedFiles: string[] = [];
  for (const filePath of pushable) {
    try {
      await sender.sendFile(fromUserId, contextToken, filePath);
    } catch {
      failedFiles.push(filePath);
    }
  }

  if (failedFiles.length === 0) return;

  for (let attempt = 0; attempt < 3; attempt++) {
    const delay = (attempt + 1) * 15_000;
    logger.warn(`Rate-limited, retrying ${failedFiles.length} file(s) in ${delay / 1000}s (attempt ${attempt + 1}/3)`);
    await new Promise(r => setTimeout(r, delay));

    const stillFailed: string[] = [];
    for (const filePath of failedFiles) {
      try {
        await sender.sendFile(fromUserId, contextToken, filePath);
      } catch {
        stillFailed.push(filePath);
      }
    }
    if (stillFailed.length === 0) break;
    failedFiles = stillFailed;
  }

  if (failedFiles.length > 0) {
    logger.error('File delivery failed after all retries', { files: failedFiles });
    await sender.sendText(fromUserId, contextToken, '文件推送失败（服务端限频），请稍后重试。').catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const command = process.argv[2];

if (command === 'setup') {
  runSetup().catch((err) => {
    logger.error('Setup failed', { error: errorMessage(err) });
    console.error('设置失败:', err);
    process.exit(1);
  });
} else if (command === 'daemon') {
  const subCmd = process.argv[3] || 'start';
  import('./daemon.js').then(({ handleDaemon }) => handleDaemon(subCmd)).catch((err) => {
    console.error('daemon 管理错误:', err);
    process.exit(1);
  });
} else if (command === '--version' || command === '-v') {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
  console.log(pkg.version);
} else {
  runDaemon().catch((err) => {
    logger.error('Daemon start failed', { error: errorMessage(err) });
    console.error('启动失败:', err);
    process.exit(1);
  });
}
