// client/client.js — DSH 适配层入口。只用公开扩展点：locale.register / slots.inject / slots.register。
//
// 挂载点（2026-11-05 依 `dsh-cordis-client-runner` 内的官方 slot 契约目录核对后改正）：
//   1) conversation.chat.turnTail  —— kind: list / scope: session  ⇒ 一个轮次可挂多个条目，
//      官方 ui-deliverables / ui-plan / ui-schedule 都占这个座位。
//      ownerProps = { turn, seq, openFile }，standardProps 里带 useChat 选择器。
//   2) settings.section            —— kind: list / scope: root，设置页的存在证明。
//
// ⚠️ 曾经写错的两处（本文件已改）：
//   · 原挂在 conversation.chat.node 上、key 自造 'error-gloss'。该 slot 是 **keyed**，
//     key 域被固定为 ChatNodeKind（assistant-step / turn-error / tool-call / …），
//     自造 key 永远不会被 dispatch，等于装了什么都不显示；改用已存在的 key 则会
//     顶掉官方渲染器（契约标 replaceRisk: shadows-shipped-ui）。故放弃该座位。
//   · 报错气泡本身由 ui-chat 的 TurnErrorNodeView 渲染，插件只能**另起兄弟行**，
//     不能改它。turnTail 正是「轮次末尾、动作行之上」这一行，位置等价。
import { GLOSS_DATA } from './gloss-data.js';
import { ASSETS } from './gloss-assets.js';
import { resolveError, renderShort, renderDetail, makeT, hashMessage } from './gloss-engine.js';

export const NS = 'dsh-error-gloss';

/** Cordis 服务注入名（短名），对应官方 client bundle 的 exports.inject。 */
export const inject = ['slots', 'locale'];

// 由 build 生成的 __ModuleLoader__ factory 从 require("react") 注入；**不能**去摸 ctx.React。
// 2026-11-05 真机实测：cordis 4 对未在 inject 里声明的 ctx 属性会直接抛
// `cannot get property "React" without inject`，把整个 setup 打断（分区与注解行都不出现）。
let hostReact = null;

// 与 catalog/locales 同源的两份内置 locale（ctx.locale.register 硬契约要求 zh+en 齐全）
export const zh = GLOSS_DATA.locales['zh-CN'];
export const en = GLOSS_DATA.locales.en;

const identityT = (key) => key;

/**
 * 注册失败台账：任何一步注册抛错都记在这里，并在设置页展示，
 * 绝不让它冒泡到 web boot —— 那会导致整个 DSH 起不来（2026-11-05 实测崩溃）。
 */
const failures = [];
function guard(step, fn) {
  try {
    return fn();
  } catch (e) {
    const message = (e && (e.message || String(e))) || 'unknown';
    failures.push({ step, message });
    try { console.error(`[dsh-error-gloss] ${step} 注册失败（已降级，不影响宿主）:`, e); } catch { /* ignore */ }
    return undefined;
  }
}

/**
 * 哪些 chat node 值得尝试注解。白名单而非黑名单：
 * 助手正文 / 用户气泡 / 轮次尾巴这些「正常行」绝不能被贴标签。
 */
const ANNOTATED_KINDS = new Set([
  'turn-error',
  'compaction',
  'manual-compaction',
  'command',
  'model-retry',
  'turn-max-tokens',
  'tool-call',
]);

/** 从 chat node 的 data 里抠出 code / message，兼容几种已知投影形态。 */
function pickFailure(data) {
  if (!data || typeof data !== 'object') return null;
  const failure = data.failure ?? data.error ?? data.reason?.error;
  const code = typeof failure?.code === 'string' ? failure.code
    : typeof data.code === 'string' ? data.code
      : undefined;
  const message = String(
    failure?.message ?? data.message ?? data.text ?? data.content ?? data.summary ?? '',
  );
  return code || message ? { code, message } : null;
}

