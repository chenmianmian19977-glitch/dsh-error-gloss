// client/smoke.mjs — 用 mock ctx 冒烟验证 apply() 的注册路径，不起 DSH、不改 profile。
import { GLOSS_DATA } from './gloss-data.js';
import { resolveError, renderShort, renderDetail, makeT } from './gloss-engine.js';

let ok = 0, bad = 0;
const check = (n, c, d = '') => { if (c) { ok++; console.log(`  PASS  ${n}`); } else { bad++; console.log(`  FAIL  ${n}${d ? ' :: ' + d : ''}`); } };

console.log('=== client 自包含产物冒烟 ===');
check('生成的词典含 15 条核心词条 + 码族', GLOSS_DATA.entries.length >= 15 &&
  GLOSS_DATA.entries.some((e) => e.id === 'family.team'), GLOSS_DATA.entries.length);
check('生成的词典含 fallback', GLOSS_DATA.fallback.id === 'UNKNOWN');
check('生成的词典含 zh/en 双 locale', !!GLOSS_DATA.locales['zh-CN'] && !!GLOSS_DATA.locales.en);
const t = makeT(GLOSS_DATA.locales);
const a = resolveError({ code: 'CONTEXT_WINDOW_EXCEEDED', message: 'pi-ai detected context overflow for model "trae-cn/deepseek-v4.1-flash"' }, {}, GLOSS_DATA);
check('生成引擎可解析截图报错', a.id === 'context.window.exceeded', a.id);
check('生成引擎可渲染短注解', renderShort(a, t).includes('上下文窗口超限'));
check('生成引擎可渲染详情', renderDetail(a, t).includes('原文：'));

