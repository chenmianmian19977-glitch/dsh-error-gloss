// src/demo.mjs — 演示：把截图那一屏的报错喂进引擎，打印实际会显示的内容。
import { loadDictionary } from './load.mjs';
import { resolveError, renderShort, renderDetail, makeT } from './resolve.mjs';
import { aggregateChain } from './chain.mjs';

const { dict } = loadDictionary();
const t = makeT(dict.locales);

console.log('════════ 截图第 1 条：上下文溢出 ════════');
const e1 = resolveError({ code: 'CONTEXT_WINDOW_EXCEEDED', message: 'pi-ai detected context overflow for model "trae-cn/deepseek-v4.1-flash"' }, {}, dict);
console.log('【气泡旁短注解】');
console.log(renderShort(e1, t));
console.log('\n【点开后的详情】');
console.log(renderDetail(e1, t));

console.log('\n════════ 截图第 2 条：压缩失败 ════════');
const e2 = resolveError({ message: 'compact · Compaction could not produce a useful summary. The attempt is recorded in the session log.' }, {}, dict);
console.log('【气泡旁短注解】');
console.log(renderShort(e2, t));

console.log('\n════════ 服务端自由文本：只给释义与建议 ════════');
const e3 = resolveError({ code: 'INVALID_REQUEST', status: 400, message: 'dsh: INVALID_REQUEST: 400: {"code":null,"message":"WorkBuddy AI: model [deep-model] service info not found","param":null,"type":"invalid_request_error"}' }, {}, dict);
console.log(renderShort(e3, t));
console.log('--- 详情 ---');
console.log(renderDetail(e3, t));

console.log('\n════════ 因果链聚合（两条截图报错其实是一条链） ════════');
const chain = aggregateChain([
  { type: 'turn/start', seq: 1, time: 1, data: { turn: 15 } },
  { type: 'manual-compaction', seq: 2, time: 2, data: { outcome: { text: 'Compaction could not produce a useful summary. The attempt is recorded in the session log.' } } },
  { type: 'turn/end', seq: 3, time: 3, data: { turn: 15, reason: { kind: 'error', error: { message: 'pi-ai detected context overflow for model "trae-cn/deepseek-v4.1-flash"', code: 'CONTEXT_WINDOW_EXCEEDED' } } } },
]);
console.log('根因：' + chain.rootCause);
console.log('建议：' + chain.suggestedActions.join(' / '));
