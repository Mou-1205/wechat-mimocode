import type { CommandContext, CommandResult } from './router.js';
import { scanAllSkills, formatSkillList, findSkill, type SkillInfo } from '../mimocode/skill-scanner.js';
import { scanSessions, searchSessions } from '../mimocode/session-scanner.js';
import { loadConfig, saveConfig } from '../config.js';
import { DEFAULT_WORKING_DIR } from '../constants.js';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HELP_TEXT = `可用命令：

会话管理：
  /help             显示帮助
  /stop             停止当前对话并清空排队消息
  /clear            清除当前会话
  /reset            完全重置（包括工作目录等设置）
  /status           查看当前会话状态
  /compact          压缩上下文（开始新 SDK 会话，保留历史）
  /resume [关键词]  恢复历史对话（无参数列出最近会话）
  /history [数量]   查看对话记录（默认最近20条）
  /undo [数量]      撤销最近对话（默认1条）

文件：
  /send <路径>      发送本地文件（图片直接显示，其他文件作为附件）

配置：
  /cwd [路径]       查看或切换工作目录
  /model [名称]     查看或切换 MiMoCode 模型（格式: provider/model）
  /prompt [内容]    查看或设置系统提示词（全局生效）

任务控制：
  /goal [条件]      设置目标，持续工作直到条件满足
  /goal clear       清除当前目标

其他：
  /skills [full]    列出已安装的 skill（full 显示描述）
  /version          查看版本信息
  /<skill> [参数]   触发已安装的 skill

直接输入文字即可与 MiMoCode 对话`;

// ── Return helpers ──────────────────────────────────────────────

function ok(reply: string): CommandResult {
  return { reply, handled: true };
}

function forward(prompt: string): CommandResult {
  return { handled: true, claudePrompt: prompt };
}

// ── Shared validation ───────────────────────────────────────────

function parseCount(raw: string, defaultVal: number, maxVal: number): number | null {
  if (!raw) return defaultVal;
  const n = parseInt(raw, 10);
  if (isNaN(n) || n <= 0) return null;
  return Math.min(n, maxVal);
}

function resetSession(ctx: CommandContext, full: boolean): void {
  const newSession = ctx.clearSession();
  if (full) newSession.workingDirectory = DEFAULT_WORKING_DIR;
  Object.assign(ctx.session, newSession);
}

// ── Skill cache ─────────────────────────────────────────────────

let cachedSkills: SkillInfo[] | null = null;
let lastScanTime = 0;
const CACHE_TTL = 60_000;

function getSkills(): SkillInfo[] {
  const now = Date.now();
  if (!cachedSkills || now - lastScanTime > CACHE_TTL) {
    cachedSkills = scanAllSkills();
    lastScanTime = now;
  }
  return cachedSkills;
}

export function invalidateSkillCache(): void {
  cachedSkills = null;
}

// ── Session list formatting ─────────────────────────────────────

function formatSessionList(sessions: ReturnType<typeof scanSessions>, header: string): string {
  if (sessions.length === 0) return '未找到历史会话。';
  const lines = sessions.map((s, i) => {
    const date = new Date(s.lastUpdated).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    const title = s.title.length > 40 ? s.title.slice(0, 40) + '...' : s.title;
    return `${i + 1}. [${date}] ${title} (${s.messageCount}条)`;
  });
  return `${header}\n\n${lines.join('\n')}\n\n回复序号恢复对应会话`;
}

// ── Goal aliases ────────────────────────────────────────────────

const GOAL_CLEAR_ALIASES = ['clear', 'stop', 'off', 'reset', 'none', 'cancel'];

// ── Handlers ────────────────────────────────────────────────────

export function handleHelp(_args: string): CommandResult {
  return ok(HELP_TEXT);
}

export function handleClear(ctx: CommandContext): CommandResult {
  resetSession(ctx, false);
  return ok('✅ 会话已清除，下次消息将开始新会话。');
}

