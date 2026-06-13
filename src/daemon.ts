import { spawn, spawnSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { DATA_DIR } from './constants.js';
import { logger } from './logger.js';

const PROJECT_DIR = process.cwd();
const LOG_DIR = join(DATA_DIR, 'logs');
const PID_FILE = join(DATA_DIR, 'mimocode-bridge.pid');
const PLATFORM = process.platform;

function ensureLogDir(): void {
  mkdirSync(LOG_DIR, { recursive: true });
}

function readPid(): number | null {
  try {
    const content = readFileSync(PID_FILE, 'utf-8').trim();
    const pid = parseInt(content, 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

function writePid(pid: number): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(PID_FILE, String(pid), 'utf-8');
}

function removePid(): void {
  try { unlinkSync(PID_FILE); } catch { /* ignore */ }
}

function isProcessRunning(pid: number): boolean {
  try {
    if (PLATFORM === 'win32') {
      const output = execSync(`tasklist /FI "PID eq ${pid}" /NH`, { encoding: 'utf-8' });
      return output.includes(String(pid));
    } else {
      process.kill(pid, 0);
      return true;
    }
  } catch {
    return false;
  }
}

function getNodeBin(): string {
  return process.execPath;
}

function getMainJs(): string {
  return join(PROJECT_DIR, 'dist', 'main.js');
}

function daemonStart(): void {
  ensureLogDir();

  const existingPid = readPid();
  if (existingPid && isProcessRunning(existingPid)) {
    console.log(`已在运行 (PID: ${existingPid})`);
    return;
  }
  removePid();

  const nodeBin = getNodeBin();
  const mainJs = getMainJs();
  const stdoutPath = join(LOG_DIR, 'stdout.log');
  const stderrPath = join(LOG_DIR, 'stderr.log');

  console.log('正在启动 wechat-mimocode 守护进程...');

  const child = spawn(nodeBin, [mainJs, 'start'], {
    cwd: PROJECT_DIR,
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
    shell: false,
    env: { ...process.env },
  });

  child.unref();
  writePid(child.pid!);

  console.log(`已启动 (PID: ${child.pid})`);
  console.log(`日志: ${stdoutPath}`);
}

function daemonStop(): void {
  const pid = readPid();
  if (!pid) {
    console.log('未运行（无 PID 文件）');
    return;
  }

  if (!isProcessRunning(pid)) {
    console.log('进程未运行（清理 PID 文件）');
    removePid();
    return;
  }

  try {
    if (PLATFORM === 'win32') {
      execSync(`taskkill /PID ${pid} /F`);
    } else {
      process.kill(pid, 'SIGTERM');
      let count = 0;
      while (isProcessRunning(pid) && count < 10) {
        setTimeout(() => {}, 1000);
        count++;
      }
      if (isProcessRunning(pid)) {
        process.kill(pid, 'SIGKILL');
      }
    }
    console.log(`已停止 (PID: ${pid})`);
  } catch (err) {
    console.error('停止失败:', err instanceof Error ? err.message : String(err));
  }
  removePid();
}

function daemonStatus(): void {
  const pid = readPid();
  if (!pid) {
    console.log('未运行');
    return;
  }
  if (isProcessRunning(pid)) {
    console.log(`运行中 (PID: ${pid})`);
  } else {
    console.log('未运行（PID 文件过期）');
    removePid();
  }
}

function daemonRestart(): void {
  daemonStop();
  setTimeout(() => daemonStart(), 1000);
}

function daemonLogs(): void {
  const logDir = LOG_DIR;
  if (!existsSync(logDir)) {
    console.log('未找到日志');
    return;
  }

  for (const f of ['stdout.log', 'stderr.log']) {
    const filePath = join(logDir, f);
    if (existsSync(filePath)) {
      console.log(`=== ${f} (最后50行) ===`);
      try {
        const content = readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const tail = lines.slice(-50);
        console.log(tail.join('\n'));
      } catch {
        console.log('(无法读取)');
      }
      console.log('');
    }
  }
}

export function handleDaemon(command: string): void {
  switch (command) {
    case 'start':
      daemonStart();
      break;
    case 'stop':
      daemonStop();
      break;
    case 'restart':
      daemonRestart();
      break;
    case 'status':
      daemonStatus();
      break;
    case 'logs':
      daemonLogs();
      break;
    default:
      console.log('用法: npm run daemon -- {start|stop|restart|status|logs}');
      console.log(`平台: ${PLATFORM}`);
      process.exit(1);
  }
}
