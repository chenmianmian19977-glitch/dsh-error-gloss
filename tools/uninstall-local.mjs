// tools/uninstall-local.mjs — 一键回退：从 profile 摘掉本插件，恢复成「没装过」。
//
//   D:\node.exe D:\dsh-error-gloss\tools\uninstall-local.mjs
//
// 做两件事（幂等）：
//   1) 从 profiles\desktop\package.json 的 dsh.profile.bundles 里删掉 dsh-error-gloss
//   2) 删掉 profiles\desktop\node_modules\dsh-error-gloss 目录
// 不碰 profile 的 cordis.patch.yml（bundle 通道从没往里写过东西）。
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const DSH_HOME = process.env.DSH_HOME || join(process.env.USERPROFILE || 'C:\\Users\\MR', '.dsh');
const PROFILE = join(DSH_HOME, 'profiles', 'desktop');
const PKG_DIR = join(PROFILE, 'node_modules', 'dsh-error-gloss');
const NAME = 'dsh-error-gloss';

const pkgPath = join(PROFILE, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const bundles = pkg.dsh?.profile?.bundles ?? [];
const next = bundles.filter((b) => b !== NAME);
if (next.length !== bundles.length) {
  pkg.dsh.profile.bundles = next;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(`已从 bundles 移除 ${NAME}（${bundles.length} → ${next.length} 项）`);
} else {
  console.log(`bundles 里本来就没有 ${NAME}`);
}

if (existsSync(PKG_DIR)) {
  rmSync(PKG_DIR, { recursive: true, force: true });
  console.log(`已删除 ${PKG_DIR}`);
} else {
  console.log('挂载目录本来就不存在');
}

console.log('回退完成：完全退出 DeepSeek Harness 再启动，即恢复到未安装状态。');
