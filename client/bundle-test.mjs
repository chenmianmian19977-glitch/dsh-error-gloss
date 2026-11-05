// client/bundle-test.mjs — 模拟 the agent harness 的 __ModuleLoader__ 环境，
// 验证 client/bundle.js 能被加载、factory 能返回 apply/inject、apply 能注册三个扩展点。
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)));
const code = readFileSync(join(ROOT, 'bundle.js'), 'utf8');
let ok = 0, bad = 0;
const check = (n, c, d = '') => { if (c) { ok++; console.log(`  PASS  ${n}`); } else { bad++; console.log(`  FAIL  ${n}${d ? ' :: ' + d : ''}`); } };

let spec = null;
const sandbox = { window: { __ModuleLoader__: { load: (s) => { spec = s; } } } };
vm.createContext(sandbox);
try { vm.runInContext(code, sandbox, { filename: 'bundle.js' }); } catch (e) { console.error('bundle 执行异常：', e.message); process.exit(1); }

console.log('=== __ModuleLoader__ 契约 ===');
check('调用了 load()', spec !== null);
check('id 为 dsh-error-gloss', spec?.id === 'dsh-error-gloss', spec?.id);
check('提供 factory 函数', typeof spec?.factory === 'function');

const reactMock = {
  useState: (init) => [init, () => {}],
  createElement: (tag, props, ...kids) => (typeof tag === 'function'
    ? tag({ ...(props ?? {}), children: kids.length > 1 ? kids : kids[0] })
    : { tag, props, kids }),
};
let mod;
try { mod = spec.factory((name) => (name === 'react' ? reactMock : null)); }
catch (e) { console.error('factory 执行异常：', e.message); process.exit(1); }

check('factory 返回 module.exports', mod && typeof mod === 'object');
check('导出 apply', typeof mod.apply === 'function');
check('导出 inject', Array.isArray(mod.inject) && mod.inject.includes('slots') && mod.inject.includes('locale'), JSON.stringify(mod.inject));
check('导出 NS / zh / en', mod.NS === 'dsh-error-gloss' && !!mod.zh && !!mod.en);

console.log('=== apply(ctx) 注册路径（bundle 内） ===');
const reg = { locales: [], slots: [], effects: [], views: new Map() };
const ctx = {
  effect: (fn, name) => { reg.effects.push(name); fn(); return () => {}; },
  locale: {
    register: (ns, d) => reg.locales.push({ ns, hasEn: !!d.en, keys: Object.keys(d.zh ?? {}).length }),
    bind: (ns) => (key, vars = {}) => String(mod.zh[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`),
  },
  slots: {
    register: (s, view) => { reg.views.set(s.name, view); return { spec: s, hasView: typeof view === 'function' }; },
    inject: (name, fn) => { const r = fn(); reg.slots.push({ name, made: !!r }); return r; },
  },
  storage: { get: () => [], set: () => {} },
};
const result = mod.apply(ctx);
check('apply 返回词条数', result.entryCount >= 15, JSON.stringify(result));
check('apply 声明两个挂载点', result.settingsSection === true && result.turnTail === true);
check('注册 locale 字典', reg.locales.some((r) => r.ns === mod.NS && r.hasEn && r.keys > 20), JSON.stringify(reg.locales));
check('注册 conversation.chat.turnTail', reg.slots.some((s) => s.name === 'conversation.chat.turnTail'));
check('注册 settings.section', reg.slots.some((s) => s.name === 'settings.section'));
check('注册 effect', reg.effects.some((e) => e.includes('dictionaries')));
check('导出 scanTurn（可单测）', typeof mod.scanTurn === 'function');
const assetVals = Object.values(mod.ASSETS ?? {});
check('头像资产要么全空（开源构建）要么全是 data URI，绝不外链',
  assetVals.every((v) => String(v).startsWith('data:image/')), assetVals.length + ' 张');
check('apply 无注册失败', (result.failures ?? []).length === 0, JSON.stringify(result.failures));

console.log('=== 设置页真渲染（react 来自 factory require） ===');
const tFn = (k) => mod.zh[k] ?? k;
const settingsView = reg.views.get('settings.section');
const tree = typeof settingsView === 'function' ? settingsView({ t: tFn }) : null;
const flat = tree ? JSON.stringify(tree) : '';
check('设置页渲染出版本号', flat.includes('v0.1.0'), flat.slice(0, 200));
check('设置页渲染出词条数', flat.includes(String(result.entryCount)));
check('设置页渲染出自检按钮', flat.includes(mod.zh['settings.selftest']));

console.log('=== 注解行：没有 useChat 时 fail-open ===');
const tailView = reg.views.get('conversation.chat.turnTail');
let tailOut = 'throws';
try { tailOut = typeof tailView === 'function' ? tailView({ turn: 1 }) : 'no-view'; } catch (e) { tailOut = 'threw: ' + e.message; }
check('无 useChat 时返回 null 而不是抛错', tailOut === null, String(tailOut));

const snap = {
  locations: { getTurn: () => ['n1'] },
  nodes: new Map([['n1', { kind: 'turn-error', data: { code: 'CONTEXT_WINDOW_EXCEEDED', message: 'pi-ai detected context overflow for model "trae-cn/deepseek-v4.1-flash"' } }]]),
};
const withChat = typeof tailView === 'function' ? tailView({ turn: 1, useChat: (sel) => sel(snap) }) : null;
const withChatFlat = withChat ? JSON.stringify(withChat) : '';
check('有 useChat 时渲染出中文注解', withChatFlat.includes('上下文窗口超限'), withChatFlat.slice(0, 300));

console.log('=== 降级：基座无 react 时 fail-open ===');
let mod2;
try { mod2 = spec.factory(() => { throw new Error('no react'); }); } catch (e) { console.error('  factory 在无 react 时抛错：' + e.message); bad++; }
if (mod2) {
  check('无 react 仍导出 apply', typeof mod2.apply === 'function');
  const ctx2 = { ...ctx, React: null };
  try { mod2.apply(ctx2); check('无 react 时 apply 不抛错', true); } catch (e) { check('无 react 时 apply 不抛错', false, e.message); }
}

console.log(`\nbundle-test: ${ok} passed, ${bad} failed`);
if (bad) process.exitCode = 1;
