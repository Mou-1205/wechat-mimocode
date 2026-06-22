import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, openSync, closeSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_DIR } from './constants.js';
import { logger } from './logger.js';

type DaemonCommand = 'start' | 'stop' | 'restart' | 'status' | 'logs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = join(__dirname, '..');
const LOG_DIR = join(DATA_DIR, 'logs');
const PID_FILE = join(DATA_DIR, 'mimocode-bridge.pid');
const PLATFORM = process.platform as NodeJS.Platform;
const IS_WIN = PLATFORM === 'win32';

const pidFile = {
  read(): number | null {
    try {
      const content = readFileSync(PID_FILE, 'utf-8').trim();
      const pid = parseInt(content, 10);
      return isNaN(pid) ? null : pid;
    } catch {
      return null;
    }
  },
  write(pid: number): void {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(PID_FILE, String(pid), 'utf-8');
  },
  remove(): void {
    try { unlinkSync(PID_FILE); } catch { /* ignore */ }
  },
};

function isProcessRunning(pid: number): boolean {
  try {
    if (IS_WIN) {
      const output = execSync(`tasklist /FI "PID eq ${pid}" /NH`, { encoding: 'utf-8' });
      return output.includes(String(pid));
    }
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killProcess(pid: number): boolean {
  if (IS_WIN) {
    execSync(`taskkill /PID ${pid} /F`);
    return true;
  }

  process.kill(pid, 'SIGTERM');
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (!isProcessRunning(pid)) return true;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  process.kill(pid, 'SIGKILL');
  return true;
}

function syncWait(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function getCurrentVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(PROJECT_DIR, 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function getLatestVersion(): string | null {
  try {
    const output = execSync('npm view wechat-mimocode version', {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return output.trim();
  } catch {
    return null;
  }
}

function checkVersion(): void {
  const current = getCurrentVersion();
  const latest = getLatestVersion();

  if (!latest || current === latest) return;

  console.log(`\n⚠️  版本更新提示:`);
  console.log(`   当前版本: ${current}`);
  console.log(`   最新版本: ${latest}`);
  console.log(`   请运行: npm install -g wechat-mimocode@latest\n`);
}

function daemonStart(): void {
  mkdirSync(LOG_DIR, { recursive: true });
  checkVersion();

  const existingPid = pidFile.read();
  if (existingPid && isProcessRunning(existingPid)) {
    console.log(`已在运行 (PID: ${existingPid})`);
    return;
  }
  pidFile.remove();

  const mainJs = join(PROJECT_DIR, 'dist', 'main.js');
  const stdoutPath = join(LOG_DIR, 'stdout.log');
  const stderrPath = join(LOG_DIR, 'stderr.log');

  console.log('正在启动 wechat-mimocode 守护进程...');

  const stdoutFd = openSync(stdoutPath, 'a');
  const stderrFd = openSync(stderrPath, 'a');

  const child = spawn(process.execPath, [mainJs, 'start'], {
    cwd: PROJECT_DIR,
    detached: true,
    stdio: ['ignore', stdoutFd, stderrFd],
    shell: false,
    env: { ...process.env },
    windowsHide: true,
  });

  closeSync(stdoutFd);
  closeSync(stderrFd);

  child.on('error', (err) => {
    console.error(`启动失败: ${err.message}`);
  });

  child.on('exit', (code) => {
    if (code !== 0) {
      console.error(`守护进程异常退出 (code: ${code})，查看日志: ${stderrPath}`);
    }
  });

  child.unref();
  pidFile.write(child.pid!);

  console.log(`已启动 (PID: ${child.pid})`);
  console.log(`日志: ${stdoutPath}`);
}

function daemonStop(): void {
  const pid = pidFile.read();
  if (!pid) {
    console.log('未运行（无 PID 文件）');
    return;
  }

  if (!isProcessRunning(pid)) {
    console.log('进程未运行（清理 PID 文件）');
    pidFile.remove();
    return;
  }

  try {
    killProcess(pid);
    console.log(`已停止 (PID: ${pid})`);
  } catch (err) {
    console.error('停止失败:', err instanceof Error ? err.message : String(err));
  }
  pidFile.remove();
}

function daemonStatus(): void {
  const pid = pidFile.read();
  if (!pid) {
    console.log('未运行');
    return;
  }
  if (isProcessRunning(pid)) {
    console.log(`运行中 (PID: ${pid})`);
  } else {
    console.log('未运行（PID 文件过期）');
    pidFile.remove();
  }
}

function daemonRestart(): void {
  daemonStop();
  syncWait(1000);
  daemonStart();
}

function daemonLogs(): void {
  if (!existsSync(LOG_DIR)) {
    console.log('未找到日志');
    console.log(`日志目录: ${LOG_DIR}`);
    return;
  }

  console.log(`日志目录: ${LOG_DIR}\n`);

  let hasAny = false;
  for (const f of ['stdout.log', 'stderr.log'] as const) {
    const filePath = join(LOG_DIR, f);
    if (!existsSync(filePath)) continue;
    try {
      const content = readFileSync(filePath, 'utf-8').trim();
      if (!content) continue;
      hasAny = true;
      const lines = content.split('\n');
      const tail = lines.slice(-50);
      console.log(`=== ${f} (最后50行) ===`);
      console.log(tail.join('\n'));
      console.log('');
    } catch {
      console.log(`${f}: (无法读取)\n`);
    }
  }

  if (!hasAny) {
    console.log('暂无日志');
  }
}

export function handleDaemon(command: string): void {
  const handlers: Record<DaemonCommand, () => void> = {
    start: daemonStart,
    stop: daemonStop,
    restart: daemonRestart,
    status: daemonStatus,
    logs: daemonLogs,
  };

  if (command in handlers) {
    handlers[command as DaemonCommand]();
  } else {
    console.log('用法: npm run daemon -- {start|stop|restart|status|logs}');
    console.log(`平台: ${PLATFORM}`);
    process.exit(1);
  }
}