console.log('=== apply(ctx) 注册路径 ===');
const registered = { locales: [], slots: [], effects: [] };
const mockCtx = {
  effect: (fn, name) => { registered.effects.push(name); fn(); return () => {}; },
  locale: {
    register: (ns, dicts) => { registered.locales.push({ ns, keys: Object.keys(dicts.zh ?? {}).length, hasEn: !!dicts.en }); },
    bind: (ns) => (key, vars = {}) => String(GLOSS_DATA.locales['zh-CN'][key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`),
  },
  slots: {
    register: (spec, view) => ({ spec, hasView: typeof view === 'function' }),
    inject: (name, fn, label) => { registered.slots.push({ name, label, made: !!fn() }); },
  },
  React: null,
};
const { apply, NS, zh, en, scanTurn, turnIdFrom, scanTurnFor } = await import('./client.js');
const result = apply(mockCtx);
check('apply 返回版本与词条数', result.ns === NS && result.entryCount === GLOSS_DATA.entries.length, JSON.stringify(result));
check('apply 声明两个挂载点', result.settingsSection === true && result.turnTail === true, JSON.stringify(result));
check('注册了 locale 字典', registered.locales.some((r) => r.ns === NS && r.hasEn && r.keys > 10), JSON.stringify(registered.locales));
check('注册了 turnTail slot', registered.slots.some((s) => s.name === 'conversation.chat.turnTail' && s.made), JSON.stringify(registered.slots));
check('不再注册 conversation.chat.node（keyed 座位 key 域固定，自造 key 永不渲染）',
  !registered.slots.some((s) => s.name === 'conversation.chat.node'), JSON.stringify(registered.slots));
check('注册了 settings.section slot', registered.slots.some((s) => s.name === 'settings.section'), JSON.stringify(registered.slots));
check('注册了 effect', registered.effects.some((e) => e.includes('dictionaries')));
check('zh/en 导出键集一致', JSON.stringify(Object.keys(zh).sort()) === JSON.stringify(Object.keys(en).sort()));
check('设置页文案键齐全', ['settings.version','settings.entries','settings.status','settings.selftest','settings.selftestHint','settings.selftestLabel','settings.statusActive','settings.noReact','settings.failures'].every((k) => k in zh && k in en));
check('apply 返回注册失败台账（正常为空）', Array.isArray(result.failures) && result.failures.length === 0, JSON.stringify(result.failures));

// 关键回归：注册抛错绝不能冒泡到宿主 boot（2026-11-05 真机就是这么崩的）
console.log('=== 注册失败必须降级、不许冒泡 ===');
let survived = true;
const boom = () => { throw new Error('slot "x" 未声明'); };
const angryCtx = {
  ...mockCtx,
  effect: (fn, name) => { try { fn(); } catch { /* cordis 会把 effect 异常升级为 fiber 失败 */ } },
  slots: {
    register: boom,
    inject: (name, fn) => { fn(); },
  },
  locale: { register: boom, bind: () => (k) => k },
};
let angryResult;
try { angryResult = apply(angryCtx); } catch { survived = false; }
check('apply 自身不抛错（fiber 不会 FAILED）', survived);
check('三步失败都被记账', angryResult?.failures?.length === 3, JSON.stringify(angryResult?.failures));
check('记账里带原始错误信息', String(angryResult?.failures?.[0]?.message ?? '').includes('未声明'), JSON.stringify(angryResult?.failures?.[0]));

// 最坏情况：整个 ctx 都是坏的（无 slots 服务），apply 也必须返回而不是抛
let fatalSurvived = true;
let fatalResult;
try { fatalResult = apply({}); } catch { fatalSurvived = false; }
check('空 ctx 也不抛（web boot 不会因本插件失败）', fatalSurvived);
check('空 ctx 记入 apply 级失败', fatalResult?.failures?.some((f) => f.step === 'apply'), JSON.stringify(fatalResult?.failures));

// scanTurn：纯函数，模拟 DSH 的 chat snapshot 结构
// 回归：turnTail 的 ownerProps.turn 是 TurnLocation 对象，不是数字。
// 2026-11-05 真机就死在这——把对象喂给 locations.getTurn 永远拿到空数组。
console.log('=== turn 取号（TurnLocation → 数字） ===');
check('数字直接透传', turnIdFrom(null, 3) === 3);
check('对象里的 turn 字段', turnIdFrom(null, { kind: 'turn', turn: 7 }) === 7);
check('对象里的 id 字段', turnIdFrom(null, { id: 4 }) === 4);
check('嵌套一层', turnIdFrom(null, { turn: { turn: 5 } }) === 5);
const seqSnap = {
  timeline: { turns: new Map([[9, { end: { seq: 67 } }], [10, { end: { seq: 99 } }]]) },
};
check('无数字字段时按 closing seq 反查', turnIdFrom(seqSnap, { whatever: true }, 67) === 9);
check('查不到返回 undefined', turnIdFrom(null, { whatever: true }, 1) === undefined);
const objTurnSnap = {
  locations: { getTurn: (n) => (n === 7 ? ['e1'] : []) },
  nodes: new Map([['e1', { kind: 'turn-error', data: { code: 'TRANSPORT', message: 'Anthropic stream ended without a stop reason' } }]]),
};
const viaObj = scanTurnFor(objTurnSnap, { kind: 'turn', turn: 7 }, 67);
check('scanTurnFor 用对象 turn 也能扫到报错', viaObj.hits.length === 1 && viaObj.hits[0].id === 'transport.stream', JSON.stringify(viaObj));
check('scanTurnFor 带回 turnId 与 turnKeys', viaObj.turnId === 7 && viaObj.turnKeys.includes('turn'), JSON.stringify([viaObj.turnId, viaObj.turnKeys]));

console.log('=== scanTurn 扫轮次 ===');
const mkSnap = (nodes) => ({
  locations: { getTurn: () => nodes.map((n) => n.key) },
  nodes: new Map(nodes.map((n) => [n.key, n])),
});
const s1 = scanTurn(mkSnap([
  { key: 'a', kind: 'user', data: { text: '你好' } },
  { key: 'b', kind: 'assistant-step', data: { blocks: [] } },
  { key: 'c', kind: 'turn-error', data: { code: 'CONTEXT_WINDOW_EXCEEDED', message: 'pi-ai detected context overflow for model "trae-cn/deepseek-v4.1-flash"' } },
  { key: 'd', kind: 'turn-tail', data: { turn: 1 } },
]), 1);
check('只在报错节点上命中一次', s1.hits.length === 1 && s1.hits[0].key === 'c', JSON.stringify(s1));
check('命中结果带词条 id', s1.hits[0].id === 'context.window.exceeded', s1.hits[0]?.id);
check('用户/助手/尾巴节点不被注解', !s1.hits.some((h) => h.key === 'a' || h.key === 'b' || h.key === 'd'));

const s2 = scanTurn(mkSnap([
  { key: 'x', kind: 'turn-error', data: { code: 'SOMETHING_NEW', message: 'server said: something odd happened' } },
]), 2);
check('未收录报错只计 miss、不渲染', s2.hits.length === 0 && s2.misses === 1, JSON.stringify(s2));

const s3 = scanTurn(mkSnap([
  { key: 'y', kind: 'compaction', data: { message: 'compact · Compaction could not produce a useful summary.' } },
]), 3);
check('压缩失败（compaction 节点）可命中', s3.hits.length === 1 && s3.hits[0].id === 'compact.summary.empty', JSON.stringify(s3));
check('坏快照 fail-open', scanTurn(null, 1).hits.length === 0 && scanTurn({ nodes: {} }, 1).hits.length === 0);
check('sig 可用于相等比较', s1.sig === scanTurn(mkSnap([
  { key: 'a', kind: 'user', data: { text: '你好' } },
  { key: 'c', kind: 'turn-error', data: { code: 'CONTEXT_WINDOW_EXCEEDED', message: 'pi-ai detected context overflow for model "trae-cn/deepseek-v4.1-flash"' } },
]), 1).sig);

// 设置页组件冒烟：mock React 渲染出「存在证明」与自检按钮
console.log('=== 设置页组件冒烟 ===');
let captured = null;
const miniReact = {
  useState: (init) => [init, () => {}],
  createElement: (tag, props, ...kids) => ({ tag, props, kids }),
};
const sectionCtx = {
  ...mockCtx,
  React: miniReact,
  slots: {
    ...mockCtx.slots,
    register: (spec, view) => { if (spec.name === 'settings.section') captured = { spec, view }; return { spec, hasView: typeof view === 'function' }; },
    inject: (name, fn) => fn(),
  },
};
apply(sectionCtx);
check('settings.section 描述符含 id/order/label/locale', captured?.spec?.id === NS && captured?.spec?.order === 460 && captured?.spec?.locale === NS, JSON.stringify(captured?.spec));
check('设置页注册了视图函数', typeof captured?.view === 'function' || captured?.hasView === true);
// ⚠️ 渲染断言搬去 bundle-test.mjs：React 现在只从 bundle factory 的 require("react") 进来，
// 直接 import client.js 的 ESM 路径没有 react，组件会按 fail-open 返回 null。
// （这也正是 2026-11-05 真机崩掉的根因：曾经用 ctx.React 兜底 → cordis 抛
//  `cannot get property "React" without inject` → setup 第一步就断。）
// ⚠️ 渲染断言搬去 bundle-test.mjs：React 现在只从 bundle factory 的 require("react") 进来，
// 直接 import client.js 的 ESM 路径没有 react，组件会按 fail-open 返回 null。

// 回归：cordis 4 对未声明的 ctx 属性会抛 `cannot get property "X" without inject`。
// 真机就是这么崩的（ctx.React），所以用一个「摸到未声明属性就抛」的 Proxy 复现宿主行为。
console.log('=== 未声明 ctx 属性必须不碰 ===');
const strictCtx = new Proxy({ ...mockCtx }, {
  get(target, prop) {
    if (prop in target) return target[prop];
    throw new Error(`cannot get property "${String(prop)}" without inject`);
  },
});
let strictResult;
try { strictResult = apply(strictCtx); } catch (e) { strictResult = { failures: [{ step: 'threw', message: e.message }] }; }
check('不访问未声明的 ctx 属性（apply 级失败为 0）',
  !strictResult.failures.some((f) => f.step === 'apply' || f.step === 'threw'),
  JSON.stringify(strictResult.failures));
check('严格 ctx 下两个挂载点都注册成功',
  !strictResult.failures.some((f) => f.step === 'settings' || f.step === 'turnTail'),
  JSON.stringify(strictResult.failures));

console.log(`\nsmoke: ${ok} passed, ${bad} failed`);
if (bad) process.exitCode = 1;
