// src/match.mjs — 匹配顺序固定：codeExact → codePattern（码族）→ 命名捕获组正则 → UNKNOWN。
// 零依赖、零 I/O。正则只作降级路径，码比文案稳定。
//
// codePattern 是 2026-11-05 新增的第 1.5 层：官方码表里有大量同一子系统的码
// （TEAM_* / GOAL_* / ASK_* / SESSION_* …），一个码族一条词条即可全覆盖，
// 不必为每个码手写。码族词条只给「属于哪个子系统 + 原文里有具体原因」这种
// 不编造的说法，绝不猜具体成因。

const MAX_PATTERN = 512;
const NESTED_QUANTIFIER = /\([^)]*[+*][^)]*\)[+*{]/;

export function normalizeMessage(message) {
  return String(message ?? '').replace(/\s+/g, ' ').trim();
}

export function isSafePattern(pattern) {
  if (typeof pattern !== 'string' || pattern.length === 0) return true;
  if (pattern.length > MAX_PATTERN) return false;
  if (NESTED_QUANTIFIER.test(pattern)) return false;
  try { new RegExp(pattern); return true; } catch { return false; }
}

function compile(entry) {
  const p = entry?.match?.pattern;
  if (!p || !isSafePattern(p)) return null;
  try { return new RegExp(p); } catch { return null; }
}

function codeMatches(entry, code) {
  const spec = entry?.match?.codeExact;
  if (!spec || !code) return false;
  return spec.split('|').some((c) => c.trim() === code);
}

/** 码族匹配：match.codePattern 是一段正则，作用于 code 本身（作者自己写锚点）。 */
function codeFamilyMatches(entry, code) {
  const p = entry?.match?.codePattern;
  if (!p || !code || !isSafePattern(p)) return false;
  try { return new RegExp(p).test(code); } catch { return false; }
}

/**
 * @param {{code?:string,message:string,status?:number,provider?:string}} input
 * @param {{entries:Array,fallback:object}} dict
 * @returns {{entry:object, matchedBy:'code'|'code-family'|'pattern'|'fallback', slots:object, safe:boolean}}
 */
export function matchEntry(input, dict) {
  const code = typeof input?.code === 'string' ? input.code : undefined;
  const msg = normalizeMessage(input?.message);
  const entries = Array.isArray(dict?.entries) ? dict.entries : [];
  const fallback = dict?.fallback ?? { id: 'UNKNOWN', title: '未收录的报错', summary: '原因未验证', causeAssertion: 'forbidden' };

  // 1) 结构化码优先
  const byCode = entries
    .filter((e) => codeMatches(e, code))
    .sort((a, b) => (b.match?.priority ?? 0) - (a.match?.priority ?? 0));
  if (byCode.length) {
    return { entry: byCode[0], matchedBy: 'code', slots: extractSlots(byCode[0], msg), safe: true };
  }

  // 1.5) 码族（TEAM_* / GOAL_* / …），只在没有精确词条时兜这一层
  if (code) {
    const byFamily = entries
      .filter((e) => codeFamilyMatches(e, code))
      .sort((a, b) => (b.match?.priority ?? 0) - (a.match?.priority ?? 0));
    if (byFamily.length) {
      return { entry: byFamily[0], matchedBy: 'code-family', slots: { code }, safe: true };
    }
  }

  // 2) 模板正则降级（按 priority 降序）
  const byPattern = [];
  for (const e of entries) {
    const re = compile(e);
    if (!re) continue;
    const m = re.exec(msg);
    if (!m) continue;
    byPattern.push({ e, score: e.match?.priority ?? 0, groups: m.groups ?? {} });
  }
  byPattern.sort((a, b) => b.score - a.score);
  if (byPattern.length) {
    return { entry: byPattern[0].e, matchedBy: 'pattern', slots: byPattern[0].groups, safe: true };
  }

  // 3) 兜底
  return { entry: fallback, matchedBy: 'fallback', slots: {}, safe: true };
}

function extractSlots(entry, msg) {
  const slots = {};
  for (const name of entry?.match?.slots ?? []) {
    const re = compile(entry);
    const m = re?.exec(msg);
    if (m?.groups?.[name] !== undefined) slots[name] = m.groups[name];
  }
  return slots;
}

/** 词典加载期校验：返回问题列表，空数组表示通过。 */
export function lintDictionary(dict) {
  const problems = [];
  const seen = new Set();
  for (const e of dict?.entries ?? []) {
    if (!e.id) problems.push(`entry missing id`);
    else if (seen.has(e.id)) problems.push(`duplicate id: ${e.id}`);
    else seen.add(e.id);
    if (!Array.isArray(e.evidence) || e.evidence.length === 0) problems.push(`${e.id}: evidence 为空`);
    if (!isSafePattern(e.match?.pattern)) problems.push(`${e.id}: pattern 不安全或过长`);
    if (e.match?.codePattern !== undefined && !isSafePattern(e.match.codePattern)) problems.push(`${e.id}: codePattern 不安全或过长`);
    if (e.match?.codePattern !== undefined && e.match?.codeExact !== undefined) problems.push(`${e.id}: codeExact 与 codePattern 只能二选一`);
    for (const c of e.causes ?? []) {
      if (!['确定', '可能', '需查'].includes(c.certainty)) problems.push(`${e.id}: 非法 certainty ${c.certainty}`);
      if (c.certainty === '确定' && !c.evidenceRef) problems.push(`${e.id}: 确定级 cause 缺 evidenceRef`);
    }
    for (const a of e.actions ?? []) {
      if (!['点按钮', '改配置', '换模型', '新建会话', '看日志'].includes(a.op)) problems.push(`${e.id}: 非法 op ${a.op}`);
    }
    // 文案闸门：summary 禁含因果连词
    if (/\b(因为|由于|导致|所以|原因是|因由)\b/.test(e.summary ?? '')) problems.push(`${e.id}: summary 含因果连词`);
  }
  return problems;
}
