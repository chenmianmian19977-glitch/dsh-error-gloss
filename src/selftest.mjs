// src/selftest.mjs — 本地自测。零网络、零 DSH 依赖。node src/selftest.mjs
import { loadDictionary } from './load.mjs';
import { resolveError, renderShort, renderDetail, makeT, mergeUserEntries } from './resolve.mjs';
import { lintDictionary, matchEntry } from './match.mjs';
import { redact } from './redact.mjs';
import { aggregateChain } from './chain.mjs';

const { dict, problems, entryCount } = loadDictionary();
const t = makeT({ 'zh-CN': dict.locales['zh-CN'], en: dict.locales.en });
let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log(`  FAIL  ${name}${detail ? ' :: ' + detail : ''}`); }
}

console.log('=== 0. 词典加载与静态校验 ===');
console.log(`  entries=${entryCount}  problems=${problems.length}`);
check('词典 lint 零问题', problems.length === 0, problems.join(' | '));
const CORE_IDS = ['context.window.exceeded', 'compact.summary.empty', 'compact.changed', 'compact.commit.dirty',
  'compact.persistence', 'compact.busy', 'compact.cancelled', 'invalid.request.400.remote', 'command.exit1',
  'fs.sandbox.denied', 'quota.exhausted', 'auth.invalid', 'rate.limit', 'empty.response', 'transport.stream'];
check('15 条核心词条齐备（码族词条另计）',
  CORE_IDS.every((id) => dict.entries.some((e) => e.id === id)), `got ${entryCount}`);
check('zh/en 键集一致', JSON.stringify(Object.keys(dict.locales['zh-CN']).sort()) === JSON.stringify(Object.keys(dict.locales.en).sort()));
check('每条词条带 evidence', dict.entries.every((e) => e.evidence?.length > 0));

console.log('=== 1. 截图那屏 4 个片段 ===');
const shot = resolveError({ code: 'CONTEXT_WINDOW_EXCEEDED', message: 'pi-ai detected context overflow for model "trae-cn/deepseek-v4.1-flash"' }, {}, dict);
check('溢出按 code 命中', shot.id === 'context.window.exceeded', shot.id);
check('溢出中文标题', shot.title === '上下文窗口超限', shot.title);
check('溢出 causeAssertion=conditional', shot.causeAssertion === 'conditional');
check('溢出模型名变量槽', shot.slots?.model === 'trae-cn/deepseek-v4.1-flash' || shot.provenance.matchedBy === 'code', JSON.stringify(shot.slots));
const compact = resolveError({ message: 'compact · Compaction could not produce a useful summary. The attempt is recorded in the session log.' }, {}, dict);
check('压缩失败命中 F03', compact.id === 'compact.summary.empty', compact.id);
const compact2 = resolveError({ message: 'Compaction could not produce a useful summary. The attempt is recorded in the session log.' }, {}, dict);
check('压缩失败（无 compact 前缀）同样命中', compact2.id === 'compact.summary.empty', compact2.id);

console.log('=== 2. 6 条压缩分支全覆盖 ===');
const compactCases = [
  ['Compaction is unavailable because this process has an active compaction, or the agent is not idle.', 'compact.busy'],
  ['Compaction cancelled.', 'compact.cancelled'],
  ['The history selected for compaction changed before it could be replaced. The attempt is recorded in the session log.', 'compact.changed'],
  ['Compaction could not produce a useful summary. The attempt is recorded in the session log.', 'compact.summary.empty'],
  ['Compaction did not finish cleanly; some session history may have changed. Inspect the current session state before retrying.', 'compact.commit.dirty'],
  ['Compaction finished, but the session could not be saved.', 'compact.persistence'],
];
for (const [msg, id] of compactCases) {
  const a = resolveError({ message: msg }, {}, dict);
  check(`压缩分支 ${id}`, a.id === id, a.id);
}

console.log('=== 3. 真实运行日志样本 ===');
const invalid = resolveError({ code: 'INVALID_REQUEST', status: 400, message: 'dsh: INVALID_REQUEST: 400: {"code":null,"message":"WorkBuddy AI: model [deep-model] service info not found","param":null,"type":"invalid_request_error"}' }, {}, dict);
check('INVALID_REQUEST 400 命中', invalid.id === 'invalid.request.400.remote', invalid.id);
check('服务端自由文本 causeAssertion=forbidden', invalid.causeAssertion === 'forbidden');
check('原文完整保留', invalid.showRawMessage === true && invalid.raw.message.includes('service info not found'));
const pnpm = resolveError({ message: 'Command failed with exit code 1: "D:\\DEEPSEEK harness 桌面版\\DeepSeek Harness.exe" --expose-internals "pnpm.mjs" peers check' }, {}, dict);
check('pnpm exit 1 命中', pnpm.id === 'command.exit1', pnpm.id);
check('pnpm 路径已脱敏', pnpm.raw.redacted === true && !pnpm.raw.message.includes('DeepSeek Harness.exe'), pnpm.raw.message);
const sandbox = resolveError({ code: 'FS_SANDBOX_DENIED', message: '[sandbox: file access denied under workspace-write mode]' }, {}, dict);
check('沙箱拒绝命中', sandbox.id === 'fs.sandbox.denied', sandbox.id);