/**
 * 纯函数：扫一个轮次的全部节点，返回「词典认得出来的」报错。
 * 不改状态、不读时钟、不抛错（fail-open），可以在 Node 里直接单测。
 *
 * @param snapshot 会话投影快照（locations.getTurn + nodes.get）
 * @param turn     轮次号
 * @returns {{ sig: string, hits: Array<{key:string,seq:any,code?:string,message:string,id:string}>, misses: number }}
 */
export function scanTurn(snapshot, turn) {
  const hits = [];
  const seen = [];
  let misses = 0;
  try {
    const keys = snapshot?.locations?.getTurn?.(turn);
    if (!Array.isArray(keys)) return { sig: '', hits, misses, seen, noTurn: true };
    for (const key of keys) {
      const node = snapshot?.nodes?.get?.(key);
      if (!node) { seen.push('?'); continue; }
      seen.push(String(node.kind));
      if (!ANNOTATED_KINDS.has(node.kind)) continue;
      const input = pickFailure(node.data);
      if (!input) continue;
      // 能解析 → 留；解析成 UNKNOWN → 只记一个 miss，不渲染
      let ann;
      try {
        ann = resolveError({ code: input.code, message: input.message }, {}, GLOSS_DATA);
      } catch { continue; }
      if (ann.id === 'UNKNOWN') { misses += 1; continue; }
      hits.push({
        key: `${key}`,
        seq: node.seq ?? node.data?.seq,
        code: input.code,
        message: input.message,
        id: ann.id,
      });
    }
  } catch { /* fail-open：投影结构变了就静默不注解 */ }
  return { sig: hits.map((h) => `${h.key}|${h.id}`).join(',') + `#${misses}`, hits, misses, seen };
}

/** useChat 的相等比较：签名相同就不再触发重渲染。 */
function sameScan(a, b) {
  return a === b || (!!a && !!b && a.sig === b.sig);
}

/**
 * 从 slot 给的 `turn` 里取出轮次**数字**。
 *
 * 2026-11-05 真机实测：`TurnTailOwnerProps.turn` 的类型是 `TurnLocation`（对象），
 * 而 `snapshot.locations.getTurn(n)` 的 Map 键是轮次数字 —— 直接把对象喂进去
 * 永远返回空数组（症状：设置页「最近一次扫描」显示 `轮次 [object Object] · 节点 0`）。
 *
 * 三层兜底：数字 → 对象里的数字字段（含嵌套一层）→ 用 closing seq 在 timeline 里反查。
 */
export function turnIdFrom(snapshot, turn, seq) {
  if (typeof turn === 'number' && Number.isFinite(turn)) return turn;
  const NUM_KEYS = ['turn', 'id', 'index', 'number', 'turnNumber', 'turnId'];
  if (turn && typeof turn === 'object') {
    for (const k of NUM_KEYS) if (typeof turn[k] === 'number' && Number.isFinite(turn[k])) return turn[k];
    const inner = turn.turn;
    if (inner && typeof inner === 'object') {
      for (const k of NUM_KEYS) if (typeof inner[k] === 'number' && Number.isFinite(inner[k])) return inner[k];
    }
  }
  const turns = snapshot?.timeline?.turns;
  if (turns && typeof turns.forEach === 'function' && Number.isFinite(seq)) {
    let found;
    turns.forEach((t, id) => {
      if (found !== undefined) return;
      if (t?.end?.seq === seq) found = typeof id === 'number' ? id : Number(id);
    });
    if (Number.isFinite(found)) return found;
  }
  return undefined;
}

/** 把「取轮次号 + 扫描」合成一次，供 useChat 选择器调用；顺带带回诊断字段。 */
export function scanTurnFor(snapshot, turn, seq) {
  const turnId = turnIdFrom(snapshot, turn, seq);
  const base = scanTurn(snapshot, turnId);
  return {
    ...base,
    turnId,
    turnKeys: turn && typeof turn === 'object' ? Object.keys(turn).slice(0, 8) : [],
  };
}

