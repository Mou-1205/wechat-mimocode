import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createInterface } from 'node:readline';
import { logger } from '../logger.js';
import { DEFAULT_MODEL } from '../constants.js';
import { tagSessionAsWeChat } from './session-scanner.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface QueryOptions {
  prompt: string;
  cwd: string;
  resume?: string;
  model?: string;
  systemPrompt?: string;
  images?: Array<{
    type: "image";
    source: { type: "base64"; media_type: string; data: string };
  }>;
  /** Called each time an assistant text chunk is produced (e.g. before/after tool calls). */
  onText?: (text: string) => Promise<void> | void;
  /** Called when a content block ends — use to flush buffered text. */
  onBlockEnd?: () => Promise<void> | void;
  /** Optional abort controller to cancel the query (e.g. when user sends a new message). */
  abortController?: AbortController;
}

export interface QueryResult {
  text: string;
  sessionId: string;
  error?: string;
}

export interface CompactResult {
  summary: string;
  sessionId: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface NJsonEvent {
  type?: string;
  sessionID?: string;
  part?: { text?: string; reason?: string; error?: string };
  error?: { data?: { message?: string }; message?: string; name?: string };
}

interface ProcessResult {
  textParts: string[];
  sessionId: string;
  errorMessage?: string;
}

interface SpawnConfig {
  args: string[];
  cwd: string;
  stdinData?: string;
  timeoutMs: number;
  abortController?: AbortController;
  onText?: (text: string) => Promise<void> | void;
  onBlockEnd?: () => Promise<void> | void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEMP_DIR = join(tmpdir(), 'wechat-mimocode');

function extractErrorMessage(err: NJsonEvent['error']): string {
  return err?.data?.message || err?.message || err?.name || 'Unknown error';
}

async function saveImageTemp(images: NonNullable<QueryOptions['images']>): Promise<string[]> {
  await mkdir(TEMP_DIR, { recursive: true });
  const paths: string[] = [];
  for (const img of images) {
    const ext = img.source.media_type.split('/')[1] || 'png';
    const fileName = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filePath = join(TEMP_DIR, fileName);
    await writeFile(filePath, Buffer.from(img.source.data, 'base64'));
    paths.push(filePath);
  }
  return paths;
}

async function cleanupTempFiles(paths: string[]): Promise<void> {
  await Promise.all(paths.map(p => unlink(p).catch(() => {})));
}

function buildArgs(options: {
  cwd: string;
  resume?: string;
  model?: string;
  tempImagePaths?: string[];
}): string[] {
  const args = [
    'run',
    '--format', 'json',
    '--dangerously-skip-permissions',
    '--dir', options.cwd,
  ];
  if (options.resume) args.push('--session', options.resume);
  const model = options.model || DEFAULT_MODEL;
  args.push('-m', model);
  for (const imgPath of options.tempImagePaths ?? []) {
    args.push('-f', imgPath);
  }
  return args;
}

function handleEvent(obj: NJsonEvent, state: ProcessResult, callbacks: {
  onText?: (text: string) => Promise<void> | void;
  onBlockEnd?: () => Promise<void> | void;
}): void {
  if (obj.sessionID && !state.sessionId) {
    state.sessionId = obj.sessionID;
  }

  switch (obj.type) {
    case 'text': {
      const text = obj.part?.text ?? '';
      if (text) {
        state.textParts.push(text);
        if (callbacks.onText) Promise.resolve(callbacks.onText(text)).catch(() => {});
      }
      if (callbacks.onBlockEnd) Promise.resolve(callbacks.onBlockEnd()).catch(() => {});
      break;
    }
    case 'tool_use': {
      if (callbacks.onBlockEnd) Promise.resolve(callbacks.onBlockEnd()).catch(() => {});
      break;
    }
    case 'error': {
      state.errorMessage = String(extractErrorMessage(obj.error));
      logger.error('CLI returned error event', { error: state.errorMessage });
      break;
    }
    case 'step_finish': {
      if (obj.part?.reason === 'error') {
        state.errorMessage = obj.part?.error || 'Step finished with error';
      }
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Common process runner
// ---------------------------------------------------------------------------

function spawnAndCollect(config: SpawnConfig): Promise<ProcessResult> {
  const state: ProcessResult = { textParts: [], sessionId: '' };

  return new Promise<ProcessResult>((resolve) => {
    let settled = false;
    let child: ChildProcess | undefined;

    const finish = (result: ProcessResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    try {
      child = spawn('mimo', config.args, {
        cwd: config.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
        shell: process.platform === 'win32',
        windowsVerbatimArguments: false,
        windowsHide: true,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      finish({ textParts: [], sessionId: '', errorMessage: `Failed to spawn mimo: ${msg}` });
      return;
    }

    if (config.stdinData) {
      child.stdin!.write(config.stdinData);
      child.stdin!.end();
    }

    const timeoutId = setTimeout(() => {
      logger.warn('MiMoCode CLI timed out, killing process');
      child!.kill('SIGTERM');
      finish({ ...state });
    }, config.timeoutMs);

    const onAbort = () => {
      logger.info('MiMoCode CLI query aborted');
      child!.kill('SIGTERM');
      finish({ ...state });
    };
    config.abortController?.signal.addEventListener('abort', onAbort, { once: true });

    const stderrParts: string[] = [];
    child.stderr!.setEncoding('utf8');
    child.stderr!.on('data', (chunk: string) => { stderrParts.push(chunk); });

    const rl = createInterface({ input: child.stdout! });
    rl.on('line', (line: string) => {
      if (!line.trim()) return;
      let obj: NJsonEvent;
      try {
        obj = JSON.parse(line);
      } catch {
        return;
      }
      handleEvent(obj, state, config);
    });

    child.on('close', (code: number | null) => {
      clearTimeout(timeoutId);
      config.abortController?.signal.removeEventListener('abort', onAbort);

      if (code !== 0 && code !== null && !state.textParts.length && !state.errorMessage) {
        const stderr = stderrParts.join('').trim();
        state.errorMessage = stderr || `mimo exited with code ${code}`;
        logger.error('MiMoCode CLI exited with error', { code, stderr: stderr.slice(0, 500) });
      }

      finish(state);
    });

    child.on('error', (err: Error) => {
      clearTimeout(timeoutId);
      config.abortController?.signal.removeEventListener('abort', onAbort);
      finish({ textParts: [], sessionId: '', errorMessage: `Failed to spawn mimo: ${err.message}` });
    });
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function mimocodeQuery(options: QueryOptions): Promise<QueryResult> {
  const { prompt, cwd, resume, model, systemPrompt, images, onText, onBlockEnd, abortController } = options;

  logger.info("Starting MiMoCode CLI query", {
    cwd, model, resume: !!resume, hasImages: !!images?.length,
  });

  const tempImagePaths = images?.length ? await saveImageTemp(images) : [];

  const args = buildArgs({ cwd, resume, model, tempImagePaths });
  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

  const result = await spawnAndCollect({
    args, cwd, stdinData: fullPrompt,
    timeoutMs: 60 * 60 * 1000,
    abortController, onText, onBlockEnd,
  });

  cleanupTempFiles(tempImagePaths).catch(() => {});

  const fullText = result.textParts.join('\n').trim();
  const errorMessage = !fullText && !result.errorMessage
    ? 'MiMoCode returned an empty response.'
    : result.errorMessage;

  logger.info("MiMoCode CLI query completed", {
    sessionId: result.sessionId,
    textLength: fullText.length,
    hasError: !!errorMessage,
  });

  if (result.sessionId) tagSessionAsWeChat(result.sessionId);

  return { text: fullText, sessionId: result.sessionId, error: errorMessage };
}

export async function mimocodeCompact(sessionId: string, cwd: string): Promise<CompactResult> {
  const args = buildArgs({ cwd, resume: sessionId });

  const result = await spawnAndCollect({
    args, cwd, stdinData: '/compact',
    timeoutMs: 5 * 60 * 1000,
  });

  const summary = result.textParts.join('\n').trim();
  return { summary, sessionId: result.sessionId || sessionId, error: result.errorMessage };
}
