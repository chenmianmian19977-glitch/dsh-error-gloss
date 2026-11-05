// src/load.mjs — Node 侧词典加载与校验（仅本地开发/自测用；client 侧走构建注入的 JSON）。
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintDictionary } from './match.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '..');

export function loadDictionary(root = ROOT) {
  const entriesDir = join(root, 'catalog', 'entries');
  const entries = readdirSync(entriesDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(entriesDir, f), 'utf8')));
  const fallback = JSON.parse(readFileSync(join(root, 'catalog', 'fallback.json'), 'utf8'));
  const zh = JSON.parse(readFileSync(join(root, 'catalog', 'locales', 'zh-CN.json'), 'utf8'));
  const en = JSON.parse(readFileSync(join(root, 'catalog', 'locales', 'en.json'), 'utf8'));
  const schema = JSON.parse(readFileSync(join(root, 'catalog', 'schema', 'error-gloss.v1.json'), 'utf8'));
  const dict = { schemaVersion: '1.0.0', dshVersionRange: '>=0.2.1-rc.2 <0.3.0', locale: 'zh-CN', version: '0.1.0', entries, fallback, locales: { 'zh-CN': zh, en } };
  const problems = lintDictionary(dict);
  const zhKeys = Object.keys(zh).sort();
  const enKeys = Object.keys(en).sort();
  if (JSON.stringify(zhKeys) !== JSON.stringify(enKeys)) {
    problems.push('zh-CN / en 字典键集不一致');
  }
  return { dict, problems, schema, zh, en, entryCount: entries.length };
}
