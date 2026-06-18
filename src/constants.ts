import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DATA_DIR = process.env.WMC_DATA_DIR || join(homedir(), '.wechat-mimocode');

const documentsDir = join(homedir(), 'Documents');
export const DEFAULT_WORKING_DIR = existsSync(documentsDir) ? join(documentsDir, 'MiMoCode') : join(homedir(), 'MiMoCode');

export const DEFAULT_MODEL = process.env.WMC_MODEL || 'xiaomi/mimo-v2.5';

export const CDN_BASE_URL = 'https://novac2c.cdn.weixin.qq.com/c2c';

export const WECHAT_SESSION_PREFIX = '[WeChat] ';