export function handleReset(ctx: CommandContext): CommandResult {
  resetSession(ctx, true);
  return ok('✅ 会话已完全重置，所有设置恢复默认。');
}

export function handleCwd(ctx: CommandContext, args: string): CommandResult {
  if (!args) {
    return ok(`当前工作目录: ${ctx.session.workingDirectory}\n用法: /cwd <路径>`);
  }
  ctx.updateSession({ workingDirectory: args });
  return ok(`✅ 工作目录已切换为: ${args}`);
}

export function handleModel(ctx: CommandContext, args: string): CommandResult {
  if (!args) {
    const current = ctx.session.model ?? '默认 (mimo/mimo-auto)';
    return ok(`当前模型: ${current}\n\n用法: /model <模型名称>\n例: /model mimo/mimo-auto\n     /model xiaomi/mimo-v2.5\n     /model Zhipu/glm-5.2`);
  }
  ctx.updateSession({ model: args });
  return ok(`✅ 模型已切换为: ${args}`);
}

export function handleStatus(ctx: CommandContext): CommandResult {
  const s = ctx.session;
  const lines = [
    '📊 会话状态',
    '',
    `工作目录: ${s.workingDirectory}`,
    `模型: ${s.model ?? '默认'}`,
    `会话ID: ${s.sdkSessionId ?? '无'}`,
    `状态: ${s.state}`,
  ];
  return ok(lines.join('\n'));
}

export function handleSkills(args: string): CommandResult {
  invalidateSkillCache();
  const skills = getSkills();
  if (skills.length === 0) {
    return ok('未找到已安装的 skill。');
  }

  if (args.trim().toLowerCase() === 'full') {
    return ok(formatSkillList(skills));
  }
  const lines = skills.map(s => `/${s.name}`);
  return ok(`📋 已安装的 Skill (${skills.length}):\n\n${lines.join('\n')}\n\n使用 /skills full 查看完整描述`);
}

const MAX_HISTORY_LIMIT = 100;

export function handleHistory(ctx: CommandContext, args: string): CommandResult {
  const limit = parseCount(args, 20, MAX_HISTORY_LIMIT);
  if (limit === null) {
    return ok('用法: /history [数量]\n例: /history 50（显示最近50条对话）');
  }

  const historyText = ctx.getChatHistoryText?.(limit) || '暂无对话记录';
  return ok(`📝 对话记录（最近${limit}条）:\n\n${historyText}`);
}

export function handleNew(ctx: CommandContext): CommandResult {
  ctx.updateSession({
    previousSdkSessionId: ctx.session.sdkSessionId,
    sdkSessionId: undefined,
  });
  const config = loadConfig();
  const model = ctx.session.model || config.model || '默认模型';
  const cwd = ctx.session.workingDirectory || config.workingDirectory || DEFAULT_WORKING_DIR;
  const hasPrompt = config.systemPrompt ? '已设置' : '未设置';
  return ok(`✨ 会话已重置！全新启动。
◆ 模型：\`${model}\`
◆ 工作目录：${cwd}
◆ 系统提示词：${hasPrompt}
✦ 小贴士：/help 可以获取命令指南`);
}

export function handleCompact(ctx: CommandContext): CommandResult {
  if (!ctx.session.sdkSessionId) {
    return ok('ℹ️ 当前没有活动的 SDK 会话，无需压缩。');
  }
  return { handled: true, compactSession: true };
}

export function handleUndo(ctx: CommandContext, args: string): CommandResult {
  const count = parseCount(args, 1, Infinity);
  if (count === null) {
    return ok('用法: /undo [数量]\n例: /undo 2（撤销最近2条对话）');
  }
  const history = ctx.session.chatHistory || [];
  if (history.length === 0) {
    return ok('⚠️ 没有对话记录可撤销');
  }
  const actualCount = Math.min(count, history.length);
  ctx.session.chatHistory = history.slice(0, -actualCount);
  ctx.updateSession({ chatHistory: ctx.session.chatHistory });
  return ok(`✅ 已撤销最近 ${actualCount} 条对话`);
}

