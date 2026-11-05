// tools/install-local.mjs — A 阶段「装进本机 DSH」的唯一入口，可重复执行。
//
//   D:\node.exe D:\dsh-error-gloss\tools\install-local.mjs
//
// 做四件事，全部幂等：
//   1) 重建 client/bundle.js（调 build-client.mjs）
//   2) 把运行所需的 4 个文件铺到 profiles\desktop\node_modules\dsh-error-gloss\
//      （只铺 package.json / host.js / bundle.js / cordis.patch.yml，
//        不把测试与源码铺进去——挂载目录越干净越好排查）
//   3) 确保 profile 的 dsh.profile.bundles 里有 dsh-error-gloss
//   4) 按 DSH 的真实解析路径做一遍「能不能被装载」的预检
//
// 不碰 profile 自己的 cordis.patch.yml：bundle 通道靠包内 dsh.bundle.patch 叠加，
// 这也是 dsh-purge / dsh-context / dsh-bili-scroll 的统一写法。回退 = 从 bundles 删掉包名。
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const CLIENT = join(ROOT, 'client');

const DSH_HOME = process.env.DSH_HOME || join(process.env.USERPROFILE || 'C:\\Users\\MR', '.dsh');
const PROFILE = join(DSH_HOME, 'profiles', 'desktop');
const PKG_DIR = join(PROFILE, 'node_modules', 'dsh-error-gloss');
// 单包结构：包根 = 仓库根，这几条相对路径同时也是 npm 包的运行时文件
const MOUNT_FILES = ['package.json', 'host.js', 'cordis.patch.yml', 'client/bundle.js', 'client/icon.png'];
const NAME = 'dsh-error-gloss';

let bad = 0;
const step = (msg) => console.log(`\n== ${msg}`);
const ok = (msg) => console.log(`   OK   ${msg}`);
const fail = (msg) => { bad++; console.log(`   FAIL ${msg}`); };

if (!existsSync(PROFILE)) {
  console.error(`找不到 desktop profile：${PROFILE}`);
  process.exit(1);
}

// 1) 重建
step('1/4 重建 client bundle');
await import(pathToFileURL(join(HERE, 'build-client.mjs')).href);

// 2) 铺文件（单包结构：仓库根就是包根，按相对路径保持层级）
step('2/4 同步到 profile');
rmSync(PKG_DIR, { recursive: true, force: true });   // 自己拥有的目录，直接清空重建，避免残留
for (const f of MOUNT_FILES) {
  const src = join(ROOT, f);
  if (!existsSync(src)) { fail(`缺少源文件 ${f}`); continue; }
  const dst = join(PKG_DIR, f);
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  ok(`${f} (${readFileSync(src).length} B)`);
}

// 3) bundles 清单（保持 2 空格缩进，key 顺序不变）
step('3/4 确保 dsh.profile.bundles');
const pkgPath = join(PROFILE, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.dsh ??= {};
pkg.dsh.profile ??= {};
pkg.dsh.profile.bundles ??= [];
if (pkg.dsh.profile.bundles.includes(NAME)) {
  ok(`bundles 已含 ${NAME}（${pkg.dsh.profile.bundles.length} 项）`);
} else {
  pkg.dsh.profile.bundles.push(NAME);
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  ok(`已追加 ${NAME}（现 ${pkg.dsh.profile.bundles.length} 项）`);
}

// 4) 预检：完全照 dsh-client-modules 的 locatePkgJson 走一遍
step('4/4 装载预检');
const { createRequire } = await import('node:module');
const req = createRequire(pkgPath);
let entry;
try {
  entry = req.resolve(NAME);            // internal.resolveSync(包名) 的等价物
  ok(`包名可解析 → ${entry}`);
} catch (e) {
  fail(`包名解析失败（客户端 bundle 将不会被装载）：${e.code || e.message}`);
}
try {
  const manifest = JSON.parse(readFileSync(req.resolve(`${NAME}/package.json`), 'utf8'));
  const decl = manifest.dsh?.client;
  decl?.platform === 'web' ? ok(`dsh.client.platform = ${decl.platform}`) : fail('dsh.client.platform 缺失或不是 web');
  const rel = typeof manifest.exports?.['./client'] === 'string'
    ? manifest.exports['./client']
    : manifest.exports?.['./client']?.default;
  rel ? ok(`exports["./client"] = ${rel}`) : fail('exports["./client"] 缺失');
  const clientAbs = join(PKG_DIR, rel || '');
  existsSync(clientAbs) ? ok(`客户端 bundle 存在 ${clientAbs}`) : fail(`客户端 bundle 不存在 ${clientAbs}`);
  existsSync(join(PKG_DIR, manifest.dsh?.bundle?.patch || '')) ? ok('dsh.bundle.patch 存在') : fail('dsh.bundle.patch 缺失');
} catch (e) {
  fail(`manifest 预检失败：${e.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED' ? '需要在 exports 里加 "./package.json"' : e.message}`);
}
if (entry) {
  try {
    const mod = await import(pathToFileURL(entry).href);
    const hasApply = typeof mod.apply === 'function';
    hasApply ? ok(`host 半端可加载，apply = ${typeof mod.apply}，inject = ${JSON.stringify(mod.inject)}`) : fail('host 半端没有导出 apply');
  } catch (e) {
    fail(`host 半端加载失败：${e.message}`);
  }
}

console.log(bad === 0
  ? `\n全部通过。下一步：**完全退出 DeepSeek Harness 再启动**（bundle 层不热重载），然后打开「设置」找 ${NAME} 分区点自检。`
  : `\n有 ${bad} 项未通过，先修好再重启 DSH。`);
process.exitCode = bad ? 1 : 0;
