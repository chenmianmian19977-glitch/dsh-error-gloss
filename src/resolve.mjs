// src/resolve.mjs — 纯函数引擎主入口。零 I/O、零模型调用、零网络、零 DSH 依赖、fail-open。
import { matchEntry, normalizeMessage } from './match.mjs';
import { redact } from './redact.mjs';

const OPS = new Set(['点按钮', '改配置', '换模型', '新建会话', '看日志']);

/** 用户自定义词条合并：字段级覆盖，causeAssertion 单向锁定（禁止提升）。 */
export function mergeUserEntries(entries, userEntries) {
  const map = new Map(entries.map((e) => [e.id, { ...e }]));
  for (const u of userEntries ?? []) {
    if (!u || !u.id) continue;
    if (u.disabled === true) { map.delete(u.id); continue; }
    const base = map.get(u.id);
    const merged = base ? { ...base, ...u } : { ...u };
    if (base) {
      const rank = { forbidden: 0, conditional: 1, allowed: 2 };
      if (rank[merged.causeAssertion] > rank[base.causeAssertion]) merged.causeAssertion = base.causeAssertion;
      merged.evidence = base.evidence;
      merged.version = base.version;
      merged.origin = 'custom';
    }
    map.set(u.id, merged);
  }
  return [...map.values()];
}

/**
 * @param {{code?:string,message:string,status?:number,provider?:string,event?:object}} input
 * @param {{sessionTokens?:number,modelContextWindow?:number,toolOutputBytes?:number,imageCount?:number,compactionOutcome?:string}} context
 * @param {{entries:Array,fallback:object,version?:string}} dict
 */
export function resolveError(input, context = {}, dict = { entries: [], fallback: {} }) {
  try {
    const rawMessage = String(input?.message ?? '');
    const cleaned = redact(rawMessage);
    const { entry, matchedBy, slots } = matchEntry({ ...input, message: cleaned.text }, dict);

    const assertion = entry.causeAssertion ?? 'forbidden';
    const causes = (entry.causes ?? []).map((c) => ({ ...c, resolved: resolveCertainty(c, assertion, context) }));

    return {
      id: entry.id ?? 'UNKNOWN',
      title: entry.title ?? '未收录的报错',
      summary: entry.summary ?? '原因未验证',
      causes,
      impact: entry.impact ?? '',
      actions: (entry.actions ?? []).filter((a) => OPS.has(a.op)),
      severity: entry.severity ?? 'warning',
      retryable: Boolean(entry.retryable),
      autoRecoverable: Boolean(entry.autoRecoverable),
      causeAssertion: assertion,
      showRawMessage: Boolean(entry.showRawMessage) || matchedBy === 'fallback',
      raw: { message: cleaned.text, code: input?.code ?? '', redacted: cleaned.redacted, redactHits: cleaned.hits },
      slots,
      impactSlots: slots,
      provenance: {
        dictVersion: dict.version ?? entry.version ?? '0.1.0',
        matchedBy,
        evidence: entry.evidence ?? [],
        docRefs: entry.docRefs ?? [],
        logRefs: entry.logRefs ?? [],
        templateId: entry.templateId ?? '',
      },
      chain: undefined,
      _entry: entry,
    };
  } catch (err) {
    // fail-open：任何异常都降级为 UNKNOWN，不阻断 UI
    return {
      id: 'UNKNOWN', title: '未收录的报错', summary: '注解引擎降级，原文已保留。',
      causes: [{ text: '引擎异常', certainty: '需查', resolved: '原因未验证' }],
      impact: '', actions: [{ text: '复制报错原文', op: '点按钮' }],
      severity: 'warning', retryable: false, autoRecoverable: false,
      causeAssertion: 'forbidden', showRawMessage: true,
      raw: { message: String(input?.message ?? ''), code: input?.code ?? '', redacted: false, redactHits: [] },
      slots: {}, impactSlots: {},
      provenance: { dictVersion: '0.1.0', matchedBy: 'fallback', evidence: [], docRefs: [], logRefs: [], error: String(err) },
      chain: undefined, _entry: dict?.fallback ?? {},
    };
  }
}

function resolveCertainty(cause, assertion, context) {
  if (assertion === 'forbidden' || cause.certainty === '需查') return '原因未验证';
  if (cause.certainty === '确定') return '确定';
  // 「可能」仅在 requiresContext 全部取到时保持「可能」，否则也标未验证
  const req = cause.requiresContext ?? [];
  if (req.length === 0) return '可能';
  const available = req.every((k) => context?.[k] !== undefined && context?.[k] !== null);
  return available ? '可能（已取到依据）' : '需查看依据';
}

/** 短注解：≤40 字，不含原因。 */
export function renderShort(ann, t) {
  const first = ann.actions[0]?.text ?? '查看原文';
  let s = t('gloss.short', { title: ann.title, summary: ann.summary }) + ' · ' + t('gloss.suggest', { action: first });
  if (ann.causeAssertion === 'forbidden') s += t('gloss.unknown.hint');
  return s.trim();
}

/** 展开详情：按 certainty 分档渲染原因，forbidden 时整段替换。 */
export function renderDetail(ann, t) {
  const lines = [];
  lines.push(`${t('gloss.raw')}：${ann.raw.message}`);
  lines.push(`${t('gloss.gloss')}：${ann.summary}`);
  const basisLabel = ann.causeAssertion === 'allowed'
    ? t('gloss.basis.local')
    : ann.causeAssertion === 'conditional'
      ? t('gloss.basis.session')
      : t('gloss.basis.unverified');
  lines.push(`${t('gloss.cause')}（${basisLabel}）：`);
  if (ann.causeAssertion === 'forbidden') {
    lines.push(`  ${t('gloss.causeForbidden')}`);
  } else {
    for (const c of ann.causes) {
      const req = (c.requiresContext ?? []).join(', ');
      const logs = ann.provenance.logRefs.join(', ') || '~/.dsh/sessions/';
      if (c.certainty === '确定') lines.push(`  ${t('gloss.causeConfirmed', { text: c.text })}`);
      else if (c.certainty === '可能') lines.push(`  ${t('gloss.causeLikely', { text: c.text, requires: req || '会话上下文' })}`);
      else lines.push(`  ${t('gloss.causeNeeds', { text: c.text, logs })}`);
    }
  }
  lines.push(`${t('gloss.impact')}：${ann.impact}`);
  lines.push(`${t('gloss.actions')}：`);
  ann.actions.forEach((a, i) => lines.push(`  ${i + 1}. [${a.op}] ${a.text}`));
  if (ann.provenance.logRefs.length) lines.push(`${t('gloss.logs')}：${ann.provenance.logRefs.join(' · ')}`);
  const ev = ann.provenance.evidence[0];
  if (ev) lines.push(`${t('gloss.provenance')}：${ev.path}${ev.line ? ':' + ev.line : ''} · 词典 ${ann.id} v${ann.provenance.dictVersion}`);
  return lines.join('\n');
}

/** 简单模板函数：{key} 占位替换。 */
export function makeT(dict, locale = 'zh-CN') {
  return (key, vars = {}) => {
    const template = dict?.[locale]?.[key] ?? dict?.['zh-CN']?.[key] ?? key;
    return String(template).replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
  };
}

export { normalizeMessage };