/**
 * 未收录统计：只留在内存。
 * ⚠️ 2026-11-05 撤掉持久化版本——读写 `ctx.storage` / `ctx.settings` 同样属于
 * 「未声明 inject 的 ctx 属性」，cordis 会抛错。要恢复落盘，得先把服务名加进
 * `exports.inject` 并确认该服务在客户端侧确实存在，否则会让 fiber 变 pending。
 */
function noteMiss() {
  /* 暂不落盘：见上方注释 */
}

/** 本地计数：命中 / 未收录，仅内存，随会话结束消失。 */
const counters = { hits: 0, misses: 0 };
function bump(kind, n = 1) { try { counters[kind] += n; } catch { /* fail-open */ } }

/**
 * 海洋主题的视觉常量。全部用代码实现，不依赖任何位图资产：
 * - 渐变字 = CSS background-clip:text（DSH 官方「深度求索中」就是这套）
 * - 鲸尾图标 = 手写 SVG path（12px 下比位图清晰，且能着色）
 * - 左侧竖条 / 面板底色 = 青蓝渐变
 */
const OCEAN = {
  /** 标题与按钮文字的渐变（青 → 蓝 → 紫） */
  textGrad: 'linear-gradient(90deg, #7FD4F5 0%, #5B9CF8 52%, #9D7BF5 100%)',
  /** 左侧 2px 竖条（青 → 蓝） */
  barGrad: 'linear-gradient(180deg, #5B9CF8, #1D9E75)',
  /** 注解行底：极淡的海蓝，深色界面上几乎看不出，浅色界面上是一层雾 */
  panelBg: 'linear-gradient(90deg, rgba(91,156,248,.10), rgba(29,158,117,.03))',
  /** 正文色（渐变长文本会糊，正文保持可读的蓝灰） */
  body: 'var(--dsw-alias-label-secondary, #C7D7EA)',
};

/** 渐变字：长文本别整段渐变（横向拉伸会发灰），只给标题 / 按钮用。 */
function gradText(size, weight, extra) {
  return {
    backgroundImage: OCEAN.textGrad,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: 'transparent',
    fontSize: `${size}px`,
    fontWeight: weight,
    lineHeight: 1.5,
    ...extra,
  };
}

/** 鲸尾图标。垂直尾柄 + 两片尾鳍，12–14px 下仍可辨认；描边走渐变。 */
function WhaleTail({ size = 13, id = 'gloss-tail-grad' }) {
  const React = hostReact;
  if (!React?.createElement) return null;
  const h = React.createElement;
  return h('svg', {
    width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
    'aria-hidden': 'true', style: { flex: 'none', display: 'block' },
  },
  h('defs', null,
    h('linearGradient', { id, x1: '2', y1: '15', x2: '14', y2: '3', gradientUnits: 'userSpaceOnUse' },
      h('stop', { offset: '0', stopColor: '#7FD4F5' }),
      h('stop', { offset: '1', stopColor: '#9D7BF5' }))),
  h('path', {
    d: 'M8 15V8.4M8 8.4C5.4 8.4 3.2 6.4 3.2 3.4c3 .7 4.8 3 4.8 5 0-2 1.8-4.3 4.8-5 0 3-2.2 5-4.8 5Z',
    stroke: `url(#${id})`, strokeWidth: '1.4', strokeLinecap: 'round', strokeLinejoin: 'round',
  }));
}

/** 最近一次扫描结果，给设置页显示（排查「为什么没出注解」的唯一现场）。 */
let lastScan = null;

/** 一次性诊断开关：宿主没给 useChat 时提示一次，刷屏无意义。 */
let warnedNoHook = false;

