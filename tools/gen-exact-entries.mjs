// tools/gen-exact-entries.mjs — 生成「不属于任何码族」的独立码精确词条。
//
//   D:\node.exe D:\dsh-error-gloss\tools\gen-exact-entries.mjs
//
// 这些码各自含义不同，码族给不出有用的建议，必须一条一条写。
// 每条都带 source-template evidence（指向产出该码的官方包），不靠用户样本。
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'catalog', 'entries');
const ASAR = 'app.asar:/dsh/node_modules/@deepseek-ai';

/** 每条：id / code / 标题 / 释义 / 影响 / 严重度 / 可否重试 / 原因 / 建议 / 出处 */
const ENTRIES = [
  {
    id: 'interrupted', code: 'INTERRUPTED', pkg: 'dsh-client-ui-chat',
    title: '本轮已中止', summary: '这一轮被主动中止，模型输出停在这里。',
    causes: [{ text: '你点了停止，或客户端因切换会话/关闭窗口而中断了本轮', certainty: '确定', evidenceRef: 'E1' }],
    impact: '已经产出的内容保留；本轮后续的步骤不会执行。',
    actions: [['说一句「继续」让它接着做', '点按钮'], ['若本来就要停，忽略即可；已写出的内容已经落盘', '点按钮']],
    severity: 'warning', retryable: true,
  },
  {
    id: 'max.tokens', code: 'MAX_TOKENS', pkg: 'dsh-compaction-basic',
    title: '输出长度达到上限', summary: '模型单次能输出的 token 用完了，回复被截断。',
    causes: [
      { text: '单次输出上限（maxTokens）被写满', certainty: '确定', evidenceRef: 'E1' },
      { text: '一次要求产出过多内容（整份长文件、大表格、长代码）', certainty: '可能' },
    ],
    impact: '回复中途停止，后续步骤没有执行；上下文里已有部分内容。',
    actions: [['说「继续」让它接着写，沿用已产出部分', '点按钮'], ['把大任务拆成几步分别要', '点按钮'], ['在设置 → 模型里调大 maxTokens', '改配置']],
    severity: 'warning', retryable: true,
  },
  {
    id: 'account.signed.out', code: 'ACCOUNT_SIGNED_OUT', pkg: 'dsh-deepseek-account',
    title: '账号已退出', summary: '登录状态已失效，这次请求没有发出去。',
    causes: [{ text: '账号在别处退出、登录凭证过期，或本地凭证被清除', certainty: '确定', evidenceRef: 'E1' }],
    impact: '本轮停止；已有会话内容不会丢失。',
    actions: [['重新登录账号后重发这条消息', '点按钮'], ['到设置的账号页确认当前登录状态', '点按钮']],
    severity: 'error', retryable: true,
  },
  {
    id: 'account.signin.required', code: 'ACCOUNT_SIGN_IN_REQUIRED', pkg: 'dsh-deepseek-account',
    title: '需要先登录', summary: '这个操作要求已登录的账号，当前没有可用登录。',
    causes: [{ text: '从未登录，或登录已过期', certainty: '确定', evidenceRef: 'E1' }],
    impact: '该操作没有执行。',
    actions: [['登录账号后重试', '点按钮'], ['若只想用 API Key，改在设置 → 模型里配置', '改配置']],
    severity: 'error', retryable: true,
  },
  {
    id: 'credential.invalid', code: 'INVALID_CREDENTIAL', pkg: 'dsh-llm',
    title: '密钥格式不对', summary: '配了凭证，但格式不可用——不是缺，是写错了。',
    causes: [{ text: 'API Key 被截断、多了空格/换行，或复制了错误的字段', certainty: '确定', evidenceRef: 'E1' }],
    impact: '请求没有发出去；不会扣额度。',
    actions: [['到设置 → 模型重新粘贴完整 Key（注意首尾空格）', '改配置'], ['确认复制的是 API Key 而不是别的令牌', '点按钮']],
    severity: 'error', retryable: false,
  },
  {
    id: 'credential.missing', code: 'MISSING_CREDENTIAL', pkg: 'dsh-llm-pi-ai',
    title: '没有配置密钥', summary: '这个 provider 没有可用的 API Key。',
    causes: [{ text: '该 provider 从未配置 Key，或环境变量没有读到', certainty: '确定', evidenceRef: 'E1' }],
    impact: '请求没有发出去。',
    actions: [['在设置 → 模型里为该 provider 填 Key', '改配置'], ['换一个已经配好的 provider', '换模型']],
    severity: 'error', retryable: false,
  },
  {
    id: 'image.offload.required', code: 'IMAGE_OFFLOAD_REQUIRED', pkg: 'dsh-llm',
    title: '图片需要先转存', summary: '当前 provider 不接受内联图片，图片要先落成本地文件再引用。',
    causes: [{ text: '该 provider/模型只接受文件引用形式的图片，不接受随消息内联的图片数据', certainty: '确定', evidenceRef: 'E1' }],
    impact: '这次带图请求被拒；文字部分也没有发出去。',
    actions: [['让它先把图片保存到工作目录，再用路径引用', '点按钮'], ['换支持图片输入的模型重试', '换模型']],
    severity: 'warning', retryable: true,
  },
  {
    id: 'transport.timeout', code: 'TIMEOUT', pkg: 'dsh-llm',
    title: '请求超时', summary: '请求在限定时间内没有拿到响应。',
    causes: [
      { text: '网络或代理链路慢，响应还没回来就到点', certainty: '可能' },
      { text: 'provider 侧排队或负载高', certainty: '可能' },
    ],
    impact: '本轮没有结果；客户端会按退避策略重试。',
    actions: [['等它自动重试；一直超时就手动重发', '点按钮'], ['检查代理是否稳定（长响应容易被中转掐断）', '看日志']],
    severity: 'warning', retryable: true,
  },
  {
    id: 'provider.server', code: 'SERVER', pkg: 'dsh-llm',
    title: '模型服务端错误', summary: 'provider 返回了 5xx，属于对方服务故障。',
    causes: [{ text: '模型服务临时不可用或过载', certainty: '可能', requiresContext: ['provider.response'] }],
    impact: '本轮没有结果；本地没有出错。',
    actions: [['稍等重试（会自动退避）', '点按钮'], ['换一个 provider 或模型继续', '换模型']],
    severity: 'error', retryable: true,
  },
  {
    id: 'pi.ai.error', code: 'PI_AI_ERROR', pkg: 'dsh-llm-pi-ai',
    title: '模型适配器报错', summary: 'pi-ai 适配器把 provider 的异常包成了这条，具体原因在英文原文里。',
    causes: [{ text: '上游 provider 返回了适配器无法归类的错误', certainty: '需查' }],
    impact: '本轮停止；原始错误信息完整保留。',
    actions: [['看原文里的 provider 字段，通常直接写着原因', '看日志'], ['重试一次；重复出现就换模型', '换模型']],
    severity: 'error', retryable: true, assertion: 'forbidden',
  },
  {
    id: 'model.no.images', code: 'MODEL_DOES_NOT_SUPPORT_IMAGES', pkg: 'dsh-api-session-controller',
    title: '该模型不支持图片输入', summary: '当前模型是纯文本模型，带图的请求会被拒绝。',
    causes: [{ text: '所选模型的输入能力里没有 image', certainty: '确定', evidenceRef: 'E1' }],
    impact: '这条消息没有发出去。',
    actions: [['换成支持图片输入的模型', '换模型'], ['去掉图片，只发文字描述', '点按钮']],
    severity: 'error', retryable: false,
  },
  {
    id: 'image.type.unsupported', code: 'UNSUPPORTED_IMAGE_TYPE', pkg: 'dsh-attachment',
    title: '图片格式不支持', summary: '这个格式不在支持列表里，附件没有被接收。',
    causes: [{ text: '文件扩展名/内容不在允许的图片类型中（常见于 webp、heic、svg）', certainty: '确定', evidenceRef: 'E1' }],
    impact: '这张图片没有被带进对话。',
    actions: [['转成 PNG 或 JPG 后重新拖入', '点按钮'], ['只发文字，让模型用描述代替', '点按钮']],
    severity: 'warning', retryable: true,
  },
  {
    id: 'image.too.many', code: 'TOO_MANY_IMAGES', pkg: 'dsh-attachment',
    title: '图片数量超出上限', summary: '一次带的图片超过了允许的条数。',
    causes: [{ text: '单条消息的图片数量超过上限', certainty: '确定', evidenceRef: 'E1' }],
    impact: '这条消息没有被发送。',
    actions: [['分几批发，或先合并成一张长图', '点按钮'], ['挑最关键的几张先发', '点按钮']],
    severity: 'warning', retryable: true,
  },
  {
    id: 'session.not.resumable', code: 'NOT_RESUMABLE', pkg: 'dsh-subagent',
    title: '这个子任务无法续跑', summary: '续跑需要的上下文已经不在了。',
    causes: [
      { text: '创建该子任务的进程或会话已经结束', certainty: '确定', evidenceRef: 'E1' },
      { text: '续跑凭证过期', certainty: '可能' },
    ],
    impact: '这次续跑没有发生；之前产出的结果仍在。',
    actions: [['重新发起这个子任务（让它从当前状态再来一遍）', '点按钮'], ['让主任务直接重做这一步，别依赖旧续跑', '点按钮']],
    severity: 'warning', retryable: true,
  },
];

let n = 0;
for (const e of ENTRIES) {
  const entry = {
    id: e.id,
    code: e.code,
    templateId: '',
    title: e.title,
    summary: e.summary,
    causes: e.causes,
    impact: e.impact,
    actions: e.actions.map(([text, op]) => ({ text, op })),
    severity: e.severity,
    retryable: e.retryable,
    autoRecoverable: false,
    causeAssertion: e.assertion ?? (e.causes.some((c) => c.certainty === '确定') ? 'allowed' : 'conditional'),
    docRefs: [`${ASAR}/${e.pkg}/lib/index.js`],
    logRefs: ['~/.dsh/storages/session_projcache/sessions/{sessionId}.json'],
    match: { codeExact: e.code, priority: 90 },
    version: '0.1.0',
    evidence: [{
      kind: 'source-template',
      path: `${ASAR}/${e.pkg}/lib/index.js`,
      key: `"${e.code}"`,
      sample: `error.code = "${e.code}" / new HarnessError(…, "${e.code}")`,
      count: 1,
    }],
  };
  writeFileSync(join(OUT, `${e.id}.json`), JSON.stringify(entry, null, 2) + '\n', 'utf8');
  n += 1;
}
console.log(`已生成 ${n} 条独立码精确词条`);
