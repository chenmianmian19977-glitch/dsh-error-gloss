// tools/gen-market-index.mjs — 生成 DSH 插件市场「索引源」文件（format 1）
//
//   D:\node.exe D:\dsh-error-gloss\tools\gen-market-index.mjs
//   → index.json（放仓库根，用 raw.githubusercontent.com 的地址作为索引源）
//
// 为什么要自己生成：DSH 的「发现」页只读 format 1 的索引（校验器
// @deepseek-ai/dsh-plugin-market-index）。社区那些聚合目录（如
// w2112515.github.io 的 catalog-v1.json）是各自网站的格式，第一行就被拒：
//   MarketIndexError: $.format must be 1
// 所以想让插件在「发现」页出现，最直接的办法是自己提供一份索引。
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const OWNER = 'chenmianmian19977-glitch';
const REPO = pkg.name;
const RAW = `https://raw.githubusercontent.com/${OWNER}/${REPO}/main`;

const commit = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim();
const publishTimestamp = Number(execSync(`git log -1 --format=%ct ${`v${pkg.version}`}`, { cwd: ROOT })
  .toString().trim());

const index = {
  format: 1,
  // 同时给 zh 与 zh-cn：索引校验器只接受小写语言 id，而不同版本的界面
  // 语言解析器对「主语言子标签」的匹配方式不完全一致，两份都写最稳妥。
  title: { zh: '报错中文注解', 'zh-cn': '报错中文注解', en: 'Error Gloss' },
  description: {
    zh: '给 DeepSeek Harness 的每条报错加一行中文释义：40 条词条覆盖全部官方错误码。',
    'zh-cn': '给 DeepSeek Harness 的每条报错加一行中文释义：40 条词条覆盖全部官方错误码。',
    en: 'Chinese annotations for every DeepSeek Harness error: 40 entries covering all official error codes.',
  },
  metadata: {
    categories: { 'dev-tools': { title: { zh: '开发工具', 'zh-cn': '开发工具', en: 'Developer tools' } } },
    labels: { i18n: { title: { zh: '中文界面', 'zh-cn': '中文界面', en: 'Chinese UI' } } },
    sortKeys: {},
  },
  plugins: [
    {
      name: pkg.name,
      title: { zh: '报错中文注解', 'zh-cn': '报错中文注解', en: 'Error Gloss' },
      description: {
        zh: '报错下方多一行中文注解：释义、影响、可执行建议；原因分「确定 / 可能 / 未验证」三档，原文与 code 完整保留。',
        'zh-cn': '报错下方多一行中文注解：释义、影响、可执行建议；原因分「确定 / 可能 / 未验证」三档，原文与 code 完整保留。',
        en: 'One Chinese line under each error: meaning, impact, actionable advice. Causes are graded certain / likely / unverified; the original text and code are preserved.',
      },
      icon: `${RAW}/client/icon.png`,
      author: '一碗大灌面 (chenmianmian19977-glitch)',
      homepage: `https://github.com/${OWNER}/${REPO}`,
      repository: { url: `https://github.com/${OWNER}/${REPO}` },
      metadata: {
        category: 'dev-tools',
        keywords: ['dsh', 'dsh-plugin', 'deepseek-harness', 'i18n', 'chinese', 'error-message', 'localization'],
        labels: ['i18n'],
        sortKeys: {},
      },
      versions: [
        {
          version: pkg.version,
          publishTimestamp,
          source: { type: 'git', url: `https://github.com/${OWNER}/${REPO}`, commit },
        },
      ],
    },
  ],
};

writeFileSync(join(ROOT, 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8');
console.log(`已生成 index.json：${pkg.name}@${pkg.version} @ ${commit.slice(0, 7)}`);
console.log(`索引源地址（粘进「索引源」对话框）：`);
console.log(`  ${RAW}/index.json`);