/**
 * 头像按「原因可信度」挑表情。表情只调语气，不承载信息——
 * 三档判断仍然靠文字（原因 / 可能原因 / 原因未验证）。
 *
 * ⚠️ 美术包的版权边界（2026-11-05）：
 * 角色形象「大肥鱼」由 ZipZipPipe 创作，许可为 CC BY-NC-SA 4.0（不可商用 + 相同方式共享），
 * 与本项目的 MIT 不兼容，**因此不随仓库 / npm 包分发**。开源构建里 ASSETS 为空，
 * 这里回落到原创的鲸尾徽章（见 FallbackAvatar），主题观感不变。
 * 本地想要角色头像：把图片放进 `art/`（已在 .gitignore 里）后重新 build 即可。
 */
export function avatarFor(ann) {
  if (!ann || ann.id === 'UNKNOWN' || ann.causeAssertion === 'forbidden') return ASSETS?.sorry;
  if (ann.causeAssertion === 'conditional') return ASSETS?.thinking;
  return ASSETS?.serious;
}

/** 没有美术包时的原创头像：渐变圆形 + 鲸尾，纯矢量，零体积。 */
function FallbackAvatar({ size = 20, id = 'gloss-avatar' }) {
  const React = hostReact;
  if (!React?.createElement) return null;
  const h = React.createElement;
  return h('svg', {
    width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': 'true',
    style: { flex: 'none', display: 'block', marginTop: '1px' },
  },
  h('defs', null,
    h('linearGradient', { id, x1: '4', y1: '20', x2: '20', y2: '4', gradientUnits: 'userSpaceOnUse' },
      h('stop', { offset: '0', stopColor: '#7FD4F5' }),
      h('stop', { offset: '1', stopColor: '#9D7BF5' }))),
  h('circle', { cx: '12', cy: '12', r: '11', fill: 'rgba(91,156,248,.16)', stroke: `url(#${id})`, strokeWidth: '1' }),
  h('path', {
    d: 'M12 18v-6M12 12c-2.4 0-4.4-1.7-4.4-4.2 2.6.7 4.4 2.7 4.4 4.2 0-1.5 1.8-3.5 4.4-4.2 0 2.5-2 4.2-4.4 4.2Z',
    fill: 'none', stroke: `url(#${id})`, strokeWidth: '1.3', strokeLinecap: 'round', strokeLinejoin: 'round',
  }));
}

/** 单条注解：竖条 + 头像 + 【标题】+ 释义 + 建议 + 鲸尾展开按钮。 */
function GlossRow({ ann, t }) {
  const React = hostReact;
  if (!React?.useState || !React?.createElement) return null;   // fail-open
  const [open, setOpen] = React.useState(false);
  const h = React.createElement;
  const action = ann?.actions?.[0]?.text;
  const avatar = avatarFor(ann);
  const size = open ? 40 : 20;

  return h('div', {
    className: 'gloss-row',
    'data-gloss-id': ann.id,
    role: 'note',
    style: {
      display: 'flex', gap: '10px', alignItems: 'flex-start',
      padding: '8px 12px 8px 0', borderRadius: '10px',
      backgroundImage: OCEAN.panelBg, overflow: 'hidden',
    },
  },
  // 左侧海洋竖条：一眼能认出「这是注解」，又不用整块上色
  h('div', {
    style: { width: '2px', flex: 'none', alignSelf: 'stretch', borderRadius: '2px', backgroundImage: OCEAN.barGrad },
  }),
  avatar ? h('img', {
    src: avatar, alt: '', 'aria-hidden': 'true',
    style: {
      width: `${size}px`, height: `${size}px`, flex: 'none', objectFit: 'cover',
      borderRadius: '50%', marginTop: open ? 0 : '1px', transition: 'width .12s, height .12s',
    },
  }) : h(FallbackAvatar, { size, id: `gloss-av-${ann.id}` }),
  h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0, flex: 1 } },
    h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '6px 8px' } },
      h('span', { style: gradText(12.5, 500) }, `【${ann.title}】`),
      h('span', { style: { fontSize: '12.5px', lineHeight: 1.55, color: OCEAN.body } }, ann.summary),
      action ? h('span', { style: { fontSize: '12.5px', lineHeight: 1.55, color: OCEAN.body, opacity: .8 } },
        `· ${t('gloss.suggest', { action })}`) : null,
    ),
    h('button', {
      className: 'gloss-toggle', type: 'button',
      onClick: () => setOpen(!open),
      'aria-expanded': String(open),
      style: {
        display: 'inline-flex', alignItems: 'center', gap: '5px', alignSelf: 'start',
        padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
      },
    },
    h(WhaleTail, { size: 13, id: `gloss-tail-${ann.id}` }),
    h('span', { style: gradText(12, 400) }, open ? t('gloss.collapse') : t('gloss.expand'))),
    open ? h('pre', {
      className: 'gloss-detail',
      style: {
        whiteSpace: 'pre-wrap', margin: 0, fontSize: '12px', lineHeight: 1.7,
        color: OCEAN.body, opacity: .92, fontFamily: 'inherit',
      },
    }, renderDetail(ann, t)) : null,
  ));
}

