import { readdirSync, readFileSync, existsSync, type Dirent } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import { logger } from '../logger.js';

const CACHE_MAX_SIZE = 500;
const translationCache = new Map<string, string>();

export interface SkillInfo {
  name: string;
  description: string;
  path: string;
}

function cacheSet(key: string, value: string): void {
  if (translationCache.size >= CACHE_MAX_SIZE) {
    const firstKey = translationCache.keys().next().value;
    if (firstKey !== undefined) translationCache.delete(firstKey);
  }
  translationCache.set(key, value);
}

function parseNdjsonText(output: string): string {
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (obj.type === 'text' && obj.part?.text) {
        return obj.part.text.trim();
      }
    } catch {
      // skip unparseable lines
    }
  }
  return '';
}

function runMimoTranslation(prompt: string, timeout: number): string {
  const result = execSync('mimo run --format json', {
    input: prompt,
    encoding: 'utf-8',
    timeout,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return parseNdjsonText(result);
}

function translateToChinese(text: string): string {
  if (!text) return text;

  const cached = translationCache.get(text);
  if (cached) return cached;

  try {
    const prompt = `Translate the following English text to Chinese, return only the translation without any additional text: ${text}`;
    const translated = runMimoTranslation(prompt, 30000) || text;
    cacheSet(text, translated);
    return translated;
  } catch {
    logger.warn(`Translation failed for: ${text.substring(0, 50)}...`);
    return text;
  }
}

function batchTranslateToChinese(texts: string[]): string[] {
  if (texts.length === 0) return texts;

  const uncachedTexts: string[] = [];
  const uncachedIndices: number[] = [];
  const results: string[] = new Array(texts.length);

  for (let i = 0; i < texts.length; i++) {
    const cached = translationCache.get(texts[i]);
    if (cached) {
      results[i] = cached;
    } else {
      uncachedTexts.push(texts[i]);
      uncachedIndices.push(i);
    }
  }

  if (uncachedTexts.length === 0) return results;

  try {
    const combinedText = uncachedTexts.map((t, i) => `${i + 1}. ${t}`).join('\n');
    const prompt = `Translate the following numbered English texts to Chinese. Return only the translations, one per line, with the same numbering:\n${combinedText}`;
    const translatedText = runMimoTranslation(prompt, 60000);
    const translatedLines = translatedText.split('\n').filter(line => line.trim());

    for (let i = 0; i < uncachedTexts.length; i++) {
      const line = translatedLines[i] || '';
      const translated = line.replace(/^\d+\.\s*/, '').trim() || uncachedTexts[i];
      cacheSet(uncachedTexts[i], translated);
      results[uncachedIndices[i]] = translated;
    }
  } catch {
    logger.warn('Batch translation failed, using original texts');
    for (let i = 0; i < uncachedTexts.length; i++) {
      results[uncachedIndices[i]] = uncachedTexts[i];
    }
  }

  return results;
}

function parseSkillMd(filePath: string): { name: string; description: string } | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;

    const frontmatter = match[1];
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);

    if (!nameMatch) return null;

    return {
      name: nameMatch[1].trim().replace(/^["']|["']$/g, ''),
      description: descMatch ? descMatch[1].trim().replace(/^["']|["']$/g, '') : '',
    };
  } catch {
    logger.warn(`Failed to read SKILL.md: ${filePath}`);
    return null;
  }
}

function scanDirectory(baseDir: string, depth: number = 2): SkillInfo[] {
  const skills: SkillInfo[] = [];
  if (!existsSync(baseDir)) return skills;

  let entries: Dirent[];
  try {
    entries = readdirSync(baseDir, { withFileTypes: true });
  } catch {
    return skills;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = join(baseDir, entry.name);

    if (depth > 1) {
      skills.push(...scanDirectory(fullPath, depth - 1));
    }

    const skillFile = join(fullPath, 'SKILL.md');
    if (existsSync(skillFile)) {
      const info = parseSkillMd(skillFile);
      if (info) {
        skills.push({ ...info, path: fullPath });
      }
    }
  }

  return skills;
}

function collectSkills(dirs: string[], depth: number): SkillInfo[] {
  const skills: SkillInfo[] = [];
  const seen = new Set<string>();

  for (const dir of dirs) {
    for (const skill of scanDirectory(dir, depth)) {
      if (!seen.has(skill.name)) {
        seen.add(skill.name);
        skills.push(skill);
      }
    }
  }

  return skills;
}

export function scanAllSkills(): SkillInfo[] {
  const home = homedir();
  const userSkillsDir = join(home, '.agents', 'skills');
  const mimocodeDataDir = join(
    process.env.XDG_DATA_HOME || join(home, '.local', 'share'),
    'mimocode', 'compose',
  );

  const pluginSkillDirs: string[] = [];
  if (existsSync(mimocodeDataDir)) {
    try {
      for (const entry of readdirSync(mimocodeDataDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          pluginSkillDirs.push(join(mimocodeDataDir, entry.name, 'skills'));
        }
      }
    } catch {
      // ignore read errors
    }
  }

  const skills = collectSkills([userSkillsDir, ...pluginSkillDirs], 1);
  logger.info(`Scanned ${skills.length} skills`);
  return skills;
}

export function formatSkillList(skills: SkillInfo[]): string {
  if (skills.length === 0) return 'No skills found.';

  const translatedDescriptions = batchTranslateToChinese(skills.map(s => s.description));
  const lines = skills.map((s, i) => {
    const desc = translatedDescriptions[i] ? ` - ${translatedDescriptions[i]}` : '';
    return `  ${i + 1}. ${s.name}${desc}`;
  });

  return `Available skills (${skills.length}):\n${lines.join('\n')}`;
}

export function findSkill(skills: SkillInfo[], name: string): SkillInfo | undefined {
  const lower = name.toLowerCase();
  return skills.find(
    (s) => s.name.toLowerCase() === lower || s.name.toLowerCase().replace(/\s+/g, '-') === lower,
  );
}
