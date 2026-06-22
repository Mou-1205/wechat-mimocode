import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DATA_DIR: string = process.env.WMC_DATA_DIR || join(homedir(), '.wechat-mimocode');
export const CONFIG_DIR: string = DATA_DIR;
export const CONFIG_PATH: string = join(CONFIG_DIR, 'config.json');

const documentsDir = join(homedir(), 'Documents');
export const DEFAULT_WORKING_DIR: string = existsSync(documentsDir)
  ? join(documentsDir, 'MiMoCode')
  : join(homedir(), 'MiMoCode');

export const DEFAULT_MODEL: string = process.env.WMC_MODEL || 'mimo/mimo-auto';

export const CDN_BASE_URL: string = 'https://novac2c.cdn.weixin.qq.com/c2c';