/**
 * 轮次尾部的注解行。挂在 conversation.chat.turnTail（list 座位），
 * 一个轮次一条 entry；这个轮次没有任何可识别报错时返回 null，不占布局。
 */
function TurnGloss(props) {
  const React = hostReact;
  const t = props?.t ?? identityT;
  const useChat = props?.useChat;
  const turn = props?.turn;
  const seq = props?.seq;

  if (typeof useChat !== 'function' && !warnedNoHook) {
    warnedNoHook = true;
    try {
      console.warn('[dsh-error-gloss] turnTail 未收到 useChat（standardProps 变了？）—— 注解将不渲染');
    } catch { /* ignore */ }
  }

  // hooks 必须无条件调用（宿主可能没注入 useChat，那种情况下永久不渲染）
  const scanned = typeof useChat === 'function'
    ? useChat((snapshot) => scanTurnFor(snapshot, turn, seq), sameScan)
    : null;

  if (!React?.createElement) return null;
  const hits = scanned?.hits ?? [];

  // 诊断：把这次扫描的结果留在内存里给设置页看，并在形状变化时只喊一次。
  // 没有这一行的话，失败的所有形态（没拿到 useChat / 快照形状不对 / 组件抛错）
  // 在界面上都长得一样：什么都不显示。
  try {
    lastScan = {
      turn: scanned?.turnId ?? (typeof turn === 'number' ? turn : undefined),
      turnKeys: scanned?.turnKeys ?? [],
      hasHook: typeof useChat === 'function',
      noTurn: Boolean(scanned?.noTurn),
      seen: scanned?.seen ?? [],
      hits: hits.length,
      ids: hits.map((x) => x.id),
      misses: scanned?.misses ?? 0,
    };
    if (lastScan.sig !== `${turn}|${hits.length}|${lastScan.seen.length}`) {
      lastScan.sig = `${turn}|${hits.length}|${lastScan.seen.length}`;
      console.info('[dsh-error-gloss] 扫描', JSON.stringify(lastScan));
    }
  } catch { /* ignore */ }

  if (hits.length === 0) {
    if (scanned?.misses) { bump('misses', scanned.misses); noteMiss(); }
    return null;
  }
  bump('hits', hits.length);

  // 上下文目前只能给空：token 用量要从 uiWorkspace / conversation 服务读，
  // 而那两个名字未在 exports.inject 里声明，摸一下就抛错（见文件头注释）。
  // 于是「可能原因」档统一降级成「需查看依据」，这是诚实降级，不是丢功能。
  const context = {};
  const h = React.createElement;
  try {
    const rows = [];
    for (const hit of hits) {
      let ann;
      try {
        ann = resolveError({ code: hit.code, message: hit.message }, context, GLOSS_DATA);
      } catch { continue; }
      rows.push(h(GlossRow, { key: hit.key, ann, t }));
    }
    if (rows.length === 0) return null;
    return h('div', {
      className: 'gloss-notes',
      'data-gloss-turn': String(turn ?? ''),
      'data-gloss-ns': NS,
      // eslint-disable-next-line no-undef
    }, rows);
  } catch (e) {
    try { console.error('[dsh-error-gloss] 渲染注解失败:', e); } catch { /* ignore */ }
    return null;
  }
}