console.log('=== 4. 码类与兜底 ===');
for (const [code, msg, id] of [
  ['QUOTA', 'Request quota exhausted.', 'quota.exhausted'],
  ['ACCOUNT_QUOTA', 'Request quota exhausted.', 'quota.exhausted'],
  ['AUTH', 'API key is invalid', 'auth.invalid'],
  ['RATE_LIMIT', 'usage exceeds frequency limit', 'rate.limit'],
  ['EMPTY_RESPONSE', 'model "x" returned a completed response with no content', 'empty.response'],
  ['TRANSPORT', 'Anthropic stream ended without a stop reason', 'transport.stream'],
]) {
  const a = resolveError({ code, message: msg }, {}, dict);
  check(`${code} → ${id}`, a.id === id, a.id);
}
const unknown = resolveError({ code: 'SOME_NEW_CODE_9999', message: 'totally new upstream wording here' }, {}, dict);
check('未知码走 UNKNOWN', unknown.id === 'UNKNOWN', unknown.id);
check('UNKNOWN causeAssertion=forbidden', unknown.causeAssertion === 'forbidden');
check('UNKNOWN 原因区为「原因未验证」', renderDetail(unknown, t).includes('原因未验证'));

console.log('=== 5. 确定性闸门与文案 ===');
check('forbidden 详情不含「因为」断言', !renderDetail(invalid, t).includes('原因：因为'));
check('allowed 详情含「因为」', renderDetail(resolveError({ code: 'QUOTA', message: 'Request quota exhausted.' }, {}, dict), t).includes('原因：因为'));
const shortShot = renderShort(shot, t);
check('短注解不含原因', !shortShot.includes('因为') && shortShot.includes('上下文窗口超限'), shortShot);
check('短注解带建议', shortShot.includes('建议：'), shortShot);
check('en 回退可用', makeT({ 'zh-CN': dict.locales['zh-CN'], en: dict.locales.en }, 'en')('gloss.expand') === 'Details');

console.log('=== 6. 脱敏 ===');
const r = redact('key sk-abcdefgh123456 request_id: 3a3864c3-1111-2222-3333-444444444444 at C:\\Users\\MR\\.dsh\\.env phone 13800138000');
check('sk 脱敏', !r.text.includes('sk-abcdefgh123456'));
check('UUID 脱敏', !r.text.includes('3a3864c3'));
check('Windows 路径脱敏', !r.text.includes('C:\\Users\\MR'));
check('手机号脱敏', !r.text.includes('13800138000'));
check('脱敏命中记录', r.redacted && r.hits.length >= 3, r.hits.join(','));

console.log('=== 7. fail-open ===');
const broken = resolveError({ code: 'X', message: 'y' }, {}, { entries: null, fallback: dict.fallback });
check('异常词典不抛错', broken.id === 'UNKNOWN', broken.id);
const evil = { ...dict, entries: [...dict.entries, { id: 'evil', code: 'EVIL', title: 'x', summary: 'y', causes: [], impact: '', actions: [], severity: 'info', retryable: false, autoRecoverable: false, causeAssertion: 'allowed', match: { codeExact: 'EVIL', pattern: '((a+)+)+$', priority: 99 }, version: '0.1.0', evidence: [{ kind: 'source-template', path: 'x' }] }] };
check('危险正则被 lint 拦下', lintDictionary(evil).some((p) => p.includes('evil')));
check('危险正则运行时被跳过', matchEntry({ code: 'NOPE', message: 'aaaa' }, evil).matchedBy !== 'pattern');

console.log('=== 8. 因果链聚合（截图那一屏） ===');
const chain = aggregateChain([
  { type: 'turn/start', seq: 1, time: 1, data: { turn: 15 } },
  { type: 'manual-compaction', seq: 2, time: 2, data: { outcome: { text: 'Compaction could not produce a useful summary. The attempt is recorded in the session log.' } } },
  { type: 'turn/end', seq: 3, time: 3, data: { turn: 15, reason: { kind: 'error', error: { message: 'pi-ai detected context overflow for model "trae-cn/deepseek-v4.1-flash"', code: 'CONTEXT_WINDOW_EXCEEDED' } } } },
]);
check('识别为一条因果链', chain.isChain === true);
check('给出根因', chain.rootCause.includes('自动压缩未产出可用摘要'), chain.rootCause);
check('给出可执行建议', chain.suggestedActions.length >= 2);

console.log('=== 9. 用户自定义合并 ===');
const merged = mergeUserEntries(dict.entries, [{ id: 'auth.invalid', title: '我的叫法', causeAssertion: 'allowed' }]);
check('字段级覆盖生效', merged.find((e) => e.id === 'auth.invalid').title === '我的叫法');
check('自定义不得提升 causeAssertion（本例原本 allowed 保持不变）', merged.find((e) => e.id === 'auth.invalid').causeAssertion === 'allowed');
const merged2 = mergeUserEntries(dict.entries, [{ id: 'context.window.exceeded', causeAssertion: 'allowed' }]);
check('conditional 被禁止提升为 allowed', merged2.find((e) => e.id === 'context.window.exceeded').causeAssertion === 'conditional');
check('disabled 可屏蔽内置条目', !mergeUserEntries(dict.entries, [{ id: 'rate.limit', disabled: true }]).some((e) => e.id === 'rate.limit'));

