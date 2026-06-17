import { readdirSync, readFileSync, existsSync, type Dirent } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import { logger } from '../logger.js';

const translationCache = new Map<string, string>();

export interface SkillInfo {
  name: string;
  description: string;
  path: string;
}

/**
 * Translate English text to Chinese using MiMoCode CLI.
 */
function translateToChinese(text: string): string {
  if (!text) return text;
  
  const cached = translationCache.get(text);
  if (cached) return cached;
  
  try {
    const prompt = `Translate the following English text to Chinese, return only the translation without any additional text: ${text}`;
    const result = execSync(`mimo run --format json`, {
      input: prompt,
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Parse NDJSON output - each line is a separate JSON object
    const lines = result.split('\n').filter(line => line.trim());
    let translated = text;
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === 'text' && obj.part?.text) {
          translated = obj.part.text.trim();
          break;
        }
      } catch {
        // Skip unparseable lines
      }
    }
    
    translationCache.set(text, translated);
    return translated;
  } catch (error) {
    logger.warn(`Translation failed for: ${text.substring(0, 50)}...`);
    return text;
  }
}

/**
 * Batch translate multiple English texts to Chinese.
 */
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
    const result = execSync(`mimo run --format json`, {
      input: prompt,
      encoding: 'utf-8',
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Parse NDJSON output - each line is a separate JSON object
    let translatedText = '';
    const lines = result.split('\n').filter(line => line.trim());
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === 'text' && obj.part?.text) {
          translatedText = obj.part.text.trim();
          break;
        }
      } catch {
        // Skip unparseable lines
      }
    }
    
    const translatedLines = translatedText.split('\n').filter(line => line.trim());
    
    for (let i = 0; i < uncachedTexts.length; i++) {
      const line = translatedLines[i] || '';
      const translated = line.replace(/^\d+\.\s*/, '').trim() || uncachedTexts[i];
      translationCache.set(uncachedTexts[i], translated);
      results[uncachedIndices[i]] = translated;
    }
  } catch (error) {
    logger.warn('Batch translation failed, using original texts');
    for (let i = 0; i < uncachedTexts.length; i++) {
      results[uncachedIndices[i]] = uncachedTexts[i];
    }
  }
  
  return results;
}

/**
 * Parse YAML-like frontmatter from a SKILL.md file.
 * Only extracts `name` and `description` fields.
 */
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

/**
 * Scan a directory for SKILL.md files, reading skill info from each.
 */
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

/**
 * Scan all known skill directories for installed MiMoCode skills.
 *
 * Locations scanned:
 * 1. ~/.agents/skills/ (each subdirectory) — user-level skills
 * 2. ~/.local/share/mimocode/compose/ /skills/ (plugin skills)
 */
export function scanAllSkills(): SkillInfo[] {
  const home = homedir();
  const skills: SkillInfo[] = [];
  const seen = new Set<string>();

  // 1. ~/.agents/skills/*/
  const userSkillsDir = join(home, '.agents', 'skills');
  for (const skill of scanDirectory(userSkillsDir, 1)) {
    if (!seen.has(skill.name)) {
      seen.add(skill.name);
      skills.push(skill);
    }
  }

  // 2. ~/.local/share/mimocode/compose/*/skills/*/
  const mimocodeDataDir = join(home, '.local', 'share', 'mimocode', 'compose');
  if (existsSync(mimocodeDataDir)) {
    let composeEntries: Dirent[];
    try {
      composeEntries = readdirSync(mimocodeDataDir, { withFileTypes: true });
    } catch {
      composeEntries = [];
    }

    for (const composeEntry of composeEntries) {
      if (!composeEntry.isDirectory()) continue;
      const composeDir = join(mimocodeDataDir, composeEntry.name);
      const pluginSkillsDir = join(composeDir, 'skills');
      for (const skill of scanDirectory(pluginSkillsDir, 1)) {
        if (!seen.has(skill.name)) {
          seen.add(skill.name);
          skills.push(skill);
        }
      }
    }
  }

  logger.info(`Scanned ${skills.length} skills`);
  return skills;
}

/**
 * Format a list of skills into a readable string for display.
 */
export function formatSkillList(skills: SkillInfo[]): string {
  if (skills.length === 0) {
    return 'No skills found.';
  }
  
  const descriptions = skills.map(s => s.description);
  const translatedDescriptions = batchTranslateToChinese(descriptions);
  
  const lines = skills.map((s, i) => {
    const desc = translatedDescriptions[i] ? ` - ${translatedDescriptions[i]}` : '';
    return `  ${i + 1}. ${s.name}${desc}`;
  });
  
  return `Available skills (${skills.length}):\n${lines.join('\n')}`;
}

/**
 * Find a skill by name (case-insensitive match).
 */
export function findSkill(skills: SkillInfo[], name: string): SkillInfo | undefined {
  const lower = name.toLowerCase();
  return skills.find(
    (s) => s.name.toLowerCase() === lower || s.name.toLowerCase().replace(/\s+/g, '-') === lower,
  );
}