/** 常驻设置页入口：版本 / 词条数 / 状态 / 开关 / 自检按钮。
 *  这是「装没装上」的唯一可见证明；不往对话界面塞任何常驻按钮。 */
function SettingsPage({ React, t }) {
  if (!React?.useState || !React?.createElement) return null;   // fail-open
  const [enabled, setEnabled] = React.useState(true);
  const [preview, setPreview] = React.useState(null);
  const h = React.createElement;

  const sample = preview ?? null;
  const row = (label, value) => h('div', { style: { display: 'flex', gap: '8px', padding: '4px 0', fontSize: '13px' } },
    h('span', { style: { opacity: .7, minWidth: '96px' } }, label),
    h('span', null, String(value)));

  return h('div', { 'data-gloss-settings': NS, style: { display: 'grid', gap: '10px' } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } },
      h('strong', { style: { display: 'inline-flex', alignItems: 'center', gap: '8px' } },
        ASSETS?.calm ? h('img', {
          src: ASSETS.calm, alt: '', 'aria-hidden': 'true',
          style: { width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' },
        }) : h(FallbackAvatar, { size: 28, id: 'gloss-av-settings' }),
        h('span', { style: gradText(14, 500) }, t('settings.title'))),
      h('code', { style: { padding: '2px 7px', borderRadius: '6px', background: 'var(--dsw-alias-fill-subtle, #ffffff14)' } },
        'v' + GLOSS_DATA.version),
      h('span', { style: { opacity: .7, fontSize: '12px' } },
        `${t('settings.entries')} ${GLOSS_DATA.entries.length}`)),
    row(t('settings.status'), enabled ? t('settings.statusActive') : t('settings.statusOff')),
    row(t('settings.hitCount'), counters.hits),
    row(t('settings.missCount'), counters.misses),
    row(t('settings.lastScan'), lastScan === null
      ? t('settings.lastScanNone')
      : `${t('settings.lastScanTurn')} ${lastScan.turn ?? '?'} · ${t('settings.lastScanHook')} ${lastScan.hasHook ? '✓' : '✗'} · ${t('settings.lastScanNodes')} ${lastScan.noTurn ? 'getTurn=undefined' : lastScan.seen.length} · ${t('settings.lastScanHits')} ${lastScan.hits}`),
    lastScan !== null && (lastScan.seen.length > 0 || (lastScan.turnKeys ?? []).length > 0)
      ? h('div', { style: { fontSize: '11px', opacity: .6, wordBreak: 'break-all' } },
        [
          ...((lastScan.turnKeys ?? []).length ? [`turn{${lastScan.turnKeys.join(',')}}`] : []),
          ...lastScan.seen,
        ].join('  '))
      : null,
    row(t('settings.dictPath'), 'catalog/'),

    h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' } },
      h('input', {
        type: 'checkbox', checked: enabled,
        onChange: (e) => setEnabled(Boolean(e?.target?.checked)),
      }),
      h('span', null, `${t('settings.enabled')} · ${enabled ? t('settings.on') : t('settings.off')}`)),

    h('button', {
      type: 'button',
      onClick: () => {
        try {
          const a = resolveError({
            code: 'CONTEXT_WINDOW_EXCEEDED',
            message: 'pi-ai detected context overflow for model "trae-cn/deepseek-v4.1-flash"',
          }, {}, GLOSS_DATA);
          setPreview({ short: renderShort(a, t), detail: renderDetail(a, t) });
        } catch { setPreview({ short: t('settings.noReact'), detail: '' }); }
      },
      style: { justifySelf: 'start', padding: '6px 12px', cursor: 'pointer' },
    }, t('settings.selftest')),
    h('div', { style: { opacity: .65, fontSize: '12px' } }, t('settings.selftestHint')),

    // 注册失败诊断：任何一步没挂上也在这里显形，不再把宿主启动一起拖死
    failures.length
      ? h('div', {
        role: 'alert',
        'data-gloss-failures': String(failures.length),
        style: {
          padding: '8px 10px', borderRadius: '6px', fontSize: '12px', whiteSpace: 'pre-wrap',
          border: '1px solid var(--dsw-alias-state-error-primary, #c0392b)',
        },
      }, t('settings.failures'), h('div', { style: { marginTop: '4px', opacity: .85 } },
        failures.map((f) => `${f.step}: ${f.message}`).join('\n')))
      : null,
    sample ? h('div', { style: { padding: '10px', borderRadius: '8px', background: 'var(--dsw-alias-fill-subtle, #ffffff0d)' } },
      h('div', { style: { fontSize: '12px', opacity: .7, marginBottom: '6px' } }, t('settings.selftestLabel')),
      h('div', { style: { fontSize: '13px' } }, sample.short),
      h('pre', { style: { whiteSpace: 'pre-wrap', fontSize: '12px', margin: '8px 0 0' } }, sample.detail)) : null,
  );
}