export function handleVersion(): CommandResult {
  try {
    const __dirname = fileURLToPath(new URL('.', import.meta.url));
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'));
    return ok(`wechat-mimocode v${pkg.version || 'unknown'}`);
  } catch {
    return ok('wechat-mimocode (version unknown)');
  }
}

export function handlePrompt(_ctx: CommandContext, args: string): CommandResult {
  const config = loadConfig();
  if (!args) {
    const current = config.systemPrompt;
    if (current) {
      return ok(`📝 当前系统提示词:\n${current}\n\n用法:\n/prompt <提示词>  — 设置\n/prompt clear   — 清除`);
    }
    return ok('📝 暂无系统提示词\n\n用法: /prompt <提示词>\n例: /prompt 用中文回答我');
  }
  if (args.trim().toLowerCase() === 'clear') {
    config.systemPrompt = undefined;
    saveConfig(config);
    return ok('✅ 系统提示词已清除');
  }
  config.systemPrompt = args.trim();
  saveConfig(config);
  return ok(`✅ 系统提示词已设置:\n${config.systemPrompt}`);
}

export function handleSend(ctx: CommandContext, args: string): CommandResult {
  if (!args) {
    return ok('用法: /send <文件路径>\n例: /send ~/Documents/report.pdf\n     /send ./chart.png');
  }

  const resolved = args.startsWith('/')
    ? args
    : resolve(ctx.session.workingDirectory, args.replace(/^~/, homedir()));
  if (!existsSync(resolved)) {
    return ok(`文件不存在: ${resolved}`);
  }

  const stat = statSync(resolved);
  if (stat.isDirectory()) {
    return ok(`这是一个目录，请指定文件: ${resolved}`);
  }

  if (stat.size > 25 * 1024 * 1024) {
    return ok(`文件过大 (${(stat.size / 1024 / 1024).toFixed(1)}MB)，最大支持 25MB`);
  }

  return { handled: true, sendFile: resolved };
}

export function handleGoal(_ctx: CommandContext, args: string): CommandResult {
  if (!args) {
    return forward('/goal');
  }

  const input = args.trim().toLowerCase();
  if (GOAL_CLEAR_ALIASES.includes(input)) {
    return forward('/goal clear');
  }

  return forward(`/goal ${args.trim()}`);
}

export function handleResume(_ctx: CommandContext, args: string): CommandResult {
  if (!args) {
    const sessions = scanSessions(15);
    return ok(formatSessionList(sessions, '📜 最近会话:'));
  }

  const num = parseInt(args, 10);
  if (!isNaN(num) && num > 0) {
    const sessions = scanSessions(15);
    if (num > sessions.length) {
      return ok(`序号超出范围，请输入 1-${sessions.length}`);
    }
    const target = sessions[num - 1];
    return { reply: `✅ 正在恢复会话: ${target.title}`, handled: true, resumeSession: target.sessionId };
  }

  const results = searchSessions(args);
  if (results.length === 0) {
    return ok(`未找到包含「${args}」的会话`);
  }
  if (results.length === 1) {
    return { reply: `✅ 正在恢复会话: ${results[0].title}`, handled: true, resumeSession: results[0].sessionId };
  }
  return ok(formatSessionList(results, `🔍 搜索「${args}」的结果:`));
}

export function handleUnknown(cmd: string, args: string): CommandResult {
  const skill = findSkill(getSkills(), cmd);

  if (skill) {
    const prompt = args ? `Use the ${skill.name} skill: ${args}` : `Use the ${skill.name} skill`;
    return forward(prompt);
  }

  return ok(`未找到 skill: ${cmd}\n输入 /skills 查看可用列表`);
}
