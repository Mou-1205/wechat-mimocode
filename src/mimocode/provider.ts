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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEMP_DIR = join(tmpdir(), 'wechat-mimocode');

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

// ---------------------------------------------------------------------------
// Compact (native /compact via CLI)
// ---------------------------------------------------------------------------

export interface CompactResult {
  summary: string;
  sessionId: string;
  error?: string;
}

export async function mimocodeCompact(sessionId: string, cwd: string): Promise<CompactResult> {
  const args: string[] = [
    'run',
    '--format', 'json',
    '--session', sessionId,
    '--dangerously-skip-permissions',
    '--dir', cwd,
  ];

  const QUERY_TIMEOUT_MS = 5 * 60 * 1000;

  return new Promise<CompactResult>((resolve) => {
    let settled = false;
    let child: ChildProcess | undefined;
    const textParts: string[] = [];
    let resultSessionId = '';
    let errorMessage: string | undefined;

    const finish = (result: CompactResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    try {
      child = spawn('mimo', args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
        shell: process.platform === 'win32',
        windowsVerbatimArguments: false,
        windowsHide: true,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      finish({ summary: '', sessionId, error: `Failed to spawn mimo: ${msg}` });
      return;
    }

    child.stdin!.write('/compact');
    child.stdin!.end();

    const timeoutId = setTimeout(() => {
      logger.warn('MiMoCode compact timed out, killing process');
      child!.kill('SIGTERM');
      finish({ summary: '', sessionId, error: 'Compact timed out after 5 minutes' });
    }, QUERY_TIMEOUT_MS);

    const stderrParts: string[] = [];
    child.stderr!.setEncoding('utf8');
    child.stderr!.on('data', (chunk: string) => {
      stderrParts.push(chunk);
    });

    const rl = createInterface({ input: child.stdout! });
    rl.on('line', (line: string) => {
      if (!line.trim()) return;
      let obj: any;
      try {
        obj = JSON.parse(line);
      } catch {
        return;
      }

      if (obj.sessionID && !resultSessionId) {
        resultSessionId = obj.sessionID;
      }

      switch (obj.type) {
        case 'text': {
          const text: string = obj.part?.text ?? '';
          if (text) textParts.push(text);
          break;
        }
        case 'error': {
          errorMessage = obj.error?.data?.message || obj.error?.message || obj.error?.name || 'Unknown error';
          break;
        }
        default:
          break;
      }
    });

    child.on('close', (code: number | null) => {
      clearTimeout(timeoutId);
      if (code !== 0 && code !== null && !textParts.length && !errorMessage) {
        const stderr = stderrParts.join('').trim();
        errorMessage = stderr || `mimo exited with code ${code}`;
      }
      const summary = textParts.join('\n').trim();
      finish({ summary, sessionId: resultSessionId || sessionId, error: errorMessage });
    });

    child.on('error', (err: Error) => {
      clearTimeout(timeoutId);
      finish({ summary: '', sessionId, error: `Failed to spawn mimo: ${err.message}` });
    });
  });
}

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

export async function mimocodeQuery(options: QueryOptions): Promise<QueryResult> {
  const {
    prompt,
    cwd,
    resume,
    model,
    systemPrompt,
    images,
    onText,
    onBlockEnd,
    abortController,
  } = options;

  logger.info("Starting MiMoCode CLI query", {
    cwd,
    model,
    resume: !!resume,
    hasImages: !!images?.length,
  });

  // Build CLI arguments for: mimo run
  const args: string[] = [
    'run',
    '--format', 'json',
    '--dangerously-skip-permissions',
    '--dir', cwd,
  ];

  if (resume) args.push('--session', resume);
  if (model) args.push('-m', model);
  else args.push('-m', DEFAULT_MODEL);

  // Tag new sessions with [WeChat] prefix so /resume can filter them
  // Don't pass --title — let MiMoCode auto-generate meaningful titles from conversation content

  // Handle images: save to temp files and attach via -f flag
  const tempImagePaths = images?.length ? await saveImageTemp(images) : [];
  for (const imgPath of tempImagePaths) {
    args.push('-f', imgPath);
  }

  // Build full prompt with system prompt prepended
  let fullPrompt = prompt;
  if (systemPrompt) {
    fullPrompt = `${systemPrompt}\n\n${prompt}`;
  }

  // Accumulators
  let sessionId = '';
  const textParts: string[] = [];
  let errorMessage: string | undefined;
  let child: ChildProcess | undefined;
  let settled = false;

  const QUERY_TIMEOUT_MS = 60 * 60 * 1000;

  return new Promise<QueryResult>((resolve) => {
    const finish = (result: QueryResult) => {
      if (settled) return;
      settled = true;
      cleanupTempFiles(tempImagePaths).catch(() => {});
      resolve(result);
    };

    try {
      child = spawn('mimo', args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
        shell: process.platform === 'win32',
        windowsVerbatimArguments: false,
        windowsHide: true,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      finish({ text: '', sessionId: '', error: `Failed to spawn mimo: ${msg}` });
      return;
    }

    // Write prompt to stdin and close
    child.stdin!.write(fullPrompt);
    child.stdin!.end();

    // Timeout
    const timeoutId = setTimeout(() => {
      logger.warn('MiMoCode CLI query timed out, killing process');
      child!.kill('SIGTERM');
      const partialText = textParts.join('\n').trim();
      finish({
        text: partialText,
        sessionId,
        error: partialText ? undefined : 'MiMoCode query timed out after 60 minutes',
      });
    }, QUERY_TIMEOUT_MS);

    // Abort handling
    const onAbort = () => {
      logger.info('MiMoCode CLI query aborted');
      child!.kill('SIGTERM');
      const partialText = textParts.join('\n').trim();
      finish({ text: partialText, sessionId });
    };
    abortController?.signal.addEventListener('abort', onAbort, { once: true });

    // Collect stderr
    const stderrParts: string[] = [];
    child.stderr!.setEncoding('utf8');
    child.stderr!.on('data', (chunk: string) => {
      stderrParts.push(chunk);
    });

    // Parse NDJSON from stdout
    const rl = createInterface({ input: child.stdout! });
    rl.on('line', (line: string) => {
      if (!line.trim()) return;
      let obj: any;
      try {
        obj = JSON.parse(line);
      } catch {
        // Skip unparseable lines
        return;
      }

      // Capture session ID from any event
      if (obj.sessionID && !sessionId) {
        sessionId = obj.sessionID;
      }

      switch (obj.type) {
        case 'text': {
          // MiMoCode emits complete text blocks (not deltas)
          const text: string = obj.part?.text ?? '';
          if (text) {
            textParts.push(text);
            if (onText) {
              Promise.resolve(onText(text)).catch(() => {});
            }
          }
          if (onBlockEnd) {
            Promise.resolve(onBlockEnd()).catch(() => {});
          }
          break;
        }
        case 'tool_use': {
          // Tool call event — notify via onBlockEnd to flush any buffered text
          if (onBlockEnd) {
            Promise.resolve(onBlockEnd()).catch(() => {});
          }
          break;
        }
        case 'error': {
          const errMsg = obj.error?.data?.message
            || obj.error?.message
            || obj.error?.name
            || 'Unknown error';
          errorMessage = String(errMsg);
          logger.error('CLI returned error event', { error: errMsg });
          break;
        }
        case 'step_finish': {
          const reason = obj.part?.reason;
          if (reason === 'error') {
            errorMessage = obj.part?.error || 'Step finished with error';
          }
          break;
        }
        default:
          break;
      }
    });

    // Handle process exit
    child.on('close', (code: number | null) => {
      clearTimeout(timeoutId);
      abortController?.signal.removeEventListener('abort', onAbort);

      if (code !== 0 && code !== null && !textParts.length && !errorMessage) {
        const stderr = stderrParts.join('').trim();
        errorMessage = stderr || `mimo exited with code ${code}`;
        logger.error('MiMoCode CLI exited with error', { code, stderr: stderr.slice(0, 500) });
      }

      const fullText = textParts.join('\n').trim();

      if (!fullText && !errorMessage) {
        errorMessage = 'MiMoCode returned an empty response.';
      }

      logger.info("MiMoCode CLI query completed", {
        sessionId,
        textLength: fullText.length,
        hasError: !!errorMessage,
      });

      if (sessionId) tagSessionAsWeChat(sessionId);

      finish({
        text: fullText,
        sessionId,
        error: errorMessage,
      });
    });

    child.on('error', (err: Error) => {
      clearTimeout(timeoutId);
      abortController?.signal.removeEventListener('abort', onAbort);
      finish({ text: '', sessionId, error: `Failed to spawn mimo: ${err.message}` });
    });
  });
}