/**
 * 实际注册流程。**整体再包一层 try/catch**：web boot 内核会遍历所有 plugin fiber，
 * 任何一个不是 active 就 throw `web boot: N entry did not activate` 并让整个桌面起不来
 * （2026-11-05 真机实测崩溃）。插件没有任何资格把宿主拖死，所有异常一律降级。
 */
function setup(ctx) {

  // 1) 注册命名空间字典；官方 README 明写「UI 已挂载后再注册无需重新挂载即生效」
  ctx.effect(
    () => guard('dictionaries', () => ctx.locale.register(NS, { zh, en })),
    'dsh-error-gloss: dictionaries',
  );
  const t = (key, vars) => {
    try {
      return ctx.locale.bind(NS)(key, vars);
    } catch {
      return identityT(key);
    }
  };

  // 2) 设置页先挂：它是「注册失败台账」的唯一展示面，必须尽最大可能活下来。
  //    官方 settings.section 契约只投影 id / order / label（未知 id 落齿轮图标），故不传 icon。
  ctx.slots.inject('settings.section', () => guard('settings', () => ctx.slots.register({
    name: 'settings.section',
    id: NS,
    order: 460,
    label: () => t('settings.title'),
    locale: NS,
  }, (props) => SettingsPage({ ...props, React: hostReact, t }))));

  // 3) 轮次尾巴：list 座位，一个轮次一个 entry。fresh id 与官方条目并存，不替换任何东西。
  ctx.slots.inject('conversation.chat.turnTail', () => guard('turnTail', () => ctx.slots.register({
    name: 'conversation.chat.turnTail',
    id: NS,
    order: 500,
    locale: NS,
  }, (props) => TurnGloss({ ...props, t }))));
}

export function apply(ctx) {
  const from = failures.length;      // 本次 apply 的失败区间（台账本身是全局的，供设置页展示）
  try {
    setup(ctx);
  } catch (e) {
    const message = (e && (e.message || String(e))) || 'unknown';
    failures.push({ step: 'apply', message });
    try { console.error('[dsh-error-gloss] apply 失败（已降级，不影响宿主）:', e); } catch { /* ignore */ }
  }
  return {
    ns: NS,
    version: GLOSS_DATA.version,
    entryCount: GLOSS_DATA.entries.length,
    settingsSection: true,
    turnTail: true,
    failures: failures.slice(from),
  };
}