console.log('=== 10. 码族覆盖（一个前缀顶一整族官方码） ===');
const fam = (code) => matchEntry({ code, message: '' }, dict);
check('TEAM_* 命中码族', fam('TEAM_TASK_NOT_FOUND').entry.id === 'family.team', JSON.stringify(fam('TEAM_TASK_NOT_FOUND').entry.id));
check('码族 matchedBy = code-family', fam('TEAM_TASK_NOT_FOUND').matchedBy === 'code-family');
check('GOAL_* 命中码族', fam('GOAL_STALE_REVISION').entry.id === 'family.goal');
check('ASK_* 命中提问族', fam('ASK_TIMED_OUT').entry.id === 'family.ask');
check('SESSION_* 命中会话族', fam('SESSION_NOT_FOUND').entry.id === 'family.session');
check('SANDBOX_* 命中沙箱族', fam('SANDBOX_UNAVAILABLE').entry.id === 'family.sandbox');
check('INVALID_MODEL_* 命中模型配置族', fam('INVALID_MODEL_MAX_TOKENS').entry.id === 'family.model.adapter');
check('ACTIVATION_* 命中子任务族', fam('ACTIVATION_CLOSING').entry.id === 'family.activation');
check('UNKNOWN_TOOL 命中工具族', fam('UNKNOWN_TOOL').entry.id === 'family.tool.invoke');
check('码族不抢精确词条：CONTEXT_WINDOW_EXCEEDED 仍走精确条目',
  fam('CONTEXT_WINDOW_EXCEEDED').entry.id === 'context.window.exceeded' && fam('CONTEXT_WINDOW_EXCEEDED').matchedBy === 'code');
check('码族不抢精确词条：FS_SANDBOX_DENIED 仍走精确条目', fam('FS_SANDBOX_DENIED').entry.id === 'fs.sandbox.denied');
check('码族词条一律 forbidden（不编原因）', fam('TEAM_TASK_NOT_FOUND').entry.causeAssertion === 'forbidden');
check('码族命中也携带 code 变量槽', fam('TEAM_TASK_NOT_FOUND').slots?.code === 'TEAM_TASK_NOT_FOUND', JSON.stringify(fam('TEAM_TASK_NOT_FOUND').slots));
const famAnn = resolveError({ code: 'TEAM_TASK_NOT_FOUND', message: 'task missing' }, {}, dict);
check('码族可正常渲染短注解', renderShort(famAnn, makeT(dict.locales)).includes('团队'), renderShort(famAnn, makeT(dict.locales)));
check('全仓 188 个码里抽样 12 个都落不到 UNKNOWN',
  ['TEAM_MEMBER_LIMIT', 'GOAL_NOT_FOUND', 'BAD_INTENT', 'SESSION_REFERENCE_INVALID_CONFIG', 'ATTACHMENT_WEB_BLOCKED_URL'.replace('_WEB_BLOCKED_URL', '_STORAGE_FULL'), 'WEB_FETCH_TIMEOUT', 'SANDBOX_UNAVAILABLE', 'NO_ADAPTER', 'DECLINED', 'ACTIVATION_TEARDOWN_FAILED', 'INVALID_TOOL_OUTPUT', 'TEAM_MAILBOX_FULL']
    .every((c) => fam(c).entry.id !== 'UNKNOWN'), '有码落到 UNKNOWN');

console.log('=== 11. 独立码精确词条（不属任何码族） ===');
const exactCases = [
  ['INTERRUPTED', 'interrupted', '本轮已中止'],
  ['MAX_TOKENS', 'max.tokens', '输出长度达到上限'],
  ['ACCOUNT_SIGNED_OUT', 'account.signed.out', '账号已退出'],
  ['INVALID_CREDENTIAL', 'credential.invalid', '密钥格式不对'],
  ['IMAGE_OFFLOAD_REQUIRED', 'image.offload.required', '图片需要先转存'],
  ['NOT_RESUMABLE', 'session.not.resumable', '这个子任务无法续跑'],
];
for (const [code, id, title] of exactCases) {
  const r = matchEntry({ code, message: '' }, dict);
  check(`${code} → ${id}`, r.entry.id === id && r.matchedBy === 'code', JSON.stringify([r.entry.id, r.matchedBy]));
  const ann = resolveError({ code, message: '' }, {}, dict);
  check(`${code} 短注解含「${title}」`, renderShort(ann, makeT(dict.locales)).includes(title));
}
check('独立码不会被码族抢走（PI_AI_ERROR 有精确条目）', matchEntry({ code: 'PI_AI_ERROR', message: '' }, dict).matchedBy === 'code');

console.log('');
console.log(`=== RESULT: ${pass} passed, ${fail} failed ===`);
if (fail) { console.log('FAILURES:\n - ' + failures.join('\n - ')); process.exitCode = 1; }
